import type OLMap from "ol/Map";
import { toLonLat } from "ol/proj";
import { PDFDocument } from "pdf-lib";
import { GS_WMS, gsAuthHeaders } from "@/lib/geoserver";
import type { LayerHatch } from "./layer-config";
import { placeLabels, type LabelInput } from "./label-placement";

export interface PrintLegendItem {
  color: string;
  label: string;
  /** true бол дөрвөлжин биш ШУГАМ зурна (хилийн давхаргууд). */
  line?: boolean;
  /** true бол тэмдэггүй, тод мөр — ж: "Нийт нэгж талбар (120)". */
  total?: boolean;
  /**
   * Торлосон/цэгэн будалт — зураг дээрх SLD-тэй ижил хэлбэрээр дөрвөлжинг
   * зурна (ГУС-ийн дэд давхаргууд). Заагаагүй бол дүүрэн өнгө.
   */
  hatch?: LayerHatch;
}

/**
 * Таних тэмдгийн ТОРЛОСОН дөрвөлжин — давхаргын самбарын `swatchStyle`-тэй
 * ижил: бүдэг дүүргэлт + торлолт/цэг + өнгөт хүрээ.
 */
function drawHatchSwatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  hatch: LayerHatch,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.6;
  const step = 2.5;
  if (hatch === "dot") {
    for (let px = x + step / 2; px < x + w; px += step)
      for (let py = y + step / 2; py < y + h; py += step) {
        ctx.beginPath();
        ctx.arc(px, py, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
  } else {
    ctx.beginPath();
    const diag = hatch === "slash" || hatch === "times";
    const anti = hatch === "backslash" || hatch === "times";
    const vert = hatch === "vertline" || hatch === "plus";
    const horz = hatch === "horline" || hatch === "plus";
    for (let d = -h; d < w + h; d += step) {
      if (diag) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); }
      if (anti) { ctx.moveTo(x + d, y); ctx.lineTo(x + d + h, y + h); }
    }
    if (vert) for (let px = x + step / 2; px < x + w; px += step) { ctx.moveTo(px, y); ctx.lineTo(px, y + h); }
    if (horz) for (let py = y + step / 2; py < y + h; py += step) { ctx.moveTo(x, py); ctx.lineTo(x + w, py); }
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(x, y, w, h);
}

export interface PrintMapViewInfo {
  /** view.getResolution() — проекцын нэгж (метр, EPSG:3857) OL viewport-ийн 1 CSS px тутамд */
  resolution: number;
  /** Харагдацын төвийн өргөрөг — Web Mercator-ийн метрийн гажуудлыг засахад хэрэглэнэ */
  centerLat: number;
}

export type PrintOrientation = "landscape" | "portrait";
export type PrintPaperSize = "A4" | "A3";

// Цаасны px хэмжээ (~96dpi) — урьдчилан харах зураг болон PDF хуудас хоёул ижил
// харьцаатай байхын тулд газрын зургийн canvas-ыг эндхи хэмжээнд зурна.
// A4 210×297мм, A3 297×420мм.
const PAPER_PX: Record<PrintPaperSize, { width: number; height: number }> = {
  A4: { width: 794, height: 1123 },
  A3: { width: 1123, height: 1587 },
};
// PDF-ийн цэгээр (pt) хэмжээ — 1мм = 2.8346pt
const PAPER_PT: Record<PrintPaperSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
};

