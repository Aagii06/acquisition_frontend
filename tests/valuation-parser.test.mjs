import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as xlsx from "xlsx";

import { fixHomoglyphs, normalizeText, parseNumber } from "../src/lib/valuation-import/normalize.ts";
import { bestMatch, similarity } from "../src/lib/valuation-import/fuzzy.ts";
import { detectKind } from "../src/lib/valuation-import/kind.ts";
import { buildValuation } from "../src/lib/valuation-import/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "..", "compensation.xlsx");
// Шинэ (нэг sheet) загварын жишээ файлууд — scripts/gen-valuation-samples.mjs үүсгэнэ.
const SAMPLE_SMALL = path.join(__dirname, "fixtures", "valuation-sample-small.xlsx");
const SAMPLE_FULL = path.join(__dirname, "fixtures", "valuation-sample-full.xlsx");

/** Excel файлыг sheet бүрээр нь Grid болгон унших (parseValuationFile-тай ижил тохиргоо). */
function readWorkbook(file) {
  const raw = xlsx.read(fs.readFileSync(file), { cellFormula: false, cellText: true });
  const wb = {};
  for (const n of raw.SheetNames) {
    wb[n] = xlsx.utils.sheet_to_json(raw.Sheets[n], {
      header: 1,
      blankrows: false,
      defval: "",
      raw: true,
    });
  }
  return wb;
}

// ── normalize ──
test("parseNumber: тоо биш утгыг null болгоно (0 биш)", () => {
  assert.equal(parseNumber("д/д"), null);
  assert.equal(parseNumber("#ERROR!"), null);
  assert.equal(parseNumber(""), null);
});

test("parseNumber: нэгж, мянгатын таслал, аравтыг зөв уншина", () => {
  assert.equal(parseNumber("480 м.Кв"), 480);
  assert.equal(parseNumber("1,606,000"), 1606000);
  assert.equal(parseNumber("36 500"), 36500);
  assert.equal(parseNumber("1.054"), 1.054);
});

test("fixHomoglyphs: латин үсгийг кирилл дүрс адил үсгээр солино", () => {
  // c→с, y→у, y→у, ц→ц ⇒ "сууц"
  assert.equal(fixHomoglyphs("cyyц"), "сууц");
});

test("normalizeText: зай + том үсэг + homoglyph жигдэрнэ", () => {
  assert.equal(normalizeText("  Газрын   ҮНЭЛГЭЭ "), "газрын үнэлгээ");
});

// ── fuzzy ──
test("bestMatch: sheet нэрийг ойролцоо утгаар олно", () => {
  const names = ["газрын үнэлгээ", "Бусад хөрөнгө", "Түр сууршуулах"];
  const m = bestMatch("газар үнэлгээ", names, 0.75);
  assert.ok(m);
  assert.equal(m.value, "газрын үнэлгээ");
});

test("similarity: огт хамааралгүй бичвэрт бага оноо", () => {
  assert.ok(similarity("газар", "хашаа") < 0.5);
});

// ── kind ──
test("detectKind: барилга→real_state, хашаа→property, газар→null", () => {
  assert.equal(detectKind("Байшин"), "real_state");
  assert.equal(detectKind("Хувийн сууц"), "real_state");
  assert.equal(detectKind("Хашаа"), "property");
  assert.equal(detectKind("Хашааны хаалга"), "property");
  assert.equal(detectKind("Газар"), null);
});

