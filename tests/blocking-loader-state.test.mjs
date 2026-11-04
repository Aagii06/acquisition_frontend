// Бүтэн дэлгэцийн "Уншиж байна..." overlay-ийн төлөвийн сан.
//
// Энэ overlay нь pointer-events-тэй тул "асаасан ч унтраагаагүй" ганц алдаа
// аппыг бүрмөсөн гацаадаг. Доорх тестүүд нь урьд нь бодит гацалт үүсгэж байсан
// ЯГ ТЭР нөхцөлүүдийг барина.

import test from "node:test";
import assert from "node:assert/strict";

// Модуль нь `window`-оос хамаардаг тул import хийхээс ӨМНӨ жижиг stub тавина.
globalThis.window = {
  location: { href: "https://gov.local/parcel", pathname: "/parcel", origin: "https://gov.local" },
};

const {
  getIsBlocking,
  notifyRequestStart,
  notifyRequestEnd,
  notifyNavStart,
  notifyNavEnd,
  getScreenBlocking,
  getContentLoading,
  getNavTarget,
} = await import("../src/lib/blocking-loader-state.ts");

/** Тест хооронд төлвийг цэвэрлэнэ (модуль нь нэг л удаа ачаалагдана). */
function reset() {
  notifyNavEnd();
  // үлдсэн pending id-г тоолуургүйгээр хоослох арга байхгүй тул шинэ id аваад
  // тэр даруй хаана — өмнөх тест бүр өөрийн id-г хаасан байх ёстой.
  assert.equal(getIsBlocking(), false, "өмнөх тест төлвөө цэвэрлээгүй байна");
}

function anchorEvent(href, extra = {}) {
  return { currentTarget: { href, target: "" }, button: 0, ...extra };
}

test("хүсэлт: id-гаар хаагдана, давхар хаалт тоолуурыг гажуудуулахгүй", () => {
  reset();
  const a = notifyRequestStart();
  const b = notifyRequestStart();
  assert.equal(getIsBlocking(), true);

  notifyRequestEnd(a);
  notifyRequestEnd(a); // давхар — үл тоомсорлоно
  assert.equal(getIsBlocking(), true, "b хараахан дуусаагүй тул блоклолт хэвээр");

  notifyRequestEnd(b);
  assert.equal(getIsBlocking(), false);
});

test("хүсэлт: _silent (id=undefined) нь бусдын тоолуурыг хөндөхгүй", () => {
  reset();
  const a = notifyRequestStart();
  notifyRequestEnd(undefined); // silent хүсэлтийн хариу
  assert.equal(getIsBlocking(), true, "silent хариу жинхэнэ хүсэлтийг хаасангүй");
  notifyRequestEnd(a);
  assert.equal(getIsBlocking(), false);
});

test("шилжилт: pathname солигдохгүй даралт loader-ыг АСААХГҮЙ", () => {
  reset();
  // Цэснээс өөрийнхөө хуудсыг дахин дарах — pathname хэвээр тул
  // notifyNavEnd() (pathname effect) хэзээ ч ажиллахгүй → мөнх гацалт байсан.
  notifyNavStart(anchorEvent("https://gov.local/parcel"));
  assert.equal(getIsBlocking(), false);

  // Зөвхөн ?query солигдох шилжилт — мөн pathname хэвээр.
  notifyNavStart(anchorEvent("https://gov.local/parcel?acq=abc"));
  assert.equal(getIsBlocking(), false);
});

test("шилжилт: Ctrl/Cmd+click, шинэ таб, гадаад холбоос loader-ыг АСААХГҮЙ", () => {
  reset();
  notifyNavStart(anchorEvent("https://gov.local/acquisition", { metaKey: true }));
  assert.equal(getIsBlocking(), false, "Cmd+click — шинэ таб нээгдэнэ");

  notifyNavStart(anchorEvent("https://gov.local/acquisition", { ctrlKey: true }));
  assert.equal(getIsBlocking(), false, "Ctrl+click");

  notifyNavStart(anchorEvent("https://gov.local/acquisition", { button: 1 }));
  assert.equal(getIsBlocking(), false, "дунд товч");

  notifyNavStart({ ...anchorEvent("https://gov.local/acquisition"), currentTarget: { href: "https://gov.local/acquisition", target: "_blank" } });
  assert.equal(getIsBlocking(), false, "target=_blank");

  notifyNavStart(anchorEvent("https://example.com/x"));
  assert.equal(getIsBlocking(), false, "гадаад холбоос");

  notifyNavStart(anchorEvent("https://gov.local/acquisition", { defaultPrevented: true }));
  assert.equal(getIsBlocking(), false, "preventDefault хийгдсэн");
});