export function pageSizePx(
  orientation: PrintOrientation,
  paper: PrintPaperSize = "A4",
): { width: number; height: number } {
  const p = PAPER_PX[paper];
  return orientation === "landscape" ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

// Хуудасны layout-ын тогтмолууд — composePrintPage болон
// printMapAreaSizePx хоёулаа ЭНДЭЭС уншина. Хоёр газар тусад нь бичвэл
// зурган дээрх тайралтын тооцоо чимээгүйхэн зөрнө.
export const PAGE_MARGIN = 24;
// Толгой: дээр нь ЖИЖИГ байгууллагын мөр, доор нь ГАРЧИГ (олон мөр).
export const PAGE_ORG_ROW_H = 20;
export const PAGE_TITLE_AREA_H = PAGE_ORG_ROW_H + 52;
// Мэдээллийн КАРТ — тусдаа панель БИШ, газрын зургийн ДЭЭР хөвнө
// (таних тэмдэгтэй яг ижил цагаан дэвсгэртэй). Зургийн доод хэсэгт
// чөлөөлөлтийн хил ороогүй хоосон зай үлдээж, түүн дээр нь зурна.
export const INFO_CARD_H = 82;
export const CARD_INSET = 10;
/* БОСОО хэвлэхэд хуудас нарийн тул таних тэмдэг + мэдээллийн карт зэрэгцэж
   БАГТДАГГҮЙ — мөрийн шошго ба утга давхарлаж уншигдахгүй болдог. Иймд босоо
   үед хоёр картыг ДЭЭШ-ДООШ өрж, тус бүрд нь БҮТЭН өргөн өгнө. */


/**
 * Хуудсан дээр ГАЗРЫН ЗУРАГТ оногдох талбайн хэмжээ (px).
 *
 * composePrintPage нь зургийг "cover" (Math.max) байдлаар зурж, хэтэрсэн
 * хэсгийг ТАЙРДАГ. Тиймээс дуудагч тал нь ямар харьцаатай хэсэг үлдэхийг
 * урьдчилан мэдэж, газрын зургийн харагдацаа тааруулах шаардлагатай — үгүй
 * бол чөлөөлөлтийн хил зах руугаа тасарна.
 */
export function printMapAreaSizePx(
  orientation: PrintOrientation,
  paper: PrintPaperSize = "A4",
): { width: number; height: number } {
  const { width, height } = pageSizePx(orientation, paper);
  return {
    width: width - PAGE_MARGIN * 2,
    height: height - (PAGE_MARGIN + PAGE_TITLE_AREA_H) - PAGE_MARGIN,
  };
}

/**
 * Мэдээллийн карт эзлэх ДООД ЗУРВАС (px, хуудасны нэгжээр).
 *
 * Дуудагч тал нь чөлөөлөлтийн хилийг зөвхөн ДЭЭД хэсэгт багтаах ёстой —
 * доод зурвас нь хилгүй хоосон газрын зураг байж, түүн дээр карт хөвнө.
 */
export function printInfoBandPx(orientation: PrintOrientation = "landscape"): number {
  // Босоо: таних тэмдэг + мэдээллийн карт ДЭЭШ-ДООШ хоёр мөр.
  return orientation === "portrait" ? INFO_CARD_H * 2 + CARD_INSET * 3 : INFO_CARD_H + CARD_INSET * 2;
}

/**
 * Зураг (лого) ачаална. Ачаалагдаагүй зургийг canvas-д зурвал хоосон гарах тул
 * composePrintPage-ийн ӨМНӨ дуудаж, үр дүнг нь дамжуулна. Алдаа гарвал null —
 * лого байхгүй ч хуудас хэвлэгдэнэ.
 */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * ХЭВЛЭХИЙН НЯГТАРШИЛ (супер-семпл).
 *
 * Хуудасны layout нь 96dpi-ийн CSS px-ээр бодогддог (A4 = 794×1123).
 * Тэр хэмжээгээр шууд PDF-д тавихад 96dpi болж, цаасан дээр үсэг/шугам
 * бүдэг гарна. Тиймээс canvas-ыг S дахин ТОМООР зурж, PDF-д ижил
 * физик хэмжээтэйгээр (A4 = 595×842pt) шигтгэнэ → 96×S dpi.
 *
 * A3 нь физикээр 2 дахин том тул бага коэффициент ч хангалттай — санах
 * ой хэт өсөхөөс сэргийлнэ (A3×3 нь ~16 сая пиксел = 64MB RGBA).
 */
export function printScaleFor(paper: PrintPaperSize): number {
  const { width, height } = PAPER_PX[paper];
  /* Хамгийн их canvas талбай. Safari нэг canvas дээр ~16.7 сая пикселийн
     хязгаартай тул түүнээс доогуур барина; Chrome илүү өгөөмөр ч санах ой
     дэмий иддэг. Энэ хязгаарт багтах ХАМГИЙН ТОМ коэффициентийг сонгоно. */
  const MAX_PAGE_PX = 15_000_000;
  const fit = Math.sqrt(MAX_PAGE_PX / (width * height));
  // Дээд тал нь 3 (288dpi) — түүнээс дээш нүдэнд ялгарахгүй, файл л томордог.
  return Math.min(3, Math.max(1.5, Math.floor(fit * 10) / 10));
}

/** Хуудсан дээр харуулах мэдээлэл. Бүгд заавал биш — байхгүй бол мөр нь алгасагдана. */
export interface PrintInfo {
  planCode?: string;
  planName?: string;
  /** НИТХ-ын тогтоолын дугаар (Ж: "2025.12.05 25/134") */
  nithDecreeNumber?: string;
  /** Чөлөөлөлтийн хилийн талбай (м²) */
  acquisitionAreaM2?: number;
  /** Нэгж талбаруудын чөлөөлөх талбайн НИЙЛБЭР (м²) */
  parcelsAreaM2?: number;
  orgName?: string;
  logo?: HTMLImageElement | null;
  /** Ерөнхий ангилалд холбогдсон хэлтэс */
  departmentName?: string;
  departmentCode?: string;
  /** Чөлөөлөлтийн ЯВЦ — төлөвийн нэр (Шинэ / Хээрийн судалгаа / ...) */
  statusName?: string;
  /** Гүйцэтгэлийн хувь (0-100) */
  progressPercent?: number;
  /** Гүйцэтгэлийн pie — нэгж талбарын төлөв тус бүрээр */
  progressBreakdown?: { color: string; label: string; count: number }[];
  /** Хариуцсан мэргэжилтнүүдийн овог нэр */
  specialists?: string[];
}

// Хэвлэсэн огноо — "2026.09.01" (тэгээр гүйцээсэн, монгол бичиглэл).
export function formatDateDots(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${p(date.getMonth() + 1)}.${p(date.getDate())}`;
}

/** м² → уншихад тохиромжтой (га эсвэл м²). */
export function areaText(m2?: number): string {
  if (m2 == null || !Number.isFinite(m2) || m2 <= 0) return "—";
  return m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} га` : `${Math.round(m2).toLocaleString()} м²`;
}

/** ЗҮГ ЧИГИЙН тэмдэг — газрын зургийн баруун дээд буланд. */
export function drawNorthArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Хойд зүг — бараан гурвалжин; урд зүг — цайвар
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.62);
  ctx.lineTo(cx + r * 0.3, cy + r * 0.2);
  ctx.lineTo(cx, cy + r * 0.05);
  ctx.closePath();
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.62);
  ctx.lineTo(cx - r * 0.3, cy + r * 0.2);
  ctx.lineTo(cx, cy + r * 0.05);
  ctx.closePath();
  ctx.fillStyle = "#94a3b8";
  ctx.fill();

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy + r * 0.55);
  ctx.restore();
}