// ── бүрэн pipeline: жишиг compensation.xlsx дээр ──
test("buildValuation: compensation.xlsx-ийг зөв задална", (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip("compensation.xlsx олдсонгүй");
    return;
  }
  const wbRaw = xlsx.read(fs.readFileSync(FIXTURE), { cellFormula: false, cellText: true });
  const wb = {};
  for (const n of wbRaw.SheetNames) {
    wb[n] = xlsx.utils.sheet_to_json(wbRaw.Sheets[n], {
      header: 1,
      blankrows: false,
      defval: "",
      raw: true,
    });
  }
  const v = buildValuation(wb);

  // Газар
  assert.equal(v.land.ownerName, "Н.Туул");
  assert.equal(v.land.affectedAreaM2, 480);
  assert.equal(v.land.basePriceM2, 175000);
  assert.equal(v.land.certNo, "Г-2202012474");
  assert.equal(v.land.parcelNo, "18642316854193");

  // Хоёр үл хөдлөх (Байшин-1, Байшин-2) тус тусын өртгийн баганатай
  const buildings = v.assets.filter((a) => a.kind === "real_state" && a.building);
  assert.equal(buildings.length, 2, "2 барилга байх ёстой");
  const b1 = buildings.find((a) => a.name.includes("Байшин-1"));
  const b2 = buildings.find((a) => a.name.includes("Байшин-2"));
  assert.ok(b1 && b2, "Байшин-1 ба Байшин-2 хоёулаа олдох ёстой");
  assert.equal(b1.building.replacementCost, 110019854.6);
  assert.equal(b2.building.replacementCost, 26608289.32);
  assert.equal(b1.building.unitCostM2, 833032.71);
  assert.ok(b1.building.coefficients.length >= 3);

  // Эд хөрөнгө нь property болсон байх ба үнэ нь Бусад хөрөнгөнөөс тааруулагдсан
  const fence = v.assets.find((a) => a.name.includes("Хашаа") && !a.name.includes("болок"));
  assert.equal(fence.kind, "property");
  assert.equal(fence.totalPrice, 1606000);

  // Толгойн мөр хөрөнгө болж орж ирээгүй байх (parseNumber засвар)
  assert.ok(v.assets.every((a) => a.name && !a.name.includes("Үнэлж буй")));

  // Түр суурьшуулах зардал
  const clearance = v.clearance.find((c) => c.totalPrice === 3000000);
  assert.ok(clearance, "3сая түр суурьшуулах зардал олдсон байх");

  // Байгууллага
  assert.equal(v.org.director, "Д. Биндэръяа");
});

// ── Робуст байдал: sheet байршил + багана/мөрийн тохиргоо өөрчлөгдсөн ч бүрэн уншина ──
test("buildValuation: багана/мөр/sheet өөрчлөгдсөн ч бүрэн уншина", (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip("compensation.xlsx олдсонгүй");
    return;
  }
  const wbRaw = xlsx.read(fs.readFileSync(FIXTURE), { cellFormula: false, cellText: true });
  const base = {};
  for (const n of wbRaw.SheetNames)
    base[n] = xlsx.utils.sheet_to_json(wbRaw.Sheets[n], { header: 1, blankrows: false, defval: "", raw: true });

  const insertCol = (aoa, at, hv) =>
    aoa.map((r, i) => {
      const c = r.slice();
      c.splice(at, 0, i === 1 ? hv : "");
      return c;
    });

  // Хосолсон өөрчлөлт: багана шилжүүлэх/нэмэх + бүх sheet-д дээд мөр + sheet дараалал урвуулах
  const m = {};
  for (const k in base) m[k] = base[k].map((r) => r.slice());
  m["Бусад хөрөнгө"] = m["Бусад хөрөнгө"].map((r) => ["", ...r]);
  m["Түр сууршуулах"] = m["Түр сууршуулах"].map((r) => ["", "", ...r]);
  m["хөрөнгийн тодорхойлолт"] = insertCol(m["хөрөнгийн тодорхойлолт"], 3, "Нэмэлт");
  m["барилга өртгийн хандлага"] = insertCol(m["барилга өртгийн хандлага"], 2, "x");
  for (const k in m) m[k] = [[""]].concat(m[k]);
  const wb = {};
  for (const n of Object.keys(m).reverse()) wb[n] = m[n];

  const v = buildValuation(wb);
  assert.equal(v.land.basePriceM2, 175000, "газрын суурь үнэ");
  assert.equal(v.land.affectedAreaM2, 480, "газрын талбай");
  const b = v.assets.find((a) => a.building);
  assert.ok(b && b.building.unitCostM2 === 833032.71, "барилгын нэгж өртөг");
  assert.equal(b.building.replacementCost, 110019854.6, "нөхөн орлуулах өртөг");
  const fence = v.assets.find((a) => /^Хашаа$/.test(a.name));
  assert.ok(fence && fence.kind === "property" && fence.totalPrice === 1606000, "эд хөрөнгийн үнэ");
  assert.ok(v.clearance.some((c) => c.totalPrice === 3000000), "түр суурьшуулах зардал");
});

// ── ШИНЭ загвар: нэг sheet дээрх 3.1–5.1 хэсгүүд ──

