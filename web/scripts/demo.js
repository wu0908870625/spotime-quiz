/** 還沒定案、要先給 Jimmy 看的效果，用網址參數打開：?demo=print
 *   print  結果頁：快門定格黑掉 → 相機自己吐出相片（09-30 第三版，Jimmy：暫時保留）
 * 心情特效另外用 ?moodfx=pop（見 moodfx.js）。正式網址不帶參數＝都不開。
 * （tilt 陀螺儀 10-02 起預設打開、?tilt=off 關；zoom 相機上修圖、shutter 按快門、clean 結果頁減法、fx 動效：09-30 Jimmy 看過，已上線）
 */
const FLAGS = Object.freeze(["print"]);

export function demoOn(name) {
  if (!FLAGS.includes(name)) return false;
  const list = new URLSearchParams(location.search).get("demo") ?? "";
  return list.split(",").map((s) => s.trim()).includes(name);
}
