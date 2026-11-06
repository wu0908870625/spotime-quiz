/** 自拍的整個流程：挑照片說明 → 分析 → 檢查結果 → 校正貼片位置。
 *
 * 三個入口（mode）：
 *   early   openEarly()   開場選「用我的自拍」。只檢查照片本身（臉、角度、光線⋯），
 *                         按「就用這張」之後馬上去背，相機螢幕上的人換成他（onPreview）。
 *   adjust  adjust()      作答中選完位置之後。直接進拖曳預覽，校正完才進下一題——
 *                         結果頁是成果展示，不在那裡才讓人調（09-29 晚 Jimmy 回報）。
 *   result  open()        結果頁的「換成我的自拍」，給一開始選預設合照、後來才想換的人。
 *                         10-02 Jimmy：照片過了之後要多一步「調整造型貼位置」（tune），
 *                         不然貼片直接帶進去，少了自己動手修的那一段。
 */
import { renderBase, stickerImages } from "../render.js";
import { backdropLayer, placeBackdrop } from "./backdrop.js";
import { isBlocked, measure, review } from "./check.js";
import { composeSelfie, spotsFor } from "./compose.js";
import { relightLayer } from "./relight.js";
import { createStage } from "./drag.js";
import { createSheetDrag } from "./sheet.js";
import { readPhoto } from "./photo.js";
import { dropSelfie, hasKeptSelfie, keepSelfie, sweepSelfies, takeSelfie } from "./resume.js";
import { toGray } from "./pixels.js";
import { analyze, loadVision } from "./vision.js";

const LAYER_WIDTH = 1080;       // 人物層跟最後的合照同寬
const PREVIEW_WIDTH = 720;      // 拖曳預覽不用那麼大，重畫才順
const POSITIONS = Object.freeze(["cheek", "under_eye", "forehead_side", "neck"]);
/* 背景兩種（10-06 Jimmy）：scene＝去背換場景（預設）、photo＝換成原本照片的背景。
   兩種的人物在框裡的位置不一樣，所以貼點、調過的位置各記一份（looks[bg]） */
const BGS = Object.freeze(["scene", "photo"]);

const ROTATE_STEP = 15;         // 按一下轉幾度
// 10-02 Jimmy：「位置 OK，下一題」改「修圖完成~進下一題」
const DONE_LABEL = Object.freeze({ early: "就用這張，開始測驗", adjust: "修圖完成~進下一題", result: "就用這張", tune: "修圖完成" });
const TUNE_TITLE = "調整造型貼位置";
const HINT = Object.freeze({
  // 10-02 盲測第 4 點：「按旁邊慢慢推」看不懂「旁邊」是哪、按了也沒反應（要按住拖才會動）
  adjust: "按住貼片拖曳；在貼片旁邊拖可以微調，兩指能轉、縮放。",
  result: "按住貼片拖曳；在貼片旁邊拖可以微調，兩指能轉、縮放。",
});

/**
 * @param els 見 main.js
 * @param manifest layers.json
 * @param {() => ({scene,shape,position}|null)} currentAnswers 結果頁目前的答案
 * @param {(custom, position) => Promise<void>} onApply 結果頁按「就用這張」
 * @param {(selfie|null) => void} onPreview 相機螢幕換人：{ person: 網址, persons: {[scene]: 打好光的網址}, spots: {[position]: spots} }
 */