test("шинэ загвар: бага хэмжээний жишээг бүрэн задална", (t) => {
  if (!fs.existsSync(SAMPLE_SMALL)) {
    t.skip("жишээ файл олдсонгүй — node scripts/gen-valuation-samples.mjs");
    return;
  }
  const v = buildValuation(readWorkbook(SAMPLE_SMALL));

  assert.equal(v.layout, "single-sheet");

  // Газар — Хүснэгт-2 (эрх зүйн байдал) ба Хүснэгт-3 (үнэлгээ)
  assert.equal(v.land.ownerName, "Батболд Оюунчимэг");
  assert.equal(v.land.certNo, "Г-2201004512");
  assert.equal(v.land.parcelNo, "18642316854193");
  assert.equal(v.land.stateRegNo, "УБ-2021-004512");
  assert.equal(v.land.purpose, "Гэр бүлийн хэрэгцээ");
  assert.equal(v.land.affectedAreaM2, 420);
  assert.equal(v.land.basePriceM2, 165000);
  assert.equal(v.land.totalValue, 69300000);

  // Хөрөнгө: 1 барилга + 3 эд хөрөнгө (загварын хоосон мөр орж ирээгүй)
  assert.equal(v.assets.length, 4, "4 хөрөнгө байх ёстой");
  const bld = v.assets.find((a) => a.kind === "real_state");
  assert.ok(bld, "барилга олдох ёстой");
  assert.equal(bld.name, "Барилга-1");
  assert.equal(bld.building.unitCostM2, 833032.71);
  assert.equal(bld.building.replacementCost, 49519778.06);
  assert.equal(bld.building.areaM2, 72.4);
  assert.equal(bld.building.coefficients.length, 4);
  assert.equal(bld.floorCount, 1, "давхрын тоо Хүснэгт-4-өөс");
  assert.equal(bld.spec.items.length, 10, "барилгын 10 үзүүлэлт");
  assert.equal(
    bld.spec.items.find((x) => x.label === "Хана").value,
    "Модон хүрээ, дүүргэгчтэй",
  );

  const fence = v.assets.find((a) => a.name === "Хашаа-модон");
  assert.equal(fence.kind, "property");
  assert.equal(fence.unitPrice, 16500);
  assert.equal(fence.totalPrice, 1584000);
  assert.ok(!v.assets.some((a) => /^Газар/.test(a.name)), "газар хөрөнгө болж орохгүй");

  // Зардал: 1 түр суурьшуулах + 2 газар чөлөөлөх (ОАБ хоосон)
  assert.equal(v.clearance.length, 3);
  assert.ok(v.clearance.some((c) => c.category.includes("Түр суурьшуулах") && c.totalPrice === 2700000));
  assert.ok(v.clearance.some((c) => c.category.includes("Газар чөлөөлөх") && c.totalPrice === 868800));

  // Нэгтгэл
  assert.equal(v.summaryTotal, 124812578.06);

  // ТАЙЛБАР — хүснэгт бүрийн
  assert.match(v.notes.land_valuation, /359 дүгээр тогтоол/);
  assert.match(v.notes.building_spec, /хээрийн судалгаа/);
  assert.match(v.notes.building_cost, /Элэгдлийн хувийг/);
  assert.match(v.notes.other_assets, /3 харьцуулалт/);
  assert.match(v.notes.temporary_cost, /түрээсийн/);
  assert.match(v.notes.clearance_cost, /хогийн цэгийн хураамж/);
  assert.match(v.notes.lost_income, /ОАБ тооцоогүй/);
  assert.match(v.notes.certification, /үнэлгээний стандарт/);
});

