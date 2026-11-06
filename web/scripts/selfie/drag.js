/** 預覽裡的貼片可以用手指拖。自動定位再準也會有例外，讓使用者自己放最可靠。
   只重畫「底圖＋貼片」，不加顆粒和 Logo——拖的時候每一格都要重畫，要夠快。

   09-29 晚 Jimmy 回報：貼片很小，手指一壓上去就整個被擋住，看不到放在哪。
   照手機上成熟的兩個做法改：
   1. 相對拖曳（像筆電觸控板）：手指按在畫面任何地方，貼片跟著手指「移動的量」走，
      不會跳到手指底下。手指可以放在貼片旁邊或下面拖，貼片一直看得到。
   2. 放大鏡（Vogel & Baudisch 2007 的 Shift、iOS 選字的放大鏡）：拖的時候在照片的角落
      顯示貼片附近放大的樣子，細調時看得清楚。

   09-30 Jimmy 回報：手機上往下拖，整個網頁跟著被拉下來（iOS 的回彈、LINE 內建瀏覽器的下拉）。
   畫布的 touch-action: none 擋不住這兩種，要在 touchstart／touchmove 自己 preventDefault，
   而且監聽要設 passive: false，不然瀏覽器會忽略。

   09-30 專家報告（apple-design）之後：
   - 按在貼片上拖＝1:1 黏著手指；按在旁邊拖＝維持 0.6 倍的細調。
   - 貼片拖不出照片：超過邊界越拉越緊，放手彈回來，存出來的圖不會少半片。
   - 旋轉、還原、彈回都用彈簧，從畫面上目前的角度接著轉，連點不會吃掉。
   - 兩根手指：轉角度、縮放大小（自動大小的 0.7～1.4 倍）、一起移動。
   - 轉角度時旁邊短暫顯示角度，星星這種五角對稱的形狀才看得出有轉。
   - 放手吸附試過 demo，09-30 Jimmy 決定不留：會自己亂跑、跟「黏著手指」衝突。 */
import { drawSticker } from "../render.js";
import { createVelocity, isSettled, softClamp, springStep } from "../physics.js";
import {
  applyPinch, clampSpot, clearOf, pinchOf, spotBounds,
} from "./gesture.js";
import { createHistory, sameSpots } from "./history.js";

const PICK_CSS_PX = 44;             // 手指按在這個範圍內的貼片會被選到（兩個人時換一枚拖）
const DIRECT_CSS_PX = 34;           // 按在貼片中心這麼近以內＝直接抓住貼片，1:1 跟著手指
/* 按在旁邊拖的時候，貼片移動的量＝手指移動的量 × 這個值。1:1 的話手一動就跑過頭
   （盲測試了三次才放對），放慢一點比較好細調 */
const GAIN = 0.6;
const SLOP_CSS_PX = 6;              // 手指動超過這麼多才算開始拖，單點不會讓貼片抖一下
const OVERSHOOT = 0.14;             // 拉出邊界最多再多出去這麼多（框寬為 1），越拉越緊
const LOUPE = Object.freeze({ css: 116, zoom: 2.6 });
const ROLL_MAX = 180;               // roll 維持在 -180～180，存檔和測試比較好讀
const SPRING = Object.freeze({
  move: { damping: 1, response: 0.4 },      // 彈回邊界內
  rotate: { damping: 0.8, response: 0.4 },  // Apple 旋轉用的參數
  reset: { damping: 1, response: 0.35 },
});
const EPS = Object.freeze({ x: 0.0005, y: 0.0005, roll: 0.2, size: 0.0003 });
const BADGE_MS = 700;
/* 10-07 Jimmy：虛線圈一直在，看不清楚貼上去的效果。手指放開、按完按鍵之後停這麼久就淡掉；
   點照片以外的地方馬上淡掉。再碰貼片或按旋轉鍵又會出現 */
const RING_IDLE_MS = 2500;
const RING_FADE_MS = 250;
/* 自己加的貼片（10-06 Jimmy：合照裡想多貼幾枚）。最多加這麼多枚，再多就看不到臉了 */
export const MAX_EXTRA = 8;
/* 新加的那枚先放在哪：候選點裡離現有貼片最遠的那個（框座標），再讓使用者自己拖。
   下面兩成不放：左下角是「+ADD」膠囊，放那裡會被手指和膠囊擋住 */
