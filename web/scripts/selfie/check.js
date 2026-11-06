/** 這張自拍合不合格、哪裡要調整。
 *
 * measure() 把 vision.js 的分析結果變成一組數字；review() 把數字變成給使用者看的提醒。
 * review() 是純函式，門檻要調就改 LIMITS，tests/selfie-check.test.mjs 會跟著驗。
 *
 * 兩種等級：
 *   block ＝ 這張做不出來，一定要換（找不到臉、側臉、人太多、臉太小）
 *   warn  ＝ 做得出來但效果會打折，讓使用者自己決定要不要換
 */
import { FACE_OVAL, faceSearch, neckFrame, stickerSize } from "./geometry.js";
import {
  CLASS, classFraction, edgeUncertainty, findFaceSpot, findNeck, meanIn, occlusion, sharpnessIn, shrink,
} from "./pixels.js";

/* 門檻。09-29 用 31 張測試照校正過，數字的由來寫在 design/selfie.md。 */
export const LIMITS = Object.freeze({
  maxFaces: 4,          // 10-02 Jimmy：三人以上的合照也要每個人都貼（以前最多兩個）
  yawBlock: 28,         // 左右轉超過這個角度＝側臉，臉上的點會估歪
  yawWarn: 16,
  pitchBase: 8,         // 正臉時模型量到的抬頭角度大約是 +8°，以它為中心
  pitchWarn: 18,
  facePxBlock: 70,      // 臉寬不到這麼多像素：放大到合照裡會糊成一片
  facePxWarn: 130,
  edgeMargin: 0.01,     // 臉碰到照片邊緣（被切到）
  darkBlock: 38,        // 臉的平均亮度（0～255）
  darkWarn: 72,
  blurWarn: 40,         // 拉普拉斯變異數，越低越糊
  occludedWarn: 0.12,   // 臉有一成多被手／衣服／背景蓋住
  clutterWarn: 0.2,     // 去背時分不清的邊緣，佔人物面積的比例
  spotSkinWarn: 0.55,   // 貼片位置露出的皮膚比例
  closeWarn: 0.62,      // 臉（兩人時是兩張臉加總）佔照片寬度的比例，太近就看不到場景
});

const FACE_POSITIONS = ["cheek", "under_eye", "forehead_side"];

/** 從分析結果量出所有數字。gray 是跟遮罩同尺寸的灰階圖。 */
export function measure(analysis, gray, position) {
  const { faces, cat, person, width: w, height: h } = analysis;
  const perFace = faces.slice(0, LIMITS.maxFaces).map((face) => {
    const poly = shrink(FACE_OVAL.map((i) => ({ x: face.lm[i].x * w, y: face.lm[i].y * h })), 0.86);
    const r = stickerSize(face) / 2;
    let spot = null;
    let spotSkin = 1;
    if (position === "neck") {
      spot = findNeck(cat, w, h, neckFrame(face, w, h), r);
    } else if (FACE_POSITIONS.includes(position)) {
      // 理想點被頭髮蓋住就在附近找；附近都找不到才維持理想點、提醒使用者
      const search = faceSearch(face, position, w, h);
      spot = findFaceSpot(cat, w, h, search, r) ?? search.ideal;
      spotSkin = classFraction(cat, w, h, spot, r, [CLASS.faceSkin, CLASS.bodySkin]);
    }
    const inner = {
      x0: face.center.x - face.width * 0.3, x1: face.center.x + face.width * 0.3,
      y0: face.center.y - face.height * 0.3, y1: face.center.y + face.height * 0.3,
    };
    const m = LIMITS.edgeMargin;
    return {
      yaw: face.yaw,
      pitch: face.pitch,
      widthPx: face.width,
      cropped: face.box.x0 < w * m || face.box.y0 < h * m
        || face.box.x1 > w * (1 - m) || face.box.y1 > h * (1 - m),
      brightness: meanIn(gray, w, h, inner),
      sharpness: sharpnessIn(gray, w, h, inner, face.width / 160),
      occluded: occlusion(cat, w, h, poly),
      spot,
      spotSkin,
    };
  });
  return {
    faceCount: faces.length,
    faces: perFace,
    faceShare: perFace.reduce((n, f) => n + f.widthPx, 0) / w,
    clutter: edgeUncertainty(person),
    position,
  };
}