export function createSelfieFlow({ els, manifest, currentAnswers, onApply, onPreview }) {
  let mode = "result";
  let answers = null;
  let position = null;
  let job = null;               // 目前這張照片的分析結果（還沒按「就用這張」）
  let accepted = null;          // 開場挑好的照片：去背好的人物層＋每個位置的貼點
  let settle = null;            // 面板關掉時通知呼叫端繼續
  let stage = null;
  let loaded = false;
  let tuning = false;           // 結果頁：照片檢查過了、正在調貼片位置
  let bg = "scene";             // 使用者選的背景；開場按「就用這張」時記進 accepted.bg

  sweepSelfies();

  function step(name) {
    els.panel.querySelectorAll("[data-step]").forEach((el) => {
      el.hidden = el.dataset.step !== name;
    });
    els.skip.hidden = mode !== "early" || name === "busy";
    els.panel.scrollTop = 0;
  }

  /** 下載進度條。guide 和 busy 兩個畫面各有一條，同步更新。 */
  function meter(ratio) {
    const k = Math.min(1, Math.max(0, ratio));
    [els.meter, els.busyMeter].forEach((el) => el.style.setProperty("--k", k.toFixed(3)));
  }

  function warm() {
    if (loaded) {
      els.prep.hidden = true;
      return;
    }
    els.prep.hidden = false;
    els.prep.dataset.state = "loading";
    els.progress.textContent = "正在準備辨識工具，第一次要等幾秒";
    loadVision((r) => meter(r)).then(() => {
      loaded = true;
      meter(1);
      els.prep.dataset.state = "ready";
      els.progress.textContent = "辨識工具準備好了";
    }).catch((error) => {
      console.error("辨識工具載入失敗", error);
      els.prep.dataset.state = "failed";
      els.progress.textContent = "辨識工具下載失敗。確認網路之後，再選一次照片會自動重試。";
    });
  }

  function show(name) {
    els.root.hidden = false;
    document.body.classList.add("is-selfie-open");
    els.done.textContent = DONE_LABEL[mode];
    els.done.hidden = false;
    // 校正畫面沒有 ×：× 一般的意思是「取消」，這裡卻是「記住位置、下一題」（09-30 專家 M5）。
    // 要離開就按「修圖完成」或把面板往下滑，兩個都會記住拖到哪。
    els.close.hidden = mode === "adjust";
    sheet.reset();
    step(name);
    (mode === "adjust" ? els.done : els.close).focus({ preventScroll: true });
  }

  function waitClose() {
    return new Promise((resolve) => { settle = resolve; });
  }

  /** 開場入口。回傳的 Promise 在面板關掉時 resolve：
     false＝按 × 或往下滑（取消，回到開場題自己再選一次），true＝挑好照片或選了預設合照
     @param fresh 再測一次時選「換一張自拍照」：上次那張丟掉，從挑照片開始 */
  async function openEarly({ fresh = false } = {}) {
    if (!fresh) await restoring;       // 開網頁時正在放回自拍：等它好，不要重讀一次
    mode = "early";
    answers = null;
    position = null;
    els.ruleNeck.hidden = true;
    els.again.hidden = false;
    // 按「再測一次」前挑過自拍：直接放回上次做好的成品，不用再上傳、也不用再辨識（10-02 Jimmy）
    if (fresh) forget();
    if (!fresh && accepted) return Promise.resolve(true);   // 開網頁時已經放回去了（restoreKept）
    const closed = waitClose();
    if (!fresh && hasKeptSelfie()) {
      show("busy");
      reuse();
    } else {
      show("guide");
      warm();
    }
    return closed;
  }

  /** 讀回暫存的成品，相機螢幕換成這個人。讀不出來就丟出錯誤 */
  async function loadKept() {
    const record = await takeSelfie();
    if (!record) throw new Error("沒有暫存的自拍");
    const url = URL.createObjectURL(record.person);
    els.thumb.src = url;
    const person = await blobToCanvas(record.person);
    const lit = await litUrls(person);
    const backdrop = record.backdrop ? await blobToCanvas(record.backdrop) : null;
    // 10-06 以前存的只有去背版（auto、tuned），沒有 looks
    const looks = record.looks ?? { scene: { auto: record.auto, tuned: record.tuned ?? {} } };
    release(accepted);
    accepted = {
      person, url, lit, backdrop, backdropUrl: backdrop ? URL.createObjectURL(record.backdrop) : null,
      looks, bg: backdrop && record.bg === "photo" ? "photo" : "scene",
    };
    bg = accepted.bg;
    syncBg();
    pushPreview();
  }

  /** 開網頁時呼叫（10-02 盲測第 3 點：再測一次時開場螢幕還是範例照片，以為自拍沒被記住）：
     這個分頁存過自拍的話，先默默放回去，開場的相機螢幕就是自己的臉。
     放不回去也不吵，按「沿用」時會再試一次、失敗才請他重選 */
  let restoring = null;
  function restoreKept() {
    if (!hasKeptSelfie()) return Promise.resolve(false);
    restoring = loadKept().then(() => true, (error) => {
      console.warn("開場放回自拍失敗，等按「沿用」再試", error);
      return false;
    });
    return restoring;
  }

  /** 不用自拍了（選範例照片、或換一張）：暫存丟掉，相機螢幕換回範例 */
  function forget() {
    dropSelfie();
    if (!accepted) return;
    release(accepted);
    accepted = null;
    pushPreview();
  }

  /** 沿用上次做好的自拍：人物層、貼點、調過的位置都直接放回去 */
  async function reuse() {
    els.busyMeterWrap.hidden = true;
    els.busy.textContent = "沿用剛才的自拍⋯";
    try {
      await loadKept();
      close();
    } catch (error) {
      console.error("沿用自拍失敗，改成重新選照片", error);
      dropSelfie();
      step("guide");
      // 背景先把辨識工具載起來，但不用 warm()：它載完會把下面這句說明蓋成「辨識工具準備好了」
      loadVision((r) => meter(r)).then(() => { loaded = true; }).catch((e) => console.warn("辨識工具預載失敗", e));
      els.prep.hidden = false;
      els.prep.dataset.state = "failed";
      els.progress.textContent = "剛才那張自拍讀不出來，麻煩再選一次。";
    }
  }

  /** 重新測驗前呼叫：有用過自拍就把做好的成品存起來。
     開場挑的照片存 accepted；結果頁才換的照片（job 套用過）現場算一份一樣格式的。 */
  async function keep() {
    let kept = accepted;
    if (!kept && job?.spotsFor) {
      // 結果頁才換的照片：現場做一份跟開場一樣格式的，調過的位置記在當時選的背景底下
      const made = cutout(job);
      const look = made.looks[job.bg];
      kept = { ...made, bg: job.bg, looks: { ...made.looks, [job.bg]: { ...look, tuned: { [job.spotsFor]: job.spots } } } };
    }
    if (!kept) return;
    try {
      await keepSelfie({
        person: await toBlob(kept.person),
        backdrop: kept.backdrop ? await toBlob(kept.backdrop, "image/jpeg") : null,
        looks: kept.looks,
        bg: kept.bg,
      });
    } catch (error) {
      console.warn("自拍存不起來，重新測驗要再上傳一次", error);
    }
  }

  /** 作答中選完位置：校正貼片。沒挑自拍的人直接略過。 */
  function adjust(done) {
    if (!accepted) return Promise.resolve(false);
    mode = "adjust";
    answers = done;
    position = done.position;
    const { position: actual, spots } = pickSpots(done.position);
    show("review");
    els.cheek.hidden = true;
    els.again.hidden = true;
    els.bg.hidden = true;
    els.hint.hidden = false;
    els.hint.textContent = HINT.adjust;
    renderNote(actual !== done.position
      ? "脖子被衣領或頭髮擋住了，先幫你貼在臉頰。想貼回脖子可以自己拖過去。"
      : "");
    buildStage(lookOf(accepted), done.scene, done.shape, spots)
      .catch((error) => console.error("校正畫面出錯", error));
    return waitClose();
  }

  function open() {
    mode = "result";
    answers = currentAnswers();
    if (!answers) return;
    position = answers.position;
    els.ruleNeck.hidden = position !== "neck";
    els.again.hidden = false;
    if (job?.analysis) {
      show("review");
      showReview().catch((error) => console.error("自拍預覽出錯", error));
      return;
    }
    show("guide");
    warm();
  }

  /** @param cancelled 按 × 或往下滑。開場時＝不替他決定，回到開場題 */
  function close(cancelled = false) {
    setTuning(false);
    els.root.hidden = true;
    els.tools.hidden = true;
    document.body.classList.remove("is-selfie-open");
    if (mode === "adjust") remember();
    stage?.destroy();
    stage = null;
    if (settle) {
      settle(!(cancelled && mode === "early" && !accepted));
      settle = null;
      return;
    }
    els.open.focus({ preventScroll: true });
  }

  /** × 和往下滑：校正畫面＝記住位置、下一題（跟按 OK 一樣）；其他＝取消 */
  function dismiss() {
    if (mode === "adjust") apply();
    else close(true);
  }

  /** 校正畫面關掉（按 OK 或 ×）都算數：拖到哪就記到哪 */
  function remember() {
    if (!stage || !accepted) return;
    const look = accepted.looks[accepted.bg];
    accepted = { ...accepted, looks: { ...accepted.looks, [accepted.bg]: { ...look, tuned: { ...look.tuned, [position]: stage.spots() } } } };
    pushPreview();
  }

  async function pick(file) {
    stage?.destroy();
    stage = null;
    step("busy");
    els.busyMeterWrap.hidden = loaded;      // 還在等辨識工具下載，才顯示進度條
    els.busy.textContent = loaded ? "正在看這張照片⋯" : "第一次要先準備辨識工具⋯";
    try {
      const photo = await readPhoto(file);
      els.thumb.src = photo.toDataURL("image/jpeg", 0.7);
      await loadVision((r) => meter(r));
      loaded = true;
      els.busyMeterWrap.hidden = true;
      els.busy.textContent = "正在看這張照片⋯";
      await nextFrame();                       // 讓文字先換上去，分析會卡住主執行緒約半秒
      const analysis = await analyze(photo);
      const ctx = photo.getContext("2d");
      const gray = toGray(ctx.getImageData(0, 0, photo.width, photo.height).data, photo.width, photo.height);
      // 開場不給選背景：新照片一律先走 SPOTIME 場景，之前選過保留背景也不帶過來
      if (mode === "early") {
        bg = "scene";
        syncBg();
      }
      job = { photo, analysis, gray, bg };
      await showReview();
    } catch (error) {
      console.error("自拍分析失敗", error);
      step("guide");
      els.prep.hidden = false;
      els.prep.dataset.state = "failed";
      els.progress.textContent = error instanceof Error && /[一-鿿]/.test(error.message)
        ? error.message
        : "這張照片分析失敗了，換一張試試。";
    }
  }

  async function showReview() {
    const { photo, analysis, gray } = job;
    const metrics = measure(analysis, gray, position);
    const issues = review(metrics);
    const blocked = isBlocked(issues);
    job = { ...job, metrics, issues };

    setTuning(false);
    els.done.hidden = blocked;
    els.hint.hidden = blocked || mode === "early";
    els.hint.textContent = HINT.result;
    els.again.classList.toggle("btn--primary", blocked);
    els.again.classList.toggle("btn--ghost", !blocked);
    els.cheek.hidden = !issues.some((it) => it.id === "neck-hidden");
    // 10-06 Jimmy：要大家優先走 SPOTIME 場景。開場還沒看到去背效果，不給選；
    // 到相機上修圖看到去背成果，覺得不好才用那裡的「換成原本照片的背景」
    els.bg.hidden = blocked || mode === "early";
    renderVerdict(issues, blocked);

    // 開場還不知道場景，只給看照片本身；擋下的照片也一樣
    if (blocked || mode === "early") {
      drawPhoto(photo);
    } else {
      const composed = job.bg === "photo"
        ? job.framed ?? frameBackdrop(job)
        : job.composed ?? composeSelfie(photo, analysis, metrics, position, manifest.frame, LAYER_WIDTH);
      const spots = job.spotsFor === position && job.spotsBg === job.bg
        ? job.spots
        : spotsFor(analysis, metrics, position, composed.place, manifest.frame);
      job = job.bg === "photo" ? { ...job, framed: composed } : { ...job, composed };
      await buildStage(composed, answers.scene, answers.shape, spots);
      // 結果頁先只看照片檢查結果，按「就用這張」才進調位置（setTuning）
      if (mode === "result") lockStage(true);
    }
    step("review");
  }

  /** 結果頁的兩段：檢查照片（看得到貼片、還不能拖）→ 調整造型貼位置（可以拖、轉，按「修圖完成」才套用） */
  function setTuning(on) {
    tuning = on;
    if (!on) {
      lockStage(false);
      return;
    }
    lockStage(false);
    els.tools.hidden = false;
    els.hint.hidden = true;               // 說明改放在標題下面（標題在上、說明在下才順）
    els.again.hidden = true;
    els.cheek.hidden = true;
    els.bg.hidden = true;
    els.done.textContent = DONE_LABEL.tune;
    const head = document.createElement("p");
    head.className = "selfie__head";
    head.textContent = TUNE_TITLE;
    const how = document.createElement("p");
    how.className = "selfie__note";
    how.textContent = HINT.result;
    els.verdict.replaceChildren(head, how);
    els.panel.scrollTop = 0;
  }

  /** 檢查照片那一段：工具、拖曳先關掉 */
  function lockStage(on) {
    els.canvas.closest(".selfie__stage")?.classList.toggle("is-locked", on);
    if (on) {
      els.tools.hidden = true;
      els.hint.hidden = true;
    }
  }

  /** @param look { person } 去背版，或 { backdrop } 保留原本背景 */
  async function buildStage(look, scene, shape, spots) {
    stage?.destroy();
    stage = await stageOn(els.canvas, look, scene, shape, spots);
    els.tools.hidden = false;
  }

  async function stageOn(canvas, look, scene, shape, spots, opts = {}) {
    const [base, images] = await Promise.all([
      renderBase(manifest, scene, PREVIEW_WIDTH, look.person ?? null, look.backdrop ?? null),
      stickerImages(manifest),
    ]);
    return createStage(canvas, base, { images, shape }, spots, () => {}, opts);
  }

  /** accepted 目前選的那一種背景要畫什麼 */
  function lookOf(done) {
    return done.bg === "photo" && done.backdrop ? { backdrop: done.backdrop } : { person: done.person };
  }

  /** 結果頁換照片、選保留原本背景：照片裁成框的比例 */
  function frameBackdrop({ photo, analysis }) {
    const place = placeBackdrop(analysis.faces.slice(0, 4), photo.width, photo.height, manifest.frame);
    return { place, backdrop: backdropLayer(photo, place, manifest.frame, LAYER_WIDTH) };
  }

  /** 背景的兩個按鈕跟著 bg 亮 */
  function syncBg() {
    els.bg.querySelectorAll("[data-bg]").forEach((btn) => {
      btn.setAttribute("aria-checked", String(btn.dataset.bg === bg));
    });
  }

  function chooseBg(next) {
    if (!BGS.includes(next) || next === bg) return;
    bg = next;
    syncBg();
    if (!job) return;
    job = { ...job, bg };
    // 結果頁換照片：預覽馬上換；開場還沒有場景，只記下來
    if (mode === "result" && job.metrics && !isBlocked(job.issues)) {
      showReview().catch((error) => console.error("換背景失敗", error));
    }
  }

  function drawPhoto(photo) {
    stage?.destroy();
    stage = null;
    els.tools.hidden = true;
    els.canvas.width = photo.width;
    els.canvas.height = photo.height;
    els.canvas.getContext("2d").drawImage(photo, 0, 0);
  }

  function renderNote(text) {
    if (!text) { els.verdict.replaceChildren(); return; }
    const p = document.createElement("p");
    p.className = "selfie__note";
    p.textContent = text;
    els.verdict.replaceChildren(p);
  }

  function renderVerdict(issues, blocked) {
    const head = document.createElement("p");
    head.className = "selfie__head";
    if (!issues.length) {
      head.textContent = "這張很適合！";
      head.dataset.tone = "ok";
      els.verdict.replaceChildren(head);
      return;
    }
    head.textContent = blocked ? "這張做不出來，換一張吧：" : "可以用，不過有幾點要注意：";
    head.dataset.tone = blocked ? "block" : "warn";
    const list = document.createElement("ul");
    list.className = "selfie__issues";
    issues.forEach((it) => {
      const li = document.createElement("li");
      li.dataset.level = it.level;
      const b = document.createElement("b");
      b.textContent = it.title;
      const p = document.createElement("span");
      p.textContent = it.advice;
      li.append(b, p);
      list.append(li);
    });
    els.verdict.replaceChildren(head, list);
  }

  /**
   * 開場按「就用這張」：去背一次（跟位置無關），四個位置的貼點也先算好。
   * 相機螢幕馬上換成他自己，之後每一題都看得到。
   */
  async function accept() {
    step("busy");
    els.busyMeterWrap.hidden = true;
    els.busy.textContent = "正在幫你去背⋯";
    await nextFrame();
    const made = cutout(job);
    const url = URL.createObjectURL(await toBlob(made.person));
    const lit = await litUrls(made.person);
    const backdropUrl = URL.createObjectURL(await toBlob(made.backdrop, "image/jpeg"));
    release(accepted);
    accepted = { ...made, url, lit, backdropUrl, bg: job.bg ?? bg };
    pushPreview();
  }

  /** 去背一次（跟位置無關）＋原照裁好的背景，兩種各算四個位置的自動貼點 */
  function cutout({ photo, analysis, gray }) {
    const base = measure(analysis, gray, null);
    const { person, place } = composeSelfie(photo, analysis, base, "cheek", manifest.frame, LAYER_WIDTH);
    const framed = frameBackdrop({ photo, analysis });
    const autoOf = (at) => Object.fromEntries(POSITIONS.map((p) => [p, autoSpots(analysis, gray, p, at)]));
    return {
      person,
      backdrop: framed.backdrop,
      looks: { scene: { auto: autoOf(place), tuned: {} }, photo: { auto: autoOf(framed.place), tuned: {} } },
    };
  }

  /** 相機螢幕上每個場景各用一張打好光的人物層（沒選場景時用沒打光的 url） */
  async function litUrls(person) {
    const entries = await Promise.all(Object.entries(manifest.scenes).map(async ([key, scene]) => [
      key, URL.createObjectURL(await toBlob(relightLayer(person, key, scene.lighting))),
    ]));
    return Object.fromEntries(entries);
  }

  function release(done) {
    if (!done) return;
    URL.revokeObjectURL(done.url);
    if (done.backdropUrl) URL.revokeObjectURL(done.backdropUrl);
    Object.values(done.lit ?? {}).forEach((u) => URL.revokeObjectURL(u));
  }

  /** 某個位置的自動貼點。脖子被高領蓋住的話改貼臉頰，相紙下面的圖說會跟著變成 CHEEK。 */
  function autoSpots(analysis, gray, want, place) {
    let actual = want;
    let metrics = measure(analysis, gray, want);
    if (review(metrics).some((it) => it.id === "neck-hidden")) {
      actual = "cheek";
      metrics = measure(analysis, gray, actual);
    }
    return { position: actual, spots: spotsFor(analysis, metrics, actual, place, manifest.frame) };
  }

  function pickSpots(want, which = accepted.bg) {
    const look = accepted.looks[which] ?? accepted.looks.scene;
    const auto = look.auto[want];
    return { position: auto.position, spots: look.tuned[want] ?? auto.spots };
  }

  function pushPreview() {
    onPreview?.(accepted && {
      person: accepted.url,
      persons: accepted.lit,
      backdrop: accepted.bg === "photo" ? accepted.backdropUrl : null,
      spots: Object.fromEntries(POSITIONS.map((p) => [p, pickSpots(p).spots])),
    });
  }

  async function apply() {
    if (mode === "adjust") {
      close();
      return;
    }
    if (mode === "early") {
      if (!job?.analysis) return;
      els.done.disabled = true;
      try {
        await accept();
        close();
      } catch (error) {
        console.error("去背失敗", error);
        accepted = null;
        step("review");
        renderNote("去背失敗了，換一張試試，或先用 SPOTIME 範例照");
      } finally {
        els.done.disabled = false;
      }
      return;
    }
    if (!stage || !(job?.bg === "photo" ? job.framed : job?.composed)) return;
    if (!tuning) {
      setTuning(true);
      return;
    }
    els.done.disabled = true;
    try {
      const spots = stage.spots();
      const look = job.bg === "photo" ? { backdrop: job.framed.backdrop } : { person: job.composed.person };
      await onApply({ ...look, spots }, position);
      job = { ...job, spots, spotsFor: position, spotsBg: job.bg };
      close();
    } catch (error) {
      console.error("套用自拍失敗", error);
      els.hint.textContent = "合成失敗了，再按一次試試。";
    } finally {
      els.done.disabled = false;
    }
  }

  /**
   * ?demo=zoom：不開面板，直接在相機螢幕上校正（相機拉近那一版）。
   * 畫布由呼叫端放進相機螢幕裡；沒挑自拍回 null（只按快門，不能調）。
   * @returns {Promise<{rotate(d), reset(), commit()}|null>}
   */
  /** @param opts { bin, tray }：垃圾桶、+ADD 膠囊，交給 createStage */
  async function editOn(canvas, done, opts = {}) {
    if (!accepted) return null;
    mode = "adjust";
    answers = done;
    position = done.position;
    const { spots } = pickSpots(done.position);
    stage?.destroy();
    stage = await stageOn(canvas, lookOf(accepted), done.scene, done.shape, spots, opts);
    let switching = null;

    /** 修圖時換背景：這一種的位置先記住，換成另一種自己的貼點；自己加的那幾枚原位帶過去 */
    async function switchBg(next) {
      if (!BGS.includes(next) || next === accepted.bg || !accepted.backdrop) return accepted.bg;
      remember();
      const extras = stage.spots().filter((sp) => sp.extra);
      accepted = { ...accepted, bg: next };
      bg = next;
      syncBg();
      const faces = pickSpots(done.position).spots.filter((sp) => !sp.extra);
      const fresh = await stageOn(canvas, lookOf(accepted), done.scene, done.shape, [...faces, ...extras], opts);
      stage?.destroy();
      stage = fresh;
      pushPreview();
      return accepted.bg;
    }

    return {
      rotate: (d) => stage?.rotate(d),
      undo: () => stage?.undo() ?? false,
      add: (shape) => stage?.add(shape) ?? false,
      background: () => accepted.bg,
      setBackground: (next) => {
        switching = (switching ?? Promise.resolve()).then(() => switchBg(next));
        return switching;
      },
      commit: () => {
        remember();
        stage?.destroy();
        stage = null;
      },
    };
  }

  /**
   * 作答完：把開場挑好的照片和校正好的位置交給結果頁。沒挑照片回 null（用預設合照）。
   * @returns {{custom:{person,spots}, position:string}|null}
   */
  function customFor(done) {
    if (!accepted) return null;
    const { position: actual, spots } = pickSpots(done.position);
    return { custom: { ...lookOf(accepted), spots }, position: actual };
  }

  const sheet = createSheetDrag(els.panel, els.grab, els.root, dismiss);
  els.open.addEventListener("click", open);
  els.close.addEventListener("click", dismiss);
  els.skip.addEventListener("click", () => {
    release(accepted);
    accepted = null;
    job = null;
    pushPreview();
    close();
  });
  els.root.addEventListener("keydown", (e) => { if (e.key === "Escape") dismiss(); });
  els.file.addEventListener("change", () => {
    const file = els.file.files?.[0];
    els.file.value = "";                 // 同一張再選一次也要觸發
    if (file) pick(file);
  });
  els.done.addEventListener("click", apply);
  els.bg.addEventListener("click", (e) => chooseBg(e.target.closest("[data-bg]")?.dataset.bg));
  els.rotCcw.addEventListener("click", () => stage?.rotate(ROTATE_STEP));
  els.rotCw.addEventListener("click", () => stage?.rotate(-ROTATE_STEP));
  els.reset.addEventListener("click", () => stage?.reset());
  els.cheek.addEventListener("click", () => {
    position = "cheek";
    showReview().catch((error) => console.error("改貼臉頰失敗", error));
  });

  return { open, openEarly, restoreKept, forget, adjust, editOn, close, customFor, keep, hasPhoto: () => Boolean(accepted), hasKept: hasKeptSelfie, rotateStep: ROTATE_STEP,
    keepsBackground: () => accepted?.bg === "photo",
    canKeepBackground: () => Boolean(accepted?.backdrop) };
}

/** 人物層要透明所以存 PNG；原照背景不透明，存 JPEG 小很多 */
function toBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圖層轉檔失敗"))), type, 0.92);
  });
}

/** 存起來的 PNG 讀回成 canvas（後面的合成、打光都吃 canvas） */
async function blobToCanvas(blob) {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  img.close?.();
  return canvas;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