const DROP_POINTS = Object.freeze([
  [0.5, 0.18], [0.22, 0.2], [0.78, 0.2], [0.18, 0.48], [0.82, 0.48],
  [0.36, 0.32], [0.64, 0.32], [0.3, 0.68], [0.7, 0.68], [0.5, 0.62],
]);

/* 垃圾桶（10-06 Jimmy）：多加的那幾枚拖到右下角的垃圾桶丟掉。看的是手指在不在垃圾桶上，
   不是貼片（按在旁邊拖時貼片只走 0.6 倍，跟手指不在同一點）。手指離垃圾桶邊緣這麼近也算 */
const BIN_PAD_CSS_PX = 14;
const BIN_FADE = Object.freeze({ alpha: 0.45, scale: 0.75 });   // 對準垃圾桶時，貼片變淡、縮小

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {HTMLCanvasElement} canvas 畫面上的預覽
 * @param {HTMLCanvasElement} base renderBase() 畫好的底圖
 * @param {{images: Record<string, HTMLImageElement>, shape: string}} art 四種造型的貼片圖、這一題答的造型。
 *   貼點有 shape 的（自己加的那幾枚）照自己的造型畫，沒有的照答案
 * @param {ReadonlyArray<{x,y,size,roll,shape?,extra?}>} initial 框座標
 * @param {(spots)=>void} onChange 放開手指、動畫停下來時回報新位置
 * @param {{bin?: HTMLElement, tray?: HTMLElement}} opts bin：垃圾桶，有多加的貼片才出現；拖過去放手、或點它，丟掉選到的那一枚。
 *   tray：左下角的「+ADD」膠囊，貼片放手時不能停在它底下
 */