const issue = (id, level, title, advice) => Object.freeze({ id, level, title, advice });

/** 同一種問題兩張臉都有的話只講一次 */
function uniq(list) {
  const seen = new Set();
  return list.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}

/** @returns {ReadonlyArray<{id,level,title,advice}>} 空陣列＝完全沒問題 */
export function review(metrics, limits = LIMITS) {
  if (metrics.faceCount === 0) {
    return [issue("no-face", "block", "找不到臉",
      "換一張臉比較大、正面朝鏡頭的照片。戴口罩或臉被遮住一大半也會認不出來。")];
  }
  if (metrics.faceCount > limits.maxFaces) {
    return [issue("too-many", "block", `照片裡有 ${metrics.faceCount} 個人`,
      "最多四個人。換一張人少一點的合照，或自己的自拍。")];
  }

  const list = [];
  for (const f of metrics.faces) {
    const yaw = Math.abs(f.yaw);
    if (yaw > limits.yawBlock) {
      list.push(issue("side", "block", "臉太側了",
        "要正臉面對鏡頭的照片，側臉的話貼片會對不準。"));
    } else if (yaw > limits.yawWarn) {
      list.push(issue("side-soft", "warn", "臉有點側",
        "可以做，但貼片位置可能偏一點。有更正面的照片效果會更好。"));
    }
    if (Math.abs(f.pitch - limits.pitchBase) > limits.pitchWarn) {
      list.push(issue("pitch", "warn", "頭抬太高或低太多",
        "下巴稍微收、平視鏡頭的照片最好貼。"));
    }
    if (f.widthPx < limits.facePxBlock) {
      list.push(issue("tiny", "block", "臉太小了",
        "人離鏡頭太遠，放進合照會糊掉。換一張近一點的自拍。"));
    } else if (f.widthPx < limits.facePxWarn) {
      list.push(issue("small", "warn", "臉有點小",
        "放大後可能不夠清楚。近一點的自拍會更好看。"));
    }
    if (f.cropped) {
      list.push(issue("cropped", "warn", "臉被照片邊緣切到",
        "整張臉都要在照片裡，被切掉的地方合照裡也會缺一塊。"));
    }
    if (f.brightness < limits.darkBlock) {
      list.push(issue("dark", "block", "太暗了",
        "臉幾乎看不清楚。換一張光線亮一點的照片。"));
    } else if (f.brightness < limits.darkWarn) {
      list.push(issue("dim", "warn", "光線有點暗",
        "做得出來，但合照裡的你會比背景暗。白天或室內燈下的照片最好。"));
    }
    if (f.sharpness < limits.blurWarn) {
      list.push(issue("blur", "warn", "照片有點糊",
        "可能手晃了或對焦沒對到。換一張清楚的，貼片貼上去才不會像浮在上面。"));
    }
    if (f.occluded > limits.occludedWarn) {
      list.push(issue("occluded", "warn", "臉被擋住了一部分",
        "手、頭髮或衣服蓋到臉的話，去背會缺一塊。露出整張臉的照片最好。"));
    }
    if (metrics.position === "neck" && !f.spot) {
      list.push(issue("neck-hidden", "warn", "脖子被擋住了",
        "高領、圍巾或頭髮把脖子蓋住了，找不到地方貼。可以改貼臉頰，或換一張露出脖子的照片。"));
    } else if (f.spotSkin < limits.spotSkinWarn) {
      list.push(issue("spot-hidden", "warn", "你選的位置被頭髮或眼鏡蓋住",
        "貼片可能會落在頭髮上，用手指拖到露出皮膚的地方就好。"));
    }
  }
  if (metrics.faceShare > limits.closeWarn) {
    list.push(issue("too-close", "warn", "照片拍得太近",
      "臉佔滿了整張照片，合照裡會看不太到場景。手機拿遠一點、拍到肩膀的自拍最好。"));
  }
  if (metrics.clutter > limits.clutterWarn) {
    list.push(issue("clutter", "warn", "背景有點雜",
      "去背的邊緣可能不乾淨。背景是牆壁、天空這種單純的顏色最好。"));
  }
  return uniq(list);
}

export function isBlocked(issues) {
  return issues.some((it) => it.level === "block");
}