test("шинэ загвар: их өгөгдөлтэй жишээг бүрэн задална", (t) => {
  if (!fs.existsSync(SAMPLE_FULL)) {
    t.skip("жишээ файл олдсонгүй — node scripts/gen-valuation-samples.mjs");
    return;
  }
  const v = buildValuation(readWorkbook(SAMPLE_FULL));

  assert.equal(v.layout, "single-sheet");
  assert.equal(v.land.ownerName, "Дамдинсүрэн Болд");
  assert.equal(v.land.affectedAreaM2, 1240.5);
  assert.equal(v.land.basePriceM2, 287500);

  // 3 барилга — тус бүр өөрийн өртгийн багана ба үзүүлэлтийн баганатай
  const blds = v.assets.filter((a) => a.kind === "real_state");
  assert.equal(blds.length, 3);
  const b1 = blds.find((a) => a.name === "Барилга-1");
  const b3 = blds.find((a) => a.name === "Барилга-3");
  assert.equal(b1.building.replacementCost, 180606602.57);
  assert.equal(b3.building.replacementCost, 6786937.75);
  assert.equal(b1.floorCount, 2);
  assert.equal(b3.floorCount, 1);
  assert.equal(
    b1.spec.items.find((x) => x.label === "Чанар").value,
    "Сайн",
  );
  // Итгэлцүүр бүлгийн мөрүүд merge хийгдсэн ч бүгд уншигдана
  assert.equal(b1.building.coefficients.length, 4);
  assert.ok(b1.building.items.some((x) => x.group === "Итгэлцүүр" && x.label === "Халаалт"));

  // 19 хөрөнгө (20 мөрөөс газар хасагдана), бүгд үнэтэй
  assert.equal(v.assets.length, 19);
  assert.ok(v.assets.every((a) => a.totalPrice != null && a.totalPrice > 0));
  const gate = v.assets.find((a) => a.name.includes("гоёлын гүйдэг"));
  assert.equal(gate.totalPrice, 4200000);

  // Гурван зардлын хүснэгт (түр суурьшуулах, газар чөлөөлөх, ОАБ)
  const cats = new Set(v.clearance.map((c) => c.category));
  assert.equal(cats.size, 3);
  assert.ok(v.clearance.some((c) => c.category.includes("Орлогын алдагдсан") && c.totalPrice === 2250000));
  assert.equal(v.clearance.filter((c) => c.category.includes("Газар чөлөөлөх")).length, 6);

  // Олон мөрт ТАЙЛБАР бүрэн хадгалагдана
  assert.ok(v.notes.land_valuation.includes("\n"), "олон мөрт тайлбар");
  assert.match(v.notes.clearance_cost, /Контейнер зөөвөрлөлт/);
  assert.match(v.notes.certification, /хүчинтэй хугацаа/);
});

test("шинэ загвар: мөр нэмэгдэхэд (багана тогтмол) бүрэн уншина", (t) => {
  if (!fs.existsSync(SAMPLE_SMALL)) {
    t.skip("жишээ файл олдсонгүй — node scripts/gen-valuation-samples.mjs");
    return;
  }
  const wb = readWorkbook(SAMPLE_SMALL);
  const grid = wb["Sheet1"];
  const base = buildValuation({ Sheet1: grid.map((r) => r.slice()) });

  // Загварт өгөгдөл ЗӨВХӨН доошоо нэмэгддэг: "Бусад эд хөрөнгө"-д 2 мөр,
  // "Газар чөлөөлөх"-д 1 мөр нэмж, эрэмбэ/задлалт хэвээр эсэхийг шалгана.
  const rowIdx = (pred) => grid.findIndex(pred);
  const otherRow = rowIdx((r) => String(r[1] ?? "") === "Мод-навчит" && r[6]);
  const clearRow = rowIdx((r) => String(r[1] ?? "") === "Хог хаягдлын зардал");
  assert.ok(otherRow > 0 && clearRow > 0);

  const grown = grid.map((r) => r.slice());
  grown.splice(clearRow + 1, 0, [3, "Нүүлгэн шилжүүлэх зардал", "", "удаа", 2, 500000, 1000000]);
  grown.splice(otherRow + 1, 0,
    [4, "Хашлага-төмөр", "", "м.кв", 10, 90000, 900000],
    [5, "Хүлэмж", "", "м.кв", 12, 200000, 2400000],
  );
  const v = buildValuation({ Sheet1: grown });

  assert.equal(v.assets.length, base.assets.length + 2, "2 шинэ хөрөнгө нэмэгдэнэ");
  assert.equal(v.clearance.length, base.clearance.length + 1, "1 шинэ зардал нэмэгдэнэ");
  assert.equal(v.assets.find((a) => a.name === "Хүлэмж").totalPrice, 2400000);
  assert.equal(
    v.clearance.find((c) => c.name === "Нүүлгэн шилжүүлэх зардал").totalPrice,
    1000000,
  );
  // Мөр нэмэгдсэн ч газрын үнэлгээ, барилга, тайлбар хэвээр
  assert.equal(v.land.basePriceM2, base.land.basePriceM2);
  assert.equal(
    v.assets.find((a) => a.kind === "real_state").building.replacementCost,
    base.assets.find((a) => a.kind === "real_state").building.replacementCost,
  );
  assert.deepEqual(v.notes, base.notes);
});

