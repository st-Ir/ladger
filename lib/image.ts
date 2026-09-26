"use client";

/**
 * Turning a picked image file into something safe to keep in the prefs blob.
 *
 * The whole ledger lives in one `localStorage` entry (see lib/storage.ts) and
 * browsers cap that at ~5 MB, so a raw phone photo can't go in as-is: it's
 * scaled down to `maxW`×`maxH` and re-encoded, dropping quality until the data
 * URL fits `maxBytes`.
 */

const loadBitmap = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("File itu tidak bisa dibaca sebagai gambar."));
    };
    img.src = url;
  });

export async function fileToDataUrl(
  file: File,
  maxW: number,
  maxH: number,
  maxBytes = 900_000
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Pilih file gambar (JPG, PNG, atau WebP).");

  const img = await loadBitmap(file);
  const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini tidak bisa memproses gambar.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // WebP where it exists (smaller, keeps transparency); JPEG is the fallback.
  const probe = canvas.toDataURL("image/webp", 0.85);
  const type = probe.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";

  let out = type === "image/webp" ? probe : canvas.toDataURL(type, 0.85);
  for (const q of [0.7, 0.55, 0.4]) {
    if (out.length <= maxBytes) break;
    out = canvas.toDataURL(type, q);
  }
  if (out.length > maxBytes) throw new Error("Gambarnya terlalu besar — coba yang resolusinya lebih kecil.");
  return out;
}
