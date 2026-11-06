/** 相機畫面右下角的 LCD 日期，照訪客當天的日期印，格式跟傻瓜相機一樣：'26 09 29。
   09-29 以前寫死上市日 '26 12 01，Jimmy 覺得不是當天日期很可惜。 */
export function lcdDate(now = new Date()) {
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `'${yy} ${mm} ${dd}`;
}