/** Гүйцэтгэлийн PIE — нэгж талбарын төлөв тус бүрээр өнгөөр хуваана. */
function drawProgressPie(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  slices: { color: string; count: number }[],
): void {
  const total = slices.reduce((sum, sl) => sum + sl.count, 0);
  ctx.save();
  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#e2e8f0";
    ctx.fill();
  } else {
    let start = -Math.PI / 2;
    slices.forEach((sl) => {
      if (sl.count <= 0) return;
      const angle = (sl.count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = sl.color;
      ctx.fill();
      start += angle;
    });
  }
  // Donut нүх — дунд нь хувь бичихэд уншигдахуйц болно
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Идэвхтэй харагдацын resolution болон төвийн өргөргийг унших — масштаб
 * тооцоолоход хэрэглэгдэнэ. rendercomplete хүлээх шаардлагагүй тул captureMapCanvas-аас
 * өмнө ч дараа ч дуудаж болно.
 */
export function getMapViewInfo(map: OLMap): PrintMapViewInfo | null {
  const view = map.getView();
  const resolution = view.getResolution();
  const center = view.getCenter();
  if (resolution == null || !center) return null;
  const [, centerLat] = toLonLat(center);
  return { resolution, centerLat };
}

// Масштабын харьцааг "цэвэрхэн" тоо болгож дугуйлна (жиш: 1834 → 1800), учир нь
// PDF/preview дээр 1:1,834.27 гэх мэт хэт нарийвчлалтай тоо мэргэжлийн бус харагдана.
export function roundScaleDenominator(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let step: number;
  if (value < 200) step = 5;
  else if (value < 1000) step = 10;
  else if (value < 5000) step = 50;
  else if (value < 20000) step = 100;
  else if (value < 100000) step = 500;
  else step = 1000;
  return Math.round(value / step) * step;
}

/**
 * OL-ийн view resolution (проекцын нэгж/px)-ээс хэвлэх хуудсан дээрх бодит масштабыг
 * тооцоолно. Web Mercator (EPSG:3857) метр нь өргөрөгөөс хамааран газрын бодит зайг
 * илүү үзүүлдэг тул cos(lat)-аар засна. mapCanvas болон А4 хуудас хоёул нэг ижил
 * "96dpi CSS px" конвенцоор хэмжигдсэн тул шууд харьцуулж болно.
 */
export function computeScaleDenominator(viewInfo: PrintMapViewInfo, coverScale: number): number {
  const groundMetersPerOLpx = viewInfo.resolution * Math.cos((viewInfo.centerLat * Math.PI) / 180);
  const mmPerPagePx = 25.4 / 96;
  const groundMetersPerPagePx = groundMetersPerOLpx / coverScale;
  const denominator = (groundMetersPerPagePx / mmPerPagePx) * 1000;
  return roundScaleDenominator(denominator);
}

/** Текстийг өгөгдсөн өргөнд багтаах мөрүүд болгож таслана (үгээр). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  lines.push(line);
  return lines;
}

/** Урт текстийг өргөнд багтаахаар тайрч "…" залгана (шахаж гажуудуулахгүй). */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

/**
 * ГАРЧГИЙН байрлуулалт — фонтын хэмжээг багасгаж, шаардвал ОЛОН МӨР болгоно.
 *
 * ЯАГААД: чөлөөлөлтийн нэр урт байдаг (жиш: "Сонгинохайрхан дүүргийн 5 дугаар
 * хороо «Ханын материал орчмын гэр хорооллын газрыг орон сууцжуулах дахин
 * төлөвлөлтийн ажил»"). Өмнө нь ганц мөрөнд `fillText(..., maxWidth)`-аар
 * шахдаг байсан тул үсэг нарийсаж уншигдахгүй болдог байв.
 *
 * Гарчгийн блокийн ӨНДӨР нь тогтмол (PAGE_TITLE_AREA_H) — тиймээс хуудасны
 * бусад хэсгийн байрлал (газрын зураг, инфо панель) гарчгаас хамаарч хөвөхгүй.
 */
export function layoutTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxSize = 20,
  minSize = 11,
): { lines: string[]; fontSize: number; lineHeight: number } {
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = `bold ${size}px sans-serif`;
    const lineHeight = Math.round(size * 1.25);
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight) return { lines, fontSize: size, lineHeight };
  }
  // Хамгийн жижиг хэмжээгээр ч багтаагүй — багтах мөрийг нь авч, сүүлчийнхийг тайрна.
  ctx.font = `bold ${minSize}px sans-serif`;
  const lineHeight = Math.round(minSize * 1.25);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const all = wrapText(ctx, text, maxWidth);
  const lines = all.slice(0, maxLines);
  if (all.length > maxLines) lines[maxLines - 1] = ellipsize(ctx, `${lines[maxLines - 1]} ${all[maxLines].slice(0, 12)}`, maxWidth);
  return { lines, fontSize: minSize, lineHeight };
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ══════════════════════════════════════════════════════════════════
   ХЭВЛЭХИЙН ГАЗРЫН ЗУРАГ — OpenLayers-ГҮЙГЭЭР

   ЯАГААД: OL-ийн дотоод canvas-аас зураг "буулгах" (captureMapCanvas)
   арга нь хэвлэхийн ТОМ хэмжээнд найдваргүй болсон — суурь хиймэл
   дагуулын зураг буудаг ч WMS давхаргууд (нэгж талбар, чөлөөлөлтийн
   хил, дүүрэг/хорооны хил) хоосон гардаг байв. Шалтгааныг браузергүйгээр
   таних боломжгүй байсан тул ЭНЭ ЗАМЫГ БҮРЭН ОРХИВ.

   Оронд нь: хүрээ, пиксел хэмжээ, давхаргын жагсаалт бүгд МЭДЭГДЭЖ
   байгаа тул давхарга бүрийг ШУУД татаад (WMS нэг хүсэлт, XYZ тайлууд)
   өөрсдөө canvas дээр зурна. Ямар ч далд төлөв, тайминг байхгүй —
   алдаа гарвал throw хийж хэрэглэгчид ХАРУУЛНА (чимээгүй хоосон
   зураг гаргахгүй).
   ══════════════════════════════════════════════════════════════════ */

const WEB_MERCATOR_HALF = 20037508.342789244;
const XYZ_TILE_PX = 256;
/** Нэг давхаргад татах тайлын дээд тоо — санамсаргүй бөөн хүсэлтээс хамгаална. */
const MAX_TILES_PER_LAYER = 900;
/** Зэрэг явуулах тайлын хүсэлтийн тоо. */
const TILE_CONCURRENCY = 8;

