/** 把分析結果組成 render.js 吃的 custom：{ person, spots }。 */
import {
  faceSpot, neckFrame, placePerson, stickerRoll, stickerSize, toFrame,
} from "./geometry.js";
import { personLayer } from "./cutout.js";
import { bottomCut, edgeTouch } from "./pixels.js";
import { pruneSpikes } from "./matte.js";

/* 頭頂上比臉寬這麼多還細的東西剪掉（matte.js pruneSpikes）：窗框、燈桿這種被當成人的細條 */
const SPIKE_OF_FACE = 0.06;

/**
 * 每張臉一枚貼片，框座標（x 以框寬、y 以框高為 1，size 以框寬為 1）。
 * 脖子找不到露出的皮膚時（measure 的 spot 是 null）先放在理想點，讓使用者自己拖。
 */
export function spotsFor(analysis, metrics, position, place, frame) {
  const { width: w, height: h } = analysis;
  return analysis.faces.slice(0, metrics.faces.length).map((face, i) => {
    const measured = metrics.position === position ? metrics.faces[i].spot : null;
    const pt = measured
      ?? (position === "neck" ? neckFrame(face, w, h).ideal : faceSpot(face, position, w, h));
    const at = toFrame(pt, place, frame);
    return Object.freeze({
      x: at.x,
      y: at.y,
      size: (stickerSize(face) * place.scale) / frame.width,
      roll: stickerRoll(face, position),
    });
  });
}

/** 頭頂上方細細的假人像（原照片的窗框之類）剪掉，只看最高那張臉的額頭以上 */
function trimHead({ person, width: w, height: h }, faces) {
  const top = Math.min(...faces.map((f) => f.box.y0));
  const narrow = Math.min(...faces.map((f) => f.width));
  return pruneSpikes(person, w, h, Math.round(narrow * SPIKE_OF_FACE), top);
}

/**
 * @param {HTMLCanvasElement} photo 分析用的照片
 * @param outW 人物層輸出寬度，跟最後要畫的合照同寬
 */
export function composeSelfie(photo, analysis, metrics, position, frame, outW) {
  const faces = analysis.faces.slice(0, metrics.faces.length);
  const { width: w, height: h, person } = analysis;
  const touch = edgeTouch(person, w, h);
  // 下緣被桌子之類擋成一條平線：把那條線當成照片底邊，跟底邊被切到一樣推到框底，人才不會飄著
  const cut = touch.bottom ? null : bottomCut(person, w, h);
  const place = cut === null
    ? placePerson(faces, w, h, frame, touch)
    : placePerson(faces, w, cut + 1, frame, { ...touch, bottom: true });
  return {
    place,
    person: personLayer(photo, trimHead(analysis, faces), place, frame, outW),
    spots: spotsFor(analysis, metrics, position, place, frame),
  };
}
