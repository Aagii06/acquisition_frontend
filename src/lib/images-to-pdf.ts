// Зургуудыг НЭГ PDF болгох (browser дотор, pdf-lib).
//
// Зураг бүр A4 нэг хуудас (босоо/хэвтээ — зургийн чиглэлээр), захын зайтай,
// харьцаагаа хадгалж багтана. Бүх зургийг canvas-аар JPEG болгож шигтгэнэ:
//   • HEIC/WebP/PNG г.м ямар ч браузерын уншдаг формат нэг хэлбэрт орно;
//   • хэт том (утасны 12MP) зургийг MAX_SIDE хүртэл жижигрүүлж PDF-ийг хөнгөлнө;
//   • JPEG (DCTDecode) учраас `extractPdfJpegs`-ээр буцааж ЗУРАГ болгон харуулж болно.

const A4 = { w: 595.28, h: 841.89 }; // pt
const MARGIN = 24; // pt
const MAX_SIDE = 2400; // px
const JPEG_QUALITY = 0.85;

async function toJpeg(file: File): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas дэмжигдэхгүй байна");
  // Тунгалаг (PNG) хэсэг JPEG-т хар болохгүйн тулд цагаан дэвсгэр.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error(`${file.name}: зургийг хөрвүүлж чадсангүй`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
}

/** Зургуудыг (дарааллаар) нэг PDF болгоно. Уншигдахгүй зураг байвал алдаа шиднэ. */
export async function imagesToPdf(files: File[], name: string): Promise<{ file: File; pages: number }> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const f of files) {
    let jpeg: Awaited<ReturnType<typeof toJpeg>>;
    try {
      jpeg = await toJpeg(f);
    } catch {
      throw new Error(`${f.name}: зургийг уншиж чадсангүй`);
    }
    const img = await doc.embedJpg(jpeg.bytes);
    const landscape = jpeg.w > jpeg.h;
    const pw = landscape ? A4.h : A4.w;
    const ph = landscape ? A4.w : A4.h;
    const fit = Math.min((pw - MARGIN * 2) / jpeg.w, (ph - MARGIN * 2) / jpeg.h);
    const dw = jpeg.w * fit;
    const dh = jpeg.h * fit;
    const page = doc.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
  }
  const bytes = await doc.save();
  // pdf-lib-ийн Uint8Array нь ArrayBufferLike — BlobPart-д шууд таарахгүй тул хуулна.
  return { file: new File([new Uint8Array(bytes)], name, { type: "application/pdf" }), pages: files.length };
}