export type PrintLayerSpec =
  | {
      kind: "wms";
      /** Бүтэн нэр, жиш: "land:v_parcel_s0" */
      layer: string;
      styles?: string;
      cql?: string;
      opacity?: number;
      /**
       * ЗААВАЛ байх давхарга уу? Зөвхөн чөлөөлөлтийн хил ба нэгж талбар
       * ЗААВАЛ — эдгээр байхгүй бол ажлын зураг утгагүй тул алдаа өгнө.
       * Туслах давхарга (аймаг/сум/хороо, төлөвлөлтийн хил) унавал ЧИМЭЭГҮЙ
       * алгасаж, үлдсэнийг нь хэвлэнэ.
       */
      required?: boolean;
    }
  | {
      kind: "xyz";
      /** {z}/{x}/{y} загвартай URL-ууд (олон бол ээлжлэн хэрэглэнэ). */
      urls: string[];
      maxZoom: number;
      opacity?: number;
      crossOrigin?: string;
      /** EPSG:3857 хүрээ — зөвхөн энэ дотор зурна (дроны зураг). */
      clipExtent?: [number, number, number, number];
    }
  | {
      /**
       * Клиент талд мэдэгдэж буй геометр (нэгж талбарын WKT г.м) — GeoServer-ээс
       * татахгүй, шууд canvas дээр зурна. Дэлгэцийн OL вектор давхаргатай ижил
       * хэлбэрээр (хүрээ/дүүргэлт/тасархай) хэвлэхэд хэрэглэнэ.
       */
      kind: "vector";
      /** Олон өнцөгтүүд (EPSG:3857): polygon → цагираг → [x, y] */
      polygons: number[][][][];
      stroke?: string;
      /** Зураасны зузаан — газрын зургийн CANVAS-ын px-ээр (дуудагч масштаблана). */
      strokeWidth?: number;
      fill?: string;
      dash?: number[];
      opacity?: number;
    }
  | {
      /**
       * Газрын зураг дээрх ТЕКСТ шошго (нэгж талбарын өмчлөгчийн нэр г.м).
       * Цагаан хүрээтэй тул хиймэл дагуулын бараан зураг дээр ч уншигдана.
       */
      kind: "label";
      /** Шошгоны төв (EPSG:3857), текст ба эрэмбэ (их нь түрүүлж байрлана) */
      labels: { x: number; y: number; text: string; weight?: number }[];
      /** Үсгийн хэмжээ — газрын зургийн CANVAS-ын px-ээр (дуудагч масштаблана). */
      fontPx: number;
      color?: string;
      opacity?: number;
      /** Давхцлаас болж ЗУРАГДААГҮЙ шошгын тоо — дуудагч хэрэглэгчид мэдэгдэнэ. */
      onSkipped?: (count: number) => void;
      /** Доод зурвас (таних тэмдэг, мэдээллийн карт) — тэнд нэр тавихгүй, canvas-ын px. */
      bottomInsetPx?: number;
    };

function drawVectorLayer(
  ctx: CanvasRenderingContext2D,
  spec: Extract<PrintLayerSpec, { kind: "vector" }>,
  extent: [number, number, number, number],
  resolution: number,
): void {
  ctx.save();
  ctx.beginPath();
  spec.polygons.forEach((poly) =>
    poly.forEach((ring) =>
      ring.forEach(([x, y], i) => {
        const px = (x - extent[0]) / resolution;
        const py = (extent[3] - y) / resolution;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }),
    ),
  );
  ctx.closePath();
  if (spec.fill) {
    ctx.fillStyle = spec.fill;
    // Нүхтэй (дотоод цагирагтай) талбарыг зөв зурна
    ctx.fill("evenodd");
  }
  if (spec.stroke) {
    ctx.strokeStyle = spec.stroke;
    ctx.lineWidth = spec.strokeWidth ?? 2;
    ctx.lineJoin = "round";
    if (spec.dash) ctx.setLineDash(spec.dash);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabelLayer(
  ctx: CanvasRenderingContext2D,
  spec: Extract<PrintLayerSpec, { kind: "label" }>,
  extent: [number, number, number, number],
  resolution: number,
): void {
  ctx.save();
  ctx.font = `bold ${spec.fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, spec.fontPx * 0.28);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.fillStyle = spec.color ?? "#0f172a";
  // Давхцахгүйгээр байрлуулна (label-placement.ts) — нягт газарт нэр бүрийг
  // шууд зурвал бие биенээ дарж уншигдахгүй болдог.
  const inputs: LabelInput[] = spec.labels.map(({ x, y, text, weight }) => ({
    x: (x - extent[0]) / resolution,
    y: (extent[3] - y) / resolution,
    text,
    weight,
  }));
  const { placed, skipped } = placeLabels(inputs, {
    fontPx: spec.fontPx,
    measure: (text, f) => {
      ctx.font = `bold ${f}px sans-serif`;
      return ctx.measureText(text).width;
    },
    width: ctx.canvas.width,
    height: ctx.canvas.height - (spec.bottomInsetPx ?? 0),
  });
  placed.forEach(({ x, y, lines, fontPx }) => {
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.lineWidth = Math.max(2, fontPx * 0.28);
    const lineH = fontPx * 1.15;
    lines.forEach((line, i) => {
      const ly = y + (i - (lines.length - 1) / 2) * lineH;
      ctx.strokeText(line, x, ly);
      ctx.fillText(line, x, ly);
    });
  });
  spec.onSkipped?.(skipped);
  ctx.restore();
}

async function decodeFromUrl(src: string, crossOrigin?: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = crossOrigin;
  img.src = src;
  try {
    // decode() нь "татагдсан" биш "ЗУРАХАД БЭЛЭН" гэдгийг баталгаажуулна.
    if (typeof img.decode === "function") await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    return img;
  } catch {
    return null;
  }
}

async function runPooled(jobs: (() => Promise<void>)[], limit: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      await job();
    }
  });
  await Promise.all(workers);
}

async function drawWmsLayer(
  ctx: CanvasRenderingContext2D,
  spec: Extract<PrintLayerSpec, { kind: "wms" }>,
  extent: [number, number, number, number],
  width: number,
  height: number,
): Promise<void> {
  const request = async (styles: string): Promise<Blob> => {
    const body = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.1.1", // 1.1.1 — тэнхлэгийн дараалал (x,y) тодорхой, 1.3.0-ийн урвуутай асуудалгүй
      REQUEST: "GetMap",
      LAYERS: spec.layer,
      STYLES: styles,
      BBOX: extent.join(","),
      WIDTH: String(width),
      HEIGHT: String(height),
      SRS: "EPSG:3857",
      FORMAT: "image/png",
      TRANSPARENT: "true",
    });
    if (spec.cql) body.set("CQL_FILTER", spec.cql);

    const r = await fetch(GS_WMS, {
      method: "POST",
      headers: gsAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: body.toString(),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${text.slice(0, 200)}`);
    }
    const type = r.headers.get("content-type") || "";
    if (!type.startsWith("image/")) {
      // GeoServer алдааг 200 + XML-ээр буцаадаг тул статус хангалтгүй.
      const text = await r.text().catch(() => "");
      throw new Error(text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200));
    }
    return r.blob();
  };

  let blob: Blob;
  try {
    blob = await request(spec.styles ?? "");
  } catch (first) {
    if (!spec.styles) {
      if (spec.required) throw new Error(`${spec.layer}: ${String(first)}`);
      return;
    }
    /* Хэвлэхийн style ачаалагдаагүй байх (GeoServer-т reload хийгдээгүй г.м)
       нь бүх зургийг унагаах шалтгаан БИШ — ӨГӨГДМӨЛ style-аар дахин оролдоно.
       Зураас нь нимгэн боловч давхарга нь ГАРНА. */
    try {
      blob = await request("");
    } catch (second) {
      if (spec.required) throw new Error(`${spec.layer}: ${String(second)}`);
      return; // туслах давхарга — чимээгүй алгасна
    }
  }

  const bitmap = await createImageBitmap(blob);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
}

