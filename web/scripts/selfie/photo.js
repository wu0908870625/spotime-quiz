/** 使用者選的檔案 → 一張縮到合理大小、方向正確的 canvas。
   手機原圖動輒 4000px，模型只看 256×256，縮到 1280 已經綽綽有餘，也省記憶體。 */
export const MAX_SIDE = 1280;

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* 舊版 Safari 不認這個參數，退回 <img>（<img> 本來就會照 EXIF 轉正） */
    }
  }
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** @returns {Promise<HTMLCanvasElement>} 讀不出來會丟出帶中文訊息的錯誤 */
export async function readPhoto(file) {
  if (!file || !/^image\//.test(file.type || "image/")) {
    throw new Error("這不是照片檔，換一張試試。");
  }
  let img;
  try {
    img = await decode(file);
  } catch {
    throw new Error("這張照片打不開。如果是 HEIC 格式，可以先截圖再選截圖。");
  }
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  return canvas;
}