export function createStage(canvas, base, art, initial, onChange, { bin = null, tray = null } = {}) {
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  const loupe = makeLoupe(canvas);
  const imageOf = (s) => art.images[s.shape] ?? art.images[art.shape];
  const ratioOf = (s) => imageOf(s).naturalHeight / imageOf(s).naturalWidth;
  let nextId = 0;
  // 每一枚有自己的 id，「上一步」才認得出哪一枚是後來加的、哪一枚被丟掉（id 不會傳出去）
  let start = initial.map(({ id: _, ...s }) => ({ ...s, id: nextId++ }));
  let target = start.map((s) => ({ ...s }));    // 放手之後要停在哪（對外回報這個）
  let shown = start.map((s) => ({ ...s }));     // 畫面上這一格畫在哪
  let motion = start.map(() => ({}));            // motion[i][prop] = { v, cfg }，有值＝正在動
  let selected = 0;
  let drag = null;
  let pinch = null;
  let badge = null;                              // { text, until }
  let ringAlpha = 1;                             // 虛線圈的透明度，0＝收起來
  let ringTimer = 0;
  let ringRaf = 0;
  let raf = 0;
  const history = createHistory();
  const origin = new Map(start.map((s) => [s.id, s]));   // 丟掉又救回來的那枚，大小百分比照它原本的算
  let gesture = null;                            // 這一次手指放上來之前的樣子；真的動了才記成一步
  const pointers = new Map();
  const velocity = createVelocity();

  const rect = () => canvas.getBoundingClientRect();
  const replace = (list, i, patch) => list.map((s, j) => (j === i ? { ...s, ...patch } : s));

  function draw() {
    ctx.drawImage(base, 0, 0);
    shown.forEach((s, i) => {
      if (!(drag?.over && i === selected)) {
        drawSticker(ctx, imageOf(s), s, canvas.width);
        return;
      }
      ctx.save();
      ctx.globalAlpha = BIN_FADE.alpha;
      drawSticker(ctx, imageOf(s), { ...s, size: s.size * BIN_FADE.scale }, canvas.width);
      ctx.restore();
    });
    // 驗收腳本靠這個找到貼片在哪裡；只有框座標，沒有照片內容。自己加的那幾枚多一欄造型
    canvas.dataset.spots = JSON.stringify(target.filter((s) => !s.gone).map(({ x, y, roll, size, shape }) => [+x.toFixed(4), +y.toFixed(4), Math.round(wrapRoll(roll)), +size.toFixed(4), ...(shape ? [shape] : [])]));
  }

  /** 選到的那一枚畫一圈虛線（只在預覽，不會進結果圖）。
     貼片很小，一打開找不到在哪；兩個人的時候也靠它看出在拖哪一枚。
     停手 RING_IDLE_MS 之後淡掉，才看得清楚貼上去的樣子（wakeRing／fadeRing）。 */
  function drawRing() {
    if (!shown.length || drag?.over || ringAlpha <= 0) return;
    const s = shown[selected];
    const r = s.size * canvas.width * 1.1;
    ctx.save();
    ctx.globalAlpha = ringAlpha;
    ctx.setLineDash([r * 0.35, r * 0.25]);
    ctx.lineWidth = Math.max(2, canvas.width * 0.004);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(s.x * canvas.width, s.y * canvas.height, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 貼片上方的小膠囊：角度（雙指時加大小）。最後 200ms 淡出 */
  function drawBadge(now) {
    if (!badge || now > badge.until || !shown.length) return;
    const s = shown[selected];
    const fs = Math.round(canvas.width * 0.036);
    const cx = s.x * canvas.width;
    const cy = Math.max(fs * 1.4, s.y * canvas.height - s.size * canvas.width * 1.1 - fs * 1.2);
    ctx.save();
    ctx.globalAlpha = Math.min(1, (badge.until - now) / 200);
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(badge.text).width + fs * 1.2;
    const h = fs * 1.7;
    ctx.fillStyle = "rgba(14,16,22,.78)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    else ctx.rect(cx - w / 2, cy - h / 2, w, h);      // iOS 15 以前沒有 roundRect
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge.text, cx, cy + fs * 0.05);
    ctx.restore();
  }

  function redraw(now = performance.now()) {
    syncBin();
    draw();
    drawRing();
    drawBadge(now);
    canvas.dataset.ring = ringAlpha > 0 && !drag?.over ? "on" : "off";   // 驗收腳本看虛線圈在不在
  }

  /** 虛線圈亮起來，停 RING_IDLE_MS 之後淡掉（手指還按著就不淡，放開時會再叫一次） */
  function wakeRing() {
    clearTimeout(ringTimer);
    cancelAnimationFrame(ringRaf);
    ringRaf = 0;
    const was = ringAlpha;
    ringAlpha = 1;
    ringTimer = setTimeout(fadeRing, RING_IDLE_MS);
    if (was < 1 && !raf) redraw();
  }

  function fadeRing() {
    clearTimeout(ringTimer);
    if (drag || pinch || ringAlpha <= 0 || ringRaf) return;
    if (reduced()) {
      ringAlpha = 0;
      redraw();
      return;
    }
    const from = performance.now();
    const step = (now) => {
      ringAlpha = Math.max(0, 1 - (now - from) / RING_FADE_MS);
      if (!raf) redraw();                        // 貼片還在彈的話，那邊每一格會畫
      ringRaf = ringAlpha > 0 ? requestAnimationFrame(step) : 0;
    };
    ringRaf = requestAnimationFrame(step);
  }

  /** 點了照片以外的地方：圈圈馬上淡掉。旋轉鍵、上一步也在照片外，但它們按完會再叫 wakeRing */
  function tapOutside(e) {
    if (e.target !== canvas) fadeRing();
  }

  function showBadge(withSize = false) {
    const s = target[selected];
    // roll 是逆時針為正；給人看的角度改成順時針為正，按 ↻ 數字才會往上加（盲測：按右轉卻顯示 -40°）
    const deg = `${Math.round(-wrapRoll(s.roll)) || 0}°`;
    const pct = `${Math.round((s.size / start[selected].size) * 100)}%`;
    badge = { text: withSize ? `${deg} · ${pct}` : deg, until: performance.now() + BADGE_MS };
    loop();
  }

  /* ── 彈簧：每一枚的 x、y、roll、size 各自一條（X、Y 分開，斜著彈才不會歪） ── */

  function animate(i, prop, to, cfg, v = null) {
    target = replace(target, i, { [prop]: to });
    if (reduced()) {
      shown = replace(shown, i, { [prop]: to });
      motion = replace(motion, i, { [prop]: undefined });
      loop();
      return;
    }
    const prev = motion[i][prop];
    motion = replace(motion, i, { [prop]: { v: v ?? prev?.v ?? 0, cfg } });
    loop();
  }

  function stop(i, props) {
    motion = replace(motion, i, Object.fromEntries(props.map((p) => [p, undefined])));
  }

  function loop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  let last = 0;
  function frame(now) {
    const dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    let moving = false;
    motion = motion.map((m, i) => Object.fromEntries(Object.entries(m).map(([prop, st]) => {
      if (!st) return [prop, undefined];
      const next = springStep({ x: shown[i][prop], v: st.v }, target[i][prop], st.cfg, dt);
      if (isSettled(next, target[i][prop], EPS[prop])) {
        shown = replace(shown, i, { [prop]: target[i][prop] });
        return [prop, undefined];
      }
      shown = replace(shown, i, { [prop]: next.x });
      moving = true;
      return [prop, { ...st, v: next.v }];
    })));
    redraw(now);
    if (drag) showLoupe();
    const badgeOn = badge && now <= badge.until;
    if (moving || badgeOn) {
      raf = requestAnimationFrame(frame);
      return;
    }
    raf = 0;
    last = 0;
    settle();
  }

  /** 全部停下來：角度收回 -180～180（轉的途中不收，不然會繞一圈），再回報 */
  function settle() {
    if (drag || pinch) return;
    prune();
    const wrapped = target.map((s) => ({ ...s, roll: wrapRoll(s.roll) }));
    const changed = wrapped.some((s, i) => s.roll !== target[i].roll);
    target = wrapped;
    if (changed) shown = shown.map((s, i) => ({ ...s, roll: wrapped[i].roll }));
    redraw();
    onChange(frozen());
  }

  const frozen = () => target.filter((s) => !s.gone).map(({ id: _, gone: __, ...s }) => Object.freeze({ ...s, roll: wrapRoll(s.roll) }));

  /* ── 上一步 ── */

  /** 現在的樣子（動畫停下來之後會停在哪） */
  const snap = () => target.filter((s) => !s.gone).map(({ id, x, y, roll, size }) => ({ id, x, y, roll, size }));
  const record = () => history.push(snap());

  /** 手指拖、兩指轉縮：真的動了才算一步，一次手勢（不管放上幾根手指）只算一步 */
  function logGesture() {
    if (!gesture || gesture.logged) return;
    history.push(gesture.before);
    gesture = { ...gesture, logged: true };
  }

  /* ── 手指 ── */

  /** 手指按下的地方離哪一枚最近；夠近才換選，不然繼續拖原本那一枚 */
  function pick(pt) {
    const r = rect();
    let best = selected;
    let bestD = PICK_CSS_PX;
    shown.forEach((s, i) => {
      if (target[i].gone) return;
      const d = Math.hypot(pt.x - (r.left + s.x * r.width), pt.y - (r.top + s.y * r.height));
      if (d < bestD) { best = i; bestD = d; }
    });
    return { index: best, dist: Math.hypot(pt.x - (r.left + shown[best].x * r.width), pt.y - (r.top + shown[best].y * r.height)) };
  }

  /** 半路抓住正在彈的貼片：從畫面上的位置接著拖 */
  function grab(i) {
    stop(i, ["x", "y", "roll", "size"]);
    target = replace(target, i, shown[i]);
  }

  function beginDrag(id, pt) {
    const { index, dist } = pick(pt);
    selected = index;
    grab(selected);
    const r = rect();
    const directPx = Math.max(DIRECT_CSS_PX, (shown[selected].size * r.width) / 2);
    drag = {
      id,
      start: pt,
      from: { x: shown[selected].x, y: shown[selected].y },
      gain: dist <= directPx ? 1 : GAIN,
      moved: false,
      over: false,
    };
    velocity.reset();
  }

  function beginPinch() {
    const [a, b] = [...pointers.values()];
    const p = pinchOf(a, b);
    selected = pick(p.mid).index;
    grab(selected);
    drag = null;
    loupe.hidden = true;
    pinch = { pinch: p, spot: { ...shown[selected] }, base: start[selected].size };
    logGesture();
  }

  function down(e) {
    if (!shown.length || pointers.size >= 2) return;
    e.preventDefault();
    if (!pointers.size) gesture = { before: snap(), logged: false };
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add("is-dragging");
    wakeRing();
    if (pointers.size === 2) beginPinch();
    else beginDrag(e.pointerId, { x: e.clientX, y: e.clientY });
    redraw();
  }

  function move(e) {
    if (!pointers.has(e.pointerId)) return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = rect();
    if (pinch) {
      const next = applyPinch(pinch, pinchOf(...pointers.values()), r);
      const b = spotBounds(next, ratioOf(next));
      const shownSpot = { ...next, x: softClamp(next.x, ...b.x, OVERSHOOT), y: softClamp(next.y, ...b.y, OVERSHOOT) };
      target = replace(target, selected, shownSpot);
      shown = replace(shown, selected, shownSpot);
      showBadge(true);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      // 過了門檻就從按下的地方算起，貼片才會一直在手指抓住的那個點底下
      if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < SLOP_CSS_PX) return;
      drag = { ...drag, moved: true };
      logGesture();
    }
    const raw = {
      x: drag.from.x + ((e.clientX - drag.start.x) * drag.gain) / r.width,
      y: drag.from.y + ((e.clientY - drag.start.y) * drag.gain) / r.height,
    };
    const b = spotBounds(shown[selected], ratioOf(shown[selected]));
    const at = { x: softClamp(raw.x, ...b.x, OVERSHOOT), y: softClamp(raw.y, ...b.y, OVERSHOOT) };
    velocity.add(at.x, at.y, e.timeStamp);
    target = replace(target, selected, at);
    shown = replace(shown, selected, at);
    const over = Boolean(target[selected].extra) && overBin({ x: e.clientX, y: e.clientY });
    if (over !== drag.over) {
      drag = { ...drag, over };
      if (over) navigator.vibrate?.(8);
    }
    redraw();
    if (over) loupe.hidden = true;
    else showLoupe();
  }

  function up(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!pointers.size) gesture = null;
    if (pinch) {
      pinch = null;
      release({ x: 0, y: 0 });
      // 兩指放掉一指：剩下那一指接著拖，不用重按
      const [id, pt] = [...pointers.entries()][0] ?? [];
      if (id !== undefined) beginDrag(id, pt);
      wakeRing();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const v = drag.moved ? velocity.read(e.timeStamp) : { x: 0, y: 0 };
    const dropped = drag.over;
    drag = null;
    canvas.classList.remove("is-dragging");
    loupe.hidden = true;
    if (dropped) discard(selected);
    else release(v);
    wakeRing();
  }

  /** 放手：在範圍外就帶著放手的速度彈回來 */
  function release(v) {
    const ratio = ratioOf(shown[selected]);
    const to = clearOf(clampSpot(shown[selected], ratio), ratio, trayBox());
    const cfg = SPRING.move;
    animate(selected, "x", to.x, cfg, v.x);
    animate(selected, "y", to.y, cfg, v.y);
    if (!pointers.size) canvas.classList.remove("is-dragging");
    loop();
  }

  /** 「+ADD」膠囊在框座標的位置；膠囊沒出現就是 null */
  function trayBox() {
    if (!tray || tray.hidden) return null;
    const r = rect();
    const t = tray.getBoundingClientRect();
    return { left: (t.left - r.left) / r.width, right: (t.right - r.left) / r.width, top: (t.top - r.top) / r.height };
  }

  /** 放大鏡放在照片離貼片最遠的那個角落：不蓋住貼片本身，也不在手指底下。 */
  function showLoupe() {
    const r = rect();
    const host = canvas.parentElement.getBoundingClientRect();
    const pad = 8;
    const s = shown[selected];
    const at = { x: r.left + s.x * r.width, y: r.top + s.y * r.height };
    const corners = [
      { x: r.left + pad, y: r.top + pad },
      { x: r.right - pad - LOUPE.css, y: r.top + pad },
      { x: r.left + pad, y: r.bottom - pad - LOUPE.css },
      { x: r.right - pad - LOUPE.css, y: r.bottom - pad - LOUPE.css },
    ];
    const far = (c) => Math.hypot(c.x + LOUPE.css / 2 - at.x, c.y + LOUPE.css / 2 - at.y);
    const spot = corners.reduce((a, c) => (far(c) > far(a) ? c : a));
    loupe.style.left = `${spot.x - host.left}px`;
    loupe.style.top = `${spot.y - host.top}px`;
    loupe.hidden = false;

    const lctx = loupe.getContext("2d");
    const k = canvas.width / r.width;                 // CSS px → 畫布 px
    const src = (LOUPE.css / LOUPE.zoom) * k;
    // 取景框停在照片裡：貼片拖到邊緣時，放大鏡不會有半邊是照片外的空白（09-30 二測）
    const sx = Math.min(canvas.width - src, Math.max(0, s.x * canvas.width - src / 2));
    const sy = Math.min(canvas.height - src, Math.max(0, s.y * canvas.height - src / 2));
    lctx.clearRect(0, 0, loupe.width, loupe.height);
    lctx.drawImage(canvas, sx, sy, src, src, 0, 0, loupe.width, loupe.height);
  }

  /* ── 按鈕 ── */

  /** 選到的那一枚轉 deg 度，逆時針為正（跟 roll 同方向）。目標一直往上加，連點不會漏 */
  function rotate(deg) {
    if (!shown.length || pinch) return;
    record();
    animate(selected, "roll", target[selected].roll + deg, SPRING.rotate);
    showBadge();
    wakeRing();
  }

  /** 多加一枚。從 0 長到跟臉上那幾枚一樣大，加完就選它（虛線圈），手指直接能拖。
     @returns 加上了沒有（到上限就不加） */
  function add(shape) {
    if (pinch || drag || target.filter((s) => s.extra && !s.gone).length >= MAX_EXTRA) return false;
    const faces = target.filter((s) => !s.extra);
    const size = faces.length ? faces.reduce((n, s) => n + s.size, 0) / faces.length : 0.06;
    const [x, y] = farthest(DROP_POINTS, target);
    record();
    const spot = { x, y, size, roll: 0, shape, extra: true, id: nextId++ };
    origin.set(spot.id, spot);
    start = [...start, spot];
    target = [...target, spot];
    shown = [...shown, { ...spot, size: reduced() ? size : 0 }];
    motion = [...motion, {}];
    selected = target.length - 1;
    if (!reduced()) animate(selected, "size", size, SPRING.reset);
    wakeRing();
    loop();
    return true;
  }

  /* ── 垃圾桶 ── */

  function overBin(pt) {
    if (!bin || bin.hidden) return false;
    const b = bin.getBoundingClientRect();
    return pt.x >= b.left - BIN_PAD_CSS_PX && pt.x <= b.right + BIN_PAD_CSS_PX
      && pt.y >= b.top - BIN_PAD_CSS_PX && pt.y <= b.bottom + BIN_PAD_CSS_PX;
  }

  /** 垃圾桶一直在（10-06 Jimmy），三段亮度：平常淡淡的；有多加的變明顯；拖著多加的那枚時全亮。手指對準時打開蓋子 */
  function syncBin() {
    if (!bin) return;
    bin.classList.toggle("has-extras", target.some((s) => s.extra && !s.gone));
    bin.classList.toggle("is-ready", Boolean(drag?.moved && target[selected]?.extra));
    bin.classList.toggle("is-over", Boolean(drag?.over));
  }

  /** 丟掉第 i 枚：縮小、飛進垃圾桶，停下來時（settle）才真的拿掉。臉上原本那幾枚不能丟 */
  function discard(i) {
    if (!target[i]?.extra || target[i].gone) return false;
    const r = rect();
    const b = bin?.getBoundingClientRect();
    const to = b
      ? { x: (b.left + b.width / 2 - r.left) / r.width, y: (b.top + b.height / 2 - r.top) / r.height }
      : target[i];
    target = replace(target, i, { gone: true });
    selected = 0;
    ["x", "y"].forEach((p) => animate(i, p, to[p], SPRING.reset));
    animate(i, "size", 0, SPRING.reset);
    replayBin("is-gulp");
    navigator.vibrate?.(12);
    return true;
  }

  function replayBin(name) {
    if (!bin) return;
    bin.classList.remove("is-gulp", "is-nope");
    void bin.offsetWidth;                        // 重新觸發 CSS 動畫
    bin.classList.add(name);
  }

  /** 丟掉的那幾枚動畫停了，從清單裡拿掉 */
  function prune() {
    const keep = target.map((s, i) => (s.gone ? -1 : i)).filter((i) => i >= 0);
    if (keep.length === target.length) return;
    const pickOut = (list) => keep.map((i) => list[i]);
    start = pickOut(start);
    target = pickOut(target);
    shown = pickOut(shown);
    motion = pickOut(motion);
    selected = Math.min(selected, target.length - 1);
  }

  /** 點垃圾桶：丟掉選到的那一枚（虛線圈那枚）。選到的是臉上原本的，垃圾桶搖一下 */
  function tapBin() {
    if (drag || pinch) return;
    if (!target[selected]?.extra || target[selected].gone) {
      replayBin("is-nope");
      return;
    }
    record();
    discard(selected);
  }

  /** 臉上那幾枚回到自動找的位置、角度和大小。自己加的那幾枚原地不動（10-06 Jimmy：要丟用垃圾桶） */
  function reset() {
    record();
    start.forEach((s, i) => {
      if (s.extra) return;
      ["x", "y", "roll", "size"].forEach((p) => {
        // 角度走最短的那一邊回去
        const to = p === "roll" ? shown[i].roll + wrapRoll(s.roll - shown[i].roll) : s[p];
        animate(i, p, to, SPRING.reset);
      });
    });
  }

  /** 回復上一步：每一枚彈回上一步的位置。上一步之後才加的縮掉，上一步之後丟掉的長回來。
     @returns 有沒有上一步（沒有的話機身閃橘燈，在 camedit.js） */
  function undo() {
    if (drag || pinch) return false;
    const now = snap();
    let prev = history.pop();
    while (prev && sameSpots(prev, now)) prev = history.pop();   // 沒動到的那幾步跳過
    if (!prev) return false;
    const keep = new Set(prev.map((s) => s.id));
    target.forEach((s, i) => {
      if (s.gone || keep.has(s.id)) return;
      target = replace(target, i, { gone: true });
      animate(i, "size", 0, SPRING.reset);
    });
    const was = new Map(now.map((s) => [s.id, s]));
    prev.forEach((s) => restoreSpot(s));
    // 選到變動的那一枚（虛線圈跟著跑過去，看得出剛剛回復了哪一枚）
    const changed = prev.find((s) => !was.has(s.id) || !sameSpots([s], [was.get(s.id)]));
    const at = changed ? target.findIndex((t) => t.id === changed.id) : -1;
    selected = at >= 0 ? at : Math.max(0, target.findIndex((t) => !t.gone));
    wakeRing();
    loop();
    return true;
  }

  function restoreSpot(s) {
    let i = target.findIndex((t) => t.id === s.id);
    if (i < 0) {                                  // 丟掉的已經拿掉了：從 0 長回來
      const base = origin.get(s.id);
      const spot = { ...base, ...s, gone: false };
      start = [...start, base];
      target = [...target, { ...spot, size: 0 }];
      shown = [...shown, { ...spot, size: 0 }];
      motion = [...motion, {}];
      i = target.length - 1;
    } else if (target[i].gone) {
      target = replace(target, i, { gone: false });
    }
    ["x", "y", "roll", "size"].forEach((p) => {
      const to = p === "roll" ? shown[i].roll + wrapRoll(s.roll - shown[i].roll) : s[p];
      animate(i, p, to, SPRING.reset);
    });
  }

  const blockScroll = (e) => { if (e.cancelable) e.preventDefault(); };
  const touch = { passive: false };
  canvas.addEventListener("touchstart", blockScroll, touch);
  canvas.addEventListener("touchmove", blockScroll, touch);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  bin?.addEventListener("click", tapBin);
  document.addEventListener("pointerdown", tapOutside, true);
  redraw();
  wakeRing();                                    // 一打開先亮著，讓人找到貼片在哪

  return {
    spots: frozen,
    rotate,
    reset,
    undo,
    add,
    extras: () => target.filter((s) => s.extra && !s.gone).length,
    destroy() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(ringRaf);
      clearTimeout(ringTimer);
      document.removeEventListener("pointerdown", tapOutside, true);
      canvas.removeEventListener("touchstart", blockScroll, touch);
      canvas.removeEventListener("touchmove", blockScroll, touch);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      bin?.removeEventListener("click", tapBin);
      bin?.classList.remove("is-ready", "is-over", "has-extras");
      loupe.remove();
    },
  };
}

/** 候選點裡，離現有貼片最近的距離最大的那一個 */
export function farthest(points, spots) {
  const gap = ([x, y]) => Math.min(Infinity, ...spots.map((s) => Math.hypot(s.x - x, (s.y - y) * 1.25)));
  return points.reduce((best, p) => (gap(p) > gap(best) ? p : best));
}

export function wrapRoll(deg) {
  const r = ((deg + ROLL_MAX) % 360 + 360) % 360 - ROLL_MAX;
  return r === -ROLL_MAX ? ROLL_MAX : r;
}

function makeLoupe(canvas) {
  canvas.parentElement.querySelector(".selfie__loupe")?.remove();
  const el = document.createElement("canvas");
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  el.className = "selfie__loupe";
  el.width = Math.round(LOUPE.css * dpr);
  el.height = el.width;
  el.style.width = `${LOUPE.css}px`;
  el.style.height = `${LOUPE.css}px`;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  canvas.parentElement.append(el);
  return el;
}