async function drawXyzLayer(
  ctx: CanvasRenderingContext2D,
  spec: Extract<PrintLayerSpec, { kind: "xyz" }>,
  extent: [number, number, number, number],
  resolution: number,
): Promise<void> {
  // Тайлын түвшинг ЗОРИЛТОТ нягтаршилд хамгийн ойрыг сонгоно.
  const ideal = Math.log2((2 * WEB_MERCATOR_HALF) / (XYZ_TILE_PX * resolution));
  let z = Math.max(0, Math.min(spec.maxZoom, Math.round(ideal)));

  const box = spec.clipExtent
    ? ([
        Math.max(extent[0], spec.clipExtent[0]),
        Math.max(extent[1], spec.clipExtent[1]),
        Math.min(extent[2], spec.clipExtent[2]),
        Math.min(extent[3], spec.clipExtent[3]),
      ] as [number, number, number, number])
    : extent;
  if (box[0] >= box[2] || box[1] >= box[3]) return;

  /* Хэт олон тайл гарвал ТҮВШИНГ БУУРУУЛНА (алгасахгүй) — үгүй бол том
     чөлөөлөлт дээр суурь зураг огт гарахгүй хоосон үлдэнэ. */
  const tileRange = (level: number) => {
    const nn = 2 ** level;
    const sp = (2 * WEB_MERCATOR_HALF) / nn;
    return {
      span: sp,
      x0: Math.max(0, Math.floor((box[0] + WEB_MERCATOR_HALF) / sp)),
      x1: Math.min(nn - 1, Math.floor((box[2] + WEB_MERCATOR_HALF) / sp)),
      y0: Math.max(0, Math.floor((WEB_MERCATOR_HALF - box[3]) / sp)),
      y1: Math.min(nn - 1, Math.floor((WEB_MERCATOR_HALF - box[1]) / sp)),
    };
  };
  let range = tileRange(z);
  while (z > 0 && (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) > MAX_TILES_PER_LAYER) {
    z -= 1;
    range = tileRange(z);
  }
  const { span, x0, x1, y0, y1 } = range;

  const clipped = !!spec.clipExtent;
  if (clipped) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      (box[0] - extent[0]) / resolution,
      (extent[3] - box[3]) / resolution,
      (box[2] - box[0]) / resolution,
      (box[3] - box[1]) / resolution,
    );
    ctx.clip();
  }

  const jobs: (() => Promise<void>)[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(async () => {
        const tpl = spec.urls[(x + y) % spec.urls.length];
        const url = tpl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
        const img = await decodeFromUrl(url, spec.crossOrigin);
        if (!img) return; // хоосон тайл (далайн гадна г.м) — алдаа биш
        const px = (x * span - WEB_MERCATOR_HALF - extent[0]) / resolution;
        const py = (extent[3] - (WEB_MERCATOR_HALF - y * span)) / resolution;
        const size = span / resolution;
        // +1 — хөрш тайлуудын хооронд бөөрөнхийллөөс болж цагаан зураас гарахаас сэргийлнэ
        ctx.drawImage(img, px, py, size + 1, size + 1);
      });
    }
  }
  await runPooled(jobs, TILE_CONCURRENCY);
  if (clipped) ctx.restore();
}

/**
 * Хэвлэх газрын зургийг ЯГ өгөгдсөн хүрээ, пиксел хэмжээгээр зурна.
 *
 * Давхаргууд жагсаалтын ДАРААЛЛААР (эхнийх нь доор) зурагдана.
 * WMS алдаа гарвал throw — дуудагч талдаа хэрэглэгчид харуулна.
 */
export async function renderPrintMapCanvas(o: {
  extent: [number, number, number, number];
  width: number;
  height: number;
  layers: PrintLayerSpec[];
}): Promise<HTMLCanvasElement> {
  const { extent, width, height, layers } = o;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas контекст үүсгэж чадсангүй");
  const resolution = (extent[2] - extent[0]) / width;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  for (const spec of layers) {
    ctx.globalAlpha = spec.opacity ?? 1;
    if (spec.kind === "wms") await drawWmsLayer(ctx, spec, extent, width, height);
    else if (spec.kind === "vector") drawVectorLayer(ctx, spec, extent, resolution);
    else if (spec.kind === "label") drawLabelLayer(ctx, spec, extent, resolution);
    else await drawXyzLayer(ctx, spec, extent, resolution);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * Газрын зураг БҮРЭН ачаалагдтал хүлээнэ (тайл + WMS зураг).
 *
 * ЯАГААД `rendercomplete` ХАНГАЛТГҮЙ: тэр эвент "одоо ачаалагдаж буй зүйл
 * байхгүй" үед асдаг. Харагдац сая солигдсон үед OL хүсэлтээ ИЛГЭЭЖ
 * амжаагүй байхад тэр нөхцөл үнэн болж, эвент шууд асаад ХООСОН (зөвхөн
 * суурь зурагтай) агшин буудаг байв.
 *
 * Иймд эх сурвалж бүрийн load эвентийг тоолж, тоолуур тэг болтол хүлээнэ.
 * Хүсэлт огт эхлээгүй тохиолдолд ч (бүх зураг кэштэй) богино хугацааны
 * дараа гарна. timeoutMs нь сүлжээ гацсан үеийн хамгаалалт.
 */
export function waitForMapIdle(map: OLMap, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve) => {
    let pending = 0;
    const detach: (() => void)[] = [];

    map.getLayers().forEach((layer) => {
      const src = (layer as { getSource?: () => unknown }).getSource?.();
      const target = src as
        | { on?: (t: string, f: () => void) => void; un?: (t: string, f: () => void) => void }
        | undefined;
      if (!target?.on || !target?.un) return;
      const inc = () => { pending += 1; };
      const dec = () => { pending = Math.max(0, pending - 1); };
      // Тайл (XYZ) ба зураг (ImageWMS) — эх сурвалжийн төрлөөс хамааран
      // зөвхөн харгалзах эвентүүд нь асна; байхгүй нь юу ч хийхгүй.
      for (const [evt, fn] of [
        ["tileloadstart", inc], ["tileloadend", dec], ["tileloaderror", dec],
        ["imageloadstart", inc], ["imageloadend", dec], ["imageloaderror", dec],
      ] as [string, () => void][]) {
        target.on(evt, fn);
        detach.push(() => target.un?.(evt, fn));
      }
    });

    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    void (async () => {
      // Хоёр удаа render — эхнийх нь харагдацыг шинэчлээд зарим давхаргын
      // хүсэлтийг дараагийн frame рүү үлдээж болно.
      map.renderSync();
      await frame();
      map.renderSync();
      await frame();

      const started = Date.now();
      /* Тоолуур тэг байх нь ХАРААХАН хүсэлт эхлээгүйг ч илэрхийлж болно
         (OL нь харагдац солигдсоны дараах frame дээр л хүсэлтээ илгээдэг,
         зарим давхарга бүр хожуу). Иймд "тэг" гэдгийг НЭГ УДАА биш, дараалан
         3 удаа, дор хаяж 700мс өнгөрсний дараа л үнэн гэж үзнэ. */
      let idleStreak = 0;
      while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, 150));
        map.renderSync();
        if (pending > 0) { idleStreak = 0; continue; }
        idleStreak += 1;
        if (idleStreak >= 3 && Date.now() - started >= 700) break;
      }
      // Ачаалагдсан зургууд canvas дээр бууж амжих зай
      map.renderSync();
      await frame();
      map.renderSync();
      await frame();
      detach.forEach((f) => f());
      resolve();
    })();
  });
}