test("шилжилт: жинхэнэ хуудас солих даралт loader-ыг асаана", () => {
  reset();
  notifyNavStart(anchorEvent("https://gov.local/acquisition"));
  assert.equal(getIsBlocking(), true);
  notifyNavEnd();
  assert.equal(getIsBlocking(), false);
});

test("watchdog: шилжилт дуусаагүй ч overlay автоматаар унтарна", (t) => {
  reset();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  // notifyNavEnd() ирэхгүй нөхцөл — өмнө нь энэ бол мөнх гацалт байсан.
  notifyNavStart(anchorEvent("https://gov.local/acquisition"));
  assert.equal(getIsBlocking(), true);

  t.mock.timers.tick(9_999);
  assert.equal(getIsBlocking(), true, "хугацаа болоогүй байхад унтрах ёсгүй");

  t.mock.timers.tick(2);
  assert.equal(getIsBlocking(), false, "MAX_NAV_MS-ийн дараа дэлгэц чөлөөлөгдөнө");
});

test("watchdog: дуусаагүй хүсэлт ч дэлгэцийг мөнхөд түгжихгүй", (t) => {
  reset();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  // timeout: 0 хүсэлт (хилийн shapefile шинэчлэлт) минутаар үргэлжилж болно.
  const id = notifyRequestStart();
  assert.equal(getIsBlocking(), true);

  t.mock.timers.tick(20_001); // MAX_BLOCK_MS
  assert.equal(getIsBlocking(), false, "хүсэлт үргэлжилсэн ч дэлгэц чөлөөлөгдөнө");

  // Хүсэлт эцэст нь дуусахад төлөв бүрэн сэргэнэ.
  notifyRequestEnd(id);
  assert.equal(getIsBlocking(), false);
  const next = notifyRequestStart();
  assert.equal(getIsBlocking(), true, "дараагийн хүсэлтэд loader дахин ажиллана");
  notifyRequestEnd(next);
});

test("байрлал: унших хүсэлт контентод, өөрчлөх хүсэлт бүтэн дэлгэцэд", () => {
  reset();
  const r = notifyRequestStart("read");
  assert.equal(getContentLoading(), "read");
  assert.equal(getScreenBlocking(), false, "GET дэлгэцийг түгжихгүй");

  const w = notifyRequestStart("write");
  assert.equal(getScreenBlocking(), true);

  notifyRequestEnd(w);
  notifyRequestEnd(r);
  assert.equal(getContentLoading(), null);
  assert.equal(getScreenBlocking(), false);
});

test("шилжилт: зорилтот зам (таб шууд нээгдэхэд) — дуусахад цэвэрлэгдэнэ", () => {
  reset();
  notifyNavStart(anchorEvent("https://gov.local/acquisition/12?tab=parcel"));
  assert.equal(getContentLoading(), "nav");
  assert.equal(getScreenBlocking(), false, "шилжилт дэлгэцийг түгжихгүй");
  assert.equal(getNavTarget(), "/acquisition/12?tab=parcel");

  notifyNavEnd();
  assert.equal(getNavTarget(), null);

  notifyNavStart(undefined, "/map");
  assert.equal(getNavTarget(), "/map", "router.push-ийн өмнө шууд өгсөн зам");
  notifyNavEnd();
});

test("boot: нэвтэрсний дараах loader endBoot-оор, эсвэл watchdog-оор унтарна", async (t) => {
  const { startBoot, endBoot, getBooting } = await import("../src/lib/blocking-loader-state.ts");
  t.mock.timers.enable({ apis: ["setTimeout"] });

  startBoot();
  assert.equal(getBooting(), true);
  endBoot();
  assert.equal(getBooting(), false);
  endBoot(); // давхар дуудалт аюулгүй
  assert.equal(getBooting(), false);

  // Самбар endBoot дуудаагүй ч дэлгэц мөнхөд түгжигдэхгүй.
  startBoot();
  t.mock.timers.tick(14_999);
  assert.equal(getBooting(), true, "хугацаа болоогүй байхад унтрах ёсгүй");
  t.mock.timers.tick(2);
  assert.equal(getBooting(), false, "MAX_BOOT_MS-ийн дараа дэлгэц чөлөөлөгдөнө");
});
