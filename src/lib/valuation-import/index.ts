// Excel файлыг browser дээр задлан ParsedValuation болгох нэвтрэх цэг.
// xlsx (SheetJS) нь зөвхөн browser дээр ажиллах тул DINAMIC IMPORT ашиглаж,
// үндсэн bundle-д орохоос сэргийлж, SSR үед `window` алдаа гаргахгүй.

import { extractValuation, mapSheets, type Grid, type Workbook } from "./extract.ts";
import { extractSingleSheet } from "./extract-single.ts";
import { countSections } from "./sections.ts";
import { validateParsed } from "./validate.ts";
import type { ParsedValuation } from "./types.ts";
import { logger } from "../logger.ts";

export * from "./types.ts";
export { extractValuation } from "./extract.ts";
export { extractSingleSheet } from "./extract-single.ts";
export { splitSections, isSingleSheetLayout, countSections } from "./sections.ts";
export { validateParsed } from "./validate.ts";

/**
 * Workbook-ийн загварыг таньж (шинэ: нэг sheet дээрх 3.1–5.1 хэсгүүд / хуучин: хүснэгт
 * бүр тусдаа sheet) тохирох задлагчаар уншина. Хуучин файл хэвээр ажиллана.
 */
export function extractAnyLayout(
  wb: Workbook,
  hidden: ReadonlySet<string> = new Set(),
): Omit<ParsedValuation, "warnings"> {
  // Нуугдсан (hidden) sheet-үүдийг загвар таних шийдвэрт оруулахгүй: шинэ "загвар-2025"
  // файлууд дотроо хуучин загварын БӨГЛӨӨГҮЙ/жишээ sheet-үүдийг нууж хадгалдаг тул
  // тэднээр нь хуучин загвар гэж андуурвал бүх файл ижил (жишээ) дүнтэй орж ирнэ.
  const all = Object.keys(wb);
  const visible = all.filter((n) => !hidden.has(n));
  const names = visible.length ? visible : all;
  // ХУУЧИН загварыг УРЬТАЛНА: хүснэгт бүр тусдаа sheet дээр байгаа нь sheet нэрээр
  // танигдвал тэр замаар уншина. (Хуучин файлууд дотроо "ҮТ-загвар" гэсэн БӨГЛӨӨГҮЙ
  // нэг хуудсан загвар агуулж болох тул зөвхөн хэсгийн тоогоор шийдэж болохгүй.)
  const sheetMap = mapSheets(names);
  const legacyHits = ["propertyDesc", "buildingCost", "otherAssets", "landValuation"].filter(
    (k) => sheetMap[k],
  ).length;
  if (legacyHits >= 2) return extractValuation(wb);

  // ШИНЭ загвар: хамгийн олон хэсэг танигдсан хуудсыг сонгоно.
  let best: string | null = null;
  let bestScore = 0;
  for (const name of names) {
    const score = countSections(wb[name]);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  if (best && bestScore >= 3) return extractSingleSheet(wb[best]);
  return extractValuation(wb);
}

/** Задлан авсан workbook-оос ParsedValuation (extract + validate) үүсгэх. */
export function buildValuation(wb: Workbook, hidden?: ReadonlySet<string>): ParsedValuation {
  const base = extractAnyLayout(wb, hidden);
  return { ...base, warnings: validateParsed(base) };
}

/**
 * Excel файлыг уншиж, sheet бүрийг мөр×баганын матриц (Grid) болгож,
 * ParsedValuation буцаана. Файлыг ХЭЗЭЭ Ч сервер рүү илгээхгүй — бүх боловсруулалт client дээр.
 */
export async function parseValuationFile(file: File): Promise<ParsedValuation> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wbRaw = XLSX.read(buf, { cellFormula: false, cellText: true, cellDates: false });
  const wb: Workbook = {};
  // Hidden: 0 = харагдана, 1 = hidden, 2 = very hidden
  const hidden = new Set(
    (wbRaw.Workbook?.Sheets ?? []).filter((s) => s.Hidden && s.name).map((s) => s.name as string),
  );
  for (const name of wbRaw.SheetNames) {
    const ws = wbRaw.Sheets[name];
    wb[name] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: true,
    }) as Grid;
  }
  return buildValuation(wb, hidden);
}

/**
 * Файлын SHA-256 hash (давхардал шалгах — client дээр, файл серверт очихгүй).
 * `crypto.subtle` нь зөвхөн secure context (https эсвэл localhost) дээр байдаг.
 * http (LAN IP г.м) орчинд байхгүй бол hash-ийг алгасаж, "" буцаана — импортыг
 * зогсоохгүй (hash нь заавал биш, давхардал шалгахад л хэрэглэгддэг).
 */
export async function fileSha256(file: File): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return "";
    const buf = await file.arrayBuffer();
    const digest = await subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (err) {
    // subtle.digest байхгүй (http/LAN орчин) эсвэл файл уншиж чадаагүй — хэш
    // алгасах нь зорилготой зан төлөв тул warn түвшинд л тэмдэглэнэ.
    logger.warn("file sha256 hash failed", { error: String(err) });
    return "";
  }
}