/**
 * OpenLayers Canvas renderer-ийн идэвхтэй харагдацыг нэг canvas зураг болгон нэгтгэнэ.
 * rendercomplete хүлээх шаардлагатай тул Promise буцаана.
 */
export function captureMapCanvas(map: OLMap): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    map.once("rendercomplete", () => {
      const size = map.getSize();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!size || !ctx) {
        resolve(null);
        return;
      }
      canvas.width = size[0];
      canvas.height = size[1];

      Array.from(
        map.getViewport().querySelectorAll<HTMLCanvasElement>(".ol-layer canvas, canvas.ol-layer"),
      ).forEach((layerCanvas) => {
        if (layerCanvas.width === 0) return;
        const parent = layerCanvas.parentElement;
        const opacityStr = parent?.style.opacity || layerCanvas.style.opacity;
        ctx.globalAlpha = opacityStr === "" ? 1 : Number(opacityStr);

        const match = layerCanvas.style.transform.match(/^matrix\(([^)]*)\)$/);
        if (match) {
          const [a, b, c, d, e, f] = match[1].split(",").map(Number);
          ctx.setTransform(a, b, c, d, e, f);
        } else {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ctx.drawImage(layerCanvas, 0, 0);
      });
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      resolve(canvas);
    });
    map.renderSync();
  });
}

/**
 * Гарчиг, газрын зураг, таних тэмдэг (легенд)-ийг А4 харьцаатай нэг хуудсан зураг болгож
 * зурна — энэ нь урьдчилан харах модал болон PDF-д адилхан ашиглагдана.
 */
export interface ComposePageOptions {
  title: string;
  orientation: PrintOrientation;
  paper?: PrintPaperSize;
  legend?: PrintLegendItem[];
  viewInfo?: PrintMapViewInfo | null;
  info?: PrintInfo;
}

