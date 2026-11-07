/**
 * Газрын зураг дээрх ШОШГЫГ (өмчлөгчийн нэр г.м) ДАВХЦУУЛАХГҮЙ байрлуулна.
 *
 * Өмнө нь нэр бүрийг нэгж талбарынхаа дотор цэгт шууд зурдаг байсан тул
 * чөлөөлөгдөөгүй нэгж талбар олонтой (жижиг, нягт) газарт нэрс бие биен
 * дээгүүр давхарлаж огт уншигдахгүй болдог байв. Энд:
 *
 *   1) ТОМ нэгж талбарын нэрийг түрүүлж байрлуулна (weight-ээр);
 *   2) нэр бүрт хэд хэдэн хувилбар туршина — бүтэн нэр, хоёр мөр,
 *      товчилсон нэр ("Батболд Болд" → "Б.Болд"), бага зэрэг жижиг үсэг,
 *      дээш/доош бага зэрэг шилжүүлэх;
 *   3) аль нь ч багтахгүй бол тэр нэрийг ЗУРАХГҮЙ (тоог нь буцаана) —
 *      давхарласан уншигдахгүй нэрнээс хасагдсан нь дээр.
 *
 * Canvas-аас хамааралгүй (measure-ийг дуудагч өгнө) тул тестэд шууд шалгагдана.
 */

export interface LabelInput {
  /** Шошгоны төв — canvas-ын px */
  x: number;
  y: number;
  text: string;
  /** Их нь түрүүлж байрлана (ж: нэгж талбарын талбай). */
  weight?: number;
}

export interface PlacedLabel {
  x: number;
  y: number;
  lines: string[];
  fontPx: number;
}

export interface PlaceLabelsOptions {
  fontPx: number;
  /** Тухайн үсгийн хэмжээтэй текстийн өргөн (px) */
  measure: (text: string, fontPx: number) => number;
  width: number;
  height: number;
  /** Хамгийн бага үсэг — fontPx-ийн хэдэн хувь (өгөгдмөл 0.8) */
  minScale?: number;
}

/** Хуулийн этгээдийн нэрийг ТОВЧЛОХГҮЙ ("Тэнгэр ХХК" → "Т.ХХК" болохоос сэргийлнэ). */
const LEGAL_ENTITY = /(ххк|төхк|\bхк\b|ххн|нөхөрлөл|компани|корпораци|групп|холдинг|\bсан\b|холбоо|байгууллага|газар|алба|яам|хороо|сургууль|llc|corporation)/i;

/** "Батболд Болд" → "Б.Болд". Товчлох боломжгүй бол null. */
export function abbreviateName(text: string): string | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || LEGAL_ENTITY.test(text)) return null;
  const first = Array.from(words[0])[0];
  if (!first) return null;
  return `${first.toUpperCase()}.${words.slice(1).join(" ")}`;
}

/** Хамгийн тэнцүү хоёр мөрөнд хуваана (үг хоорондын зайгаар). */
function splitTwoLines(text: string): string[] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;
  let best: string[] | null = null;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Хайлтыг хурдасгах энгийн тор — нэг шошгыг бүх шошготой харьцуулахгүй. */
class BoxGrid {
  private cells = new Map<string, Box[]>();
  private size: number;
  constructor(size: number) {
    this.size = size;
  }
  private keys(b: Box): string[] {
    const out: string[] = [];
    const s = this.size;
    for (let i = Math.floor(b.x0 / s); i <= Math.floor(b.x1 / s); i++)
      for (let j = Math.floor(b.y0 / s); j <= Math.floor(b.y1 / s); j++) out.push(`${i}:${j}`);
    return out;
  }
  hits(b: Box): boolean {
    return this.keys(b).some((k) =>
      (this.cells.get(k) ?? []).some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0),
    );
  }
  add(b: Box): void {
    this.keys(b).forEach((k) => {
      const list = this.cells.get(k);
      if (list) list.push(b);
      else this.cells.set(k, [b]);
    });
  }
}

export function placeLabels(
  labels: LabelInput[],
  opts: PlaceLabelsOptions,
): { placed: PlacedLabel[]; skipped: number } {
  const { fontPx, measure, width, height } = opts;
  const minScale = opts.minScale ?? 0.8;
  const fonts = [fontPx, fontPx * ((1 + minScale) / 2), fontPx * minScale];
  // Цагаан хүрээ (stroke) ба шошго хоорондын бага зай
  const pad = Math.max(1.5, fontPx * 0.2);
  const grid = new BoxGrid(Math.max(8, fontPx * 6));
  const placed: PlacedLabel[] = [];
  let skipped = 0;

  const ordered = labels
    .filter((l) => l.text.trim() && l.x >= 0 && l.y >= 0 && l.x <= width && l.y <= height)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  skipped += labels.length - ordered.length;

  for (const label of ordered) {
    const text = label.text.trim();
    const abbr = abbreviateName(text);
    // Хувилбарууд — ЭРЭМБЭ ЧУХАЛ: эхнийх нь хамгийн уншигдахуйц.
    const variants: string[][] = [[text]];
    const two = splitTwoLines(text);
    if (two) variants.push(two);
    if (abbr) variants.push([abbr]);

    let done = false;
    for (const f of fonts) {
      const lineH = f * 1.15;
      for (const lines of variants) {
        const w = Math.max(...lines.map((s) => measure(s, f))) + pad * 2;
        const h = lines.length * lineH + pad * 2;
        for (const dy of [0, -h * 0.6, h * 0.6]) {
          const cy = label.y + dy;
          const box = { x0: label.x - w / 2, y0: cy - h / 2, x1: label.x + w / 2, y1: cy + h / 2 };
          if (box.x0 < 0 || box.y0 < 0 || box.x1 > width || box.y1 > height) continue;
          if (grid.hits(box)) continue;
          grid.add(box);
          placed.push({ x: label.x, y: cy, lines, fontPx: f });
          done = true;
          break;
        }
        if (done) break;
      }
      if (done) break;
    }
    if (!done) skipped++;
  }
  return { placed, skipped };
}
