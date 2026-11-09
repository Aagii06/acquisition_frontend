// Хэвлэх газрын зураг дээрх өмчлөгчийн нэр ДАВХЦАХГҮЙ байх ёстой.
//
// Чөлөөлөгдөөгүй нэгж талбар олонтой (жижиг, нягт) чөлөөлөлт дээр нэр бүрийг
// шууд зурдаг байсан тул нэрс бие биенээ дарж огт уншигдахгүй болдог байв.

import test from "node:test";
import assert from "node:assert/strict";

const { placeLabels, abbreviateName } = await import("../src/components/map/label-placement.ts");

// Canvas-гүй орчинд текстийн өргөнийг ойролцоогоор (bold sans-serif ~0.6em)
const measure = (text, f) => Array.from(text).length * f * 0.6;

const NAMES = [
  "Батболд Ганбаатар", "Оюунчимэг Дашдорж", "Тэнгэр Капитал ХХК", "Мөнхбаяр Энхтүвшин",
  "Сарантуяа Пүрэвдорж", "Ганзориг Баярсайхан", "Номин", "Эрдэнэчимэг Цэрэндорж",
];

function boxes(placed) {
  return placed.map(({ x, y, lines, fontPx }) => {
    const w = Math.max(...lines.map((s) => measure(s, fontPx)));
    const h = lines.length * fontPx * 1.15;
    return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  });
}

function assertNoOverlap(placed) {
  const b = boxes(placed);
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      const o = b[i].x0 < b[j].x1 && b[i].x1 > b[j].x0 && b[i].y0 < b[j].y1 && b[i].y1 > b[j].y0;
      assert.equal(o, false, `шошго ${i} ба ${j} давхцаж байна`);
    }
}

test("нягт нэгж талбарууд: зурагдсан нэрс хоорондоо давхцахгүй", () => {
  // 40x40 = 1600 нэгж талбар, 18px алхамтай (A4 дээрх нягт хороолол)
  const labels = [];
  for (let i = 0; i < 40; i++)
    for (let j = 0; j < 40; j++)
      labels.push({ x: 20 + i * 18, y: 20 + j * 18, text: NAMES[(i * 7 + j) % NAMES.length], weight: (i * j) % 13 });
  const { placed, skipped } = placeLabels(labels, { fontPx: 12, measure, width: 760, height: 760 });
  assertNoOverlap(placed);
  assert.equal(placed.length + skipped, labels.length);
  assert.ok(placed.length > 50, `хэт цөөн нэр байрласан: ${placed.length}`);
  assert.ok(skipped > 0);
});

test("сийрэг нэгж талбарууд: бүх нэр бүтнээрээ, анхны хэмжээгээр гарна", () => {
  const labels = NAMES.map((text, i) => ({ x: 100 + (i % 4) * 200, y: 100 + Math.floor(i / 4) * 200, text }));
  const { placed, skipped } = placeLabels(labels, { fontPx: 12, measure, width: 900, height: 500 });
  assert.equal(skipped, 0);
  placed.forEach((p, i) => {
    assert.deepEqual(p.lines, [labels[i].text]);
    assert.equal(p.fontPx, 12);
  });
});

test("том нэгж талбарын нэр түрүүлж байрлана", () => {
  const labels = [
    { x: 100, y: 100, text: "Жижиг Талбар", weight: 1 },
    { x: 102, y: 100, text: "Том Талбар", weight: 1000 },
  ];
  const { placed } = placeLabels(labels, { fontPx: 12, measure, width: 200, height: 200 });
  assert.ok(placed.some((p) => p.lines.join(" ").includes("Том") || p.lines.join("").startsWith("Т.")));
  assert.equal(placed[0].lines.join(" "), "Том Талбар");
});

test("хүрээнээс гадуурх болон доод зурвас дахь шошго хасагдана", () => {
  const { placed, skipped } = placeLabels(
    [{ x: 50, y: 50, text: "Дотор" }, { x: 50, y: 190, text: "Доод зурваст" }, { x: -5, y: 50, text: "Гадна" }],
    { fontPx: 10, measure, width: 200, height: 150 },
  );
  assert.equal(placed.length, 1);
  assert.equal(skipped, 2);
});

test("товчлол: иргэнийг товчилно, хуулийн этгээдийг товчлохгүй", () => {
  assert.equal(abbreviateName("Батболд Ганбаатар"), "Б.Ганбаатар");
  assert.equal(abbreviateName("Тэнгэр Капитал ХХК"), null);
  assert.equal(abbreviateName("Номин"), null);
});