export function composePrintPage(
  mapCanvas: HTMLCanvasElement,
  opts: ComposePageOptions,
): HTMLCanvasElement {
  const {
    title,
    orientation,
    paper = "A4",
    viewInfo = null,
    info = {},
  } = opts;
  // `let` — багтахгүй бол доор "+N бусад"-аар тайрна.
  let legend = opts.legend ?? [];
  const { width, height } = pageSizePx(orientation, paper);
  /* Canvas-ыг S дахин том хийж, контекстийг мөн S-ээр масштаблана —
     доорх БҮХ layout тооцоо 96dpi-ийн CSS px-ээр хэвээр бичигдэнэ.
     Ингэснээр зөвхөн НЯГТАРШИЛ өснө, байрлал юу ч өөрчлөгдөхгүй. */
  const S = printScaleFor(paper);
  const page = document.createElement("canvas");
  page.width = Math.round(width * S);
  page.height = Math.round(height * S);
  const ctx = page.getContext("2d")!;
  ctx.scale(S, S);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const margin = PAGE_MARGIN;
  const titleAreaH = PAGE_TITLE_AREA_H;

  /* ── ТОЛГОЙ ────────────────────────────────────────────────────────
     Дээд мөр: ЖИЖИГ лого + байгууллагын нэр (голлуулсан).
     Доор нь: ГАРЧИГ — хуудасны БҮТЭН өргөнөөр, шаардвал олон мөрөөр.
     Байгууллага гарчгийн хажууд БИШ дээр байгаа тул гарчиг бүтэн зайг эзэлнэ. */
  const orgRowY = margin + PAGE_ORG_ROW_H / 2;
  if (info.orgName || info.logo) {
    const orgText = (info.orgName ?? "").toUpperCase();
    ctx.font = "bold 9.5px sans-serif";
    const textW = orgText ? ctx.measureText(orgText).width : 0;
    const logoH = info.logo ? PAGE_ORG_ROW_H - 4 : 0;
    const logoW = info.logo ? (info.logo.width / info.logo.height) * logoH || logoH : 0;
    const gap = info.logo && orgText ? 6 : 0;
    // ЗҮҮН тийш шахна (өмнө нь голлуулсан байсан).
    let x = margin;
    void textW;
    if (info.logo) {
      ctx.drawImage(info.logo, x, orgRowY - logoH / 2, logoW, logoH);
      x += logoW + gap;
    }
    if (orgText) {
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(orgText, x, orgRowY);
    }
  }

  ctx.fillStyle = "#1e293b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const titleTop = margin + PAGE_ORG_ROW_H;
  const titleH = titleAreaH - PAGE_ORG_ROW_H;
  const titleMaxWidth = width - margin * 2 - 16;
  const { lines: titleLines, fontSize: titleFontSize, lineHeight: titleLineH } = layoutTitle(
    ctx,
    title.toUpperCase(),
    titleMaxWidth,
    titleH - 6,
  );
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  const titleBlockH = titleLines.length * titleLineH;
  const titleStartY = titleTop + (titleH - titleBlockH) / 2 + titleLineH / 2;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, width / 2, titleStartY + i * titleLineH);
  });

  const mapAreaX = margin;
  const mapAreaY = margin + titleAreaH;
  const mapAreaW = width - margin * 2;
  const mapAreaH = height - mapAreaY - margin;

  // "cover" байдлаар зурна — mapArea-г бүхэлд нь дүүргэж, хэтэрсэн хэсгийг тайрна
  // (Math.min биш Math.max), учир нь зурган дээрх шиг газрын зураг хуудсыг бүрэн дүүргэсэн
  // харагдацтай байх ёстой, хоосон захтай "contain" биш.
  const coverScale = Math.max(mapAreaW / mapCanvas.width, mapAreaH / mapCanvas.height);
  const drawW = mapCanvas.width * coverScale;
  const drawH = mapCanvas.height * coverScale;
  const drawX = mapAreaX + (mapAreaW - drawW) / 2;
  const drawY = mapAreaY + (mapAreaH - drawH) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(mapAreaX, mapAreaY, mapAreaW, mapAreaH);
  ctx.clip();
  ctx.drawImage(mapCanvas, drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(mapAreaX + 0.5, mapAreaY + 0.5, mapAreaW, mapAreaH);

  /* ХЭВТЭЭ: таних тэмдэг ба мэдээллийн карт НЭГ доод зурваст зэрэгцэнэ.
     БОСОО: хуудас нарийн тул ХОЁР МӨР — доор нь мэдээллийн карт, түүний
     дээр таних тэмдэг, хоёулаа БҮТЭН өргөнтэй. */
  const stacked = orientation === "portrait";
  const cardBottom = mapAreaY + mapAreaH - CARD_INSET;
  const infoY = cardBottom - INFO_CARD_H;
  const legendBottom = stacked ? infoY - CARD_INSET : cardBottom;
  const fullCardW = mapAreaW - CARD_INSET * 2;
  let legendRight = mapAreaX + CARD_INSET;
  if (legend.length) {
    /* ӨНДӨР нь мэдээллийн карттай ЯГ ИЖИЛ (INFO_CARD_H) — хоёр карт нэг
       шугамд эгнэнэ. Элемент олон бол мөрийг ЖИЖИГРҮҮЛЭХГҮЙ, оронд нь
       ХОЁР БАГАНА болгоно (жижиг үсэг цаасан дээр уншигдахгүй). */
    let legendH = INFO_CARD_H;
    const headerH = 16;
    const rowH = 10;
    let maxRows = Math.max(1, Math.floor((legendH - headerH - 4) / rowH));

    ctx.font = "bold 8px sans-serif";
    const titleTextWidth = ctx.measureText("Таних тэмдэг").width;
    ctx.font = "7px sans-serif";
    const maxRowTextWidth = Math.max(...legend.map((item) => ctx.measureText(item.label).width));
    const colW = Math.min(150, Math.max(92, maxRowTextWidth + 21));
    /* Баганын тоо — мэдээллийн картад ~300px үлдээх хэмжээгээр (ГУС-ийн дэд
       давхаргууд олноор сонгогдоход 3 багана хүрэлцдэггүй). Тэр ч багтахгүй
       бол картыг ДЭЭШ өндөрсгөнө ("… бусад N" гэвэл зураг дээр нэр байхгүй
       тул юу болох нь мэдэгдэхгүй) — газрын зургийн талбайн хагасаас
       хэтэрвэл л сүүлийн мөрийг "… бусад N" болгоно. */
    const maxCols = stacked
      ? Math.max(1, Math.floor((fullCardW - 6) / colW))
      : Math.max(3, Math.floor((mapAreaW - CARD_INSET * 3 - 300 - 6) / colW));
    const cols = Math.max(1, Math.min(maxCols, Math.ceil(legend.length / maxRows)));
    if (legend.length > cols * maxRows) {
      const rowsLimit = Math.max(maxRows, Math.floor((mapAreaH / 2 - headerH - 4) / rowH));
      maxRows = Math.min(rowsLimit, Math.ceil(legend.length / cols));
      legendH = Math.max(INFO_CARD_H, headerH + 4 + maxRows * rowH);
    }
    const capacity = cols * maxRows;
    if (legend.length > capacity) {
      const rest = legend.length - capacity + 1;
      legend = [...legend.slice(0, capacity - 1), { color: "", label: `… бусад ${rest}`, total: true }];
    }
    const perCol = Math.ceil(legend.length / cols);
    const legendW = stacked ? fullCardW : Math.max(titleTextWidth + 16, colW * cols + 6);
    const legendX = mapAreaX + CARD_INSET;
    const legendY = legendBottom - legendH;
    // Босоо үед мэдээллийн карт таних тэмдгийн ДООР, зүүн захаас эхэлнэ.
    if (!stacked) legendRight = legendX + legendW + CARD_INSET;

    ctx.fillStyle = "rgba(255,255,255,0.94)";
    drawRoundedRect(ctx, legendX, legendY, legendW, legendH, 6);
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#334155";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Таних тэмдэг", legendX + 6, legendY + 5);

    ctx.font = "7px sans-serif";
    legend.forEach((item, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = legendX + 6 + col * colW;
      const swatchY = legendY + headerH + row * rowH + rowH / 2;
      if (item.total) {
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 7px sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(ellipsize(ctx, item.label, colW - 4), x, swatchY);
        ctx.font = "7px sans-serif";
        ctx.textBaseline = "top";
        return;
      }
      if (item.line) {
        // Хилийн давхарга — ШУГАМААР (хэвлэхэд дүүргэлт байхгүй тул
        // дөрвөлжин тэмдэг нь бодит харагдацтай таарахгүй).
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x, swatchY);
        ctx.lineTo(x + 9, swatchY);
        ctx.stroke();
      } else if (item.hatch) {
        drawHatchSwatch(ctx, x, swatchY - 3, 9, 6, item.color, item.hatch);
      } else {
        ctx.fillStyle = item.color;
        ctx.fillRect(x, swatchY - 3, 9, 6);
      }
      ctx.fillStyle = "#334155";
      ctx.textBaseline = "middle";
      ctx.fillText(ellipsize(ctx, item.label, colW - 16), x + 12, swatchY);
      ctx.textBaseline = "top";
    });
  }

  // ЗҮГ ЧИГИЙН тэмдэг — газрын зургийн баруун дээд булан
  drawNorthArrow(ctx, mapAreaX + mapAreaW - 32, mapAreaY + 32, 20);

  /* ── МЭДЭЭЛЛИЙН КАРТ ───────────────────────────────────────────────
     Таних тэмдэгтэй ЯГ ИЖИЛ хэлбэр (цагаан дэвсгэр, ижил хүрээ) —
     газрын зургийн ДЭЭР хөвнө. Чөлөөлөлтийн хилийг дуудагч тал нь
     доод зурваст оруулахгүй байрлуулдаг тул энэ карт хилийг халхлахгүй. */
  const infoX = legendRight;
  const infoW = mapAreaX + mapAreaW - CARD_INSET - infoX;

  if (infoW > 200) {
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    drawRoundedRect(ctx, infoX, infoY, infoW, INFO_CARD_H, 6);
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Гарчиг — таних тэмдэгтэй ижил хэлбэр
    ctx.fillStyle = "#334155";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Дэлгэрэнгүй мэдээлэл", infoX + 8, infoY + 5);

    const padX = 8;
    const rowH = 10.5;
    const pieBoxW = 62;
    const colW = (infoW - padX * 2 - pieBoxW) / 2;
    const col1X = infoX + padX;
    const col2X = col1X + colW;
    const pieCx = col2X + colW + pieBoxW / 2;

    const drawRow = (x: number, y: number, label: string, value: string, maxW: number) => {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "6.8px sans-serif";
      ctx.fillStyle = "#64748b";
      /* ШОШГЫГ ЗААВАЛ тайрна. Өмнө нь шошгыг бүтнээр нь зураад утгыг
         maxW*0.6 дээр эхлүүлдэг байсан тул урт шошготой мөр дээр хоёул
         ДАВХАРЛАДАГ байв (босоо хэвлэхэд илт харагдана). */
      const labelText = ellipsize(ctx, label, maxW * 0.62);
      ctx.fillText(labelText, x, y);
      const labelW = ctx.measureText(labelText).width + 3;
      ctx.font = "bold 7.6px sans-serif";
      ctx.fillStyle = "#1e293b";
      // fillText-ийн maxWidth нь текстийг ШАХДАГ тул оронд нь тайрч "…" залгана.
      ctx.fillText(ellipsize(ctx, value || "—", maxW - labelW), x + labelW, y);
    };

    let y = infoY + 21;
    drawRow(col1X, y, "Төлөвлөлтийн дугаар:", info.planCode || "—", colW - 8); y += rowH;
    drawRow(col1X, y, "Төлөвлөлтийн нэр:", info.planName || "—", colW - 8); y += rowH;
    drawRow(col1X, y, "НИТХ тогтоолын дугаар:", info.nithDecreeNumber || "—", colW - 8); y += rowH;
    drawRow(col1X, y, "Чөлөөлөх талбай:", areaText(info.acquisitionAreaM2), colW - 8); y += rowH;
    drawRow(col1X, y, "Нэгж талбаруудын нийт талбай:", areaText(info.parcelsAreaM2), colW - 8); y += rowH;
    if (viewInfo) {
      const denominator = computeScaleDenominator(viewInfo, coverScale);
      if (denominator > 0) drawRow(col1X, y, "Масштаб:", `1:${denominator.toLocaleString("en-US")}`, colW - 8);
    }

    y = infoY + 21;
    const dept = [info.departmentCode, info.departmentName].filter(Boolean).join(" · ");
    drawRow(col2X, y, "Хэлтэс:", dept || "—", colW - 8); y += rowH;
    drawRow(col2X, y, "Явц:", info.statusName || "—", colW - 8); y += rowH;
    drawRow(col2X, y, "Хариуцсан:", (info.specialists ?? []).join(", ") || "—", colW - 8); y += rowH;
    drawRow(col2X, y, "Огноо:", formatDateDots(new Date()), colW - 8);

    const pieCy = infoY + 18 + (INFO_CARD_H - 18) / 2 - 4;
    const pieR = Math.min(19, INFO_CARD_H / 2 - 11);
    drawProgressPie(ctx, pieCx, pieCy, pieR, info.progressBreakdown ?? []);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0acf97";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText(`${Math.round(info.progressPercent ?? 0)}%`, pieCx, pieCy);
    ctx.fillStyle = "#64748b";
    ctx.font = "6.5px sans-serif";
    ctx.fillText("Гүйцэтгэл", pieCx, infoY + INFO_CARD_H - 8);
  }

  return page;
}