test("шинэ загвар: хүснэгтийн дугаар, нэр, дарааллыг хадгална", (t) => {
  if (!fs.existsSync(SAMPLE_FULL)) {
    t.skip("жишээ файл олдсонгүй — node scripts/gen-valuation-samples.mjs");
    return;
  }
  const v = buildValuation(readWorkbook(SAMPLE_FULL));

  // Дугаар ба "Хүснэгт-N" шошго Excel-ээс яг ирнэ
  assert.equal(v.sections.property_desc.no, "3.1");
  assert.equal(v.sections.property_desc.label, "Хүснэгт 1");
  assert.equal(v.sections.land_valuation.no, "3.3");
  assert.equal(v.sections.land_valuation.label, "Хүснэгт-3");
  assert.equal(v.sections.land_valuation.title, "Газрын үнэлгээ");
  assert.equal(v.sections.lost_income.no, "3.9");
  assert.equal(v.sections.summary.no, "4.1");

  // Дараалал нь Excel дэх байрлалаар (3.1 → 5.1)
  const ordered = Object.entries(v.sections)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([k]) => k);
  assert.deepEqual(ordered, [
    "property_desc",
    "land_legal",
    "land_valuation",
    "building_spec",
    "building_cost",
    "other_assets",
    "temporary_cost",
    "clearance_cost",
    "lost_income",
    "summary",
    "conclusion",
    "certification",
  ]);
});

test("хуучин загвар: хүснэгтийн мета мэдээлэл хоосон (задлалт хэвээр)", (t) => {
  if (!fs.existsSync(FIXTURE)) {
    t.skip("compensation.xlsx олдсонгүй");
    return;
  }
  const v = buildValuation(readWorkbook(FIXTURE));
  assert.equal(v.layout, "multi-sheet");
  assert.deepEqual(v.sections, {});
  assert.equal(v.land.basePriceM2, 175000);
});

test("шинэ загвар: нэг хөрөнгө хоёр хүснэгтээс ДАВХАРДАЖ орж ирэхгүй", (t) => {
  if (!fs.existsSync(SAMPLE_FULL)) {
    t.skip("жишээ файл олдсонгүй — node scripts/gen-valuation-samples.mjs");
    return;
  }
  const wb = readWorkbook(SAMPLE_FULL);
  const grid = wb["Sheet1"];

  // 3.6 "Бусад эд хөрөнгө"-д байгаа нэрийг 3.1-ийнхээс БАГА зэрэг өөр бичвэл
  // (зайны зөрүү) fuzzy тааруулалт ажиллаж, ДАХИН хөрөнгө үүсгэх ёсгүй.
  const grown = grid.map((r) => r.slice());
  const row = grown.find((r) => String(r[1] ?? "") === "Хашаа-болок" && r[6]);
  assert.ok(row, "3.6 хүснэгтийн мөр олдох ёстой");
  row[1] = "Хашаа - болок";

  const v = buildValuation({ Sheet1: grown });
  const names = v.assets.map((a) => a.name.replace(/\s+/g, "").toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(dupes, [], `давхардсан хөрөнгө: ${dupes.join(", ")}`);
  assert.equal(v.assets.length, 19, "хөрөнгийн тоо хэвээр");
});

test("шинэ загвар: нуугдсан хуучин sheet-үүд байсан ч харагдах загварыг уншина", (t) => {
  if (!fs.existsSync(FIXTURE) || !fs.existsSync(SAMPLE_FULL)) {
    t.skip("fixture олдсонгүй");
    return;
  }
  // "загвар-2025" файлууд хуучин загварын жишээ sheet-үүдийг hidden байдлаар агуулдаг.
  const legacy = readWorkbook(FIXTURE);
  const wb = { ...legacy, Үнэлгээ: readWorkbook(SAMPLE_FULL).Sheet1 };
  const expected = buildValuation(readWorkbook(SAMPLE_FULL));
  const v = buildValuation(wb, new Set(Object.keys(legacy)));
  assert.equal(v.layout, "single-sheet");
  assert.equal(v.land.totalValue, expected.land.totalValue);
  assert.equal(v.summaryTotal, expected.summaryTotal);
});