/**
 * Урьдчилан бэлдсэн хуудасны canvas-ыг A4 хэмжээтэй PDF болгож татаж авна.
 */
export async function downloadCanvasAsPdf(
  canvas: HTMLCanvasElement,
  orientation: PrintOrientation,
  fileName = "gazriin-zurag",
  paper: PrintPaperSize = "A4",
): Promise<void> {
  const blob = await canvasToPdfBlob(canvas, orientation, paper);
  downloadBlob(blob, `${fileName}.pdf`);
}

/**
 * Хуудасны canvas → нэг хуудастай PDF (Blob).
 *
 * `jpegQuality` өгвөл зургийг JPEG-ээр шигтгэнэ: хиймэл дагуулын зурагтай
 * хуудас PNG-ээр 10–20MB хүрч, хавсралтын хязгаарт (backend 20MB) багтдаггүй.
 * JPEG нь ижил харагдацтайгаар хэд дахин бага.
 */
export async function canvasToPdfBlob(
  canvas: HTMLCanvasElement,
  orientation: PrintOrientation,
  paper: PrintPaperSize = "A4",
  jpegQuality?: number,
): Promise<Blob> {
  const jpeg = jpegQuality != null;
  const bytes = await fetch(
    jpeg ? canvas.toDataURL("image/jpeg", jpegQuality) : canvas.toDataURL("image/png"),
  ).then((r) => r.arrayBuffer());

  const pt = PAPER_PT[paper];
  const pageSize = orientation === "landscape" ? { width: pt.height, height: pt.width } : pt;

  const pdfDoc = await PDFDocument.create();
  const img = jpeg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
  const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  page.drawImage(img, { x: 0, y: 0, width: pageSize.width, height: pageSize.height });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Зарим браузер click-ийн дараа шууд revoke хийвэл таталтыг тасалдаг
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
