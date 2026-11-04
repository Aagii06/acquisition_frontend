// External store — axios interceptors and navigation events update this,
// useSyncExternalStore reads it inside React.
//
// ─── ХАМГААЛАЛТ (watchdog) ──────────────────────────────────────────────────
// Overlay нь бүтэн дэлгэцийг `pointer-events` -тэй хааддаг тул "асаасан ч
// унтраагаагүй" ганц алдаа аппыг БҮРМӨСӨН гацаадаг (зөвхөн F5 гаргана).
// Урьд нь яг тэр болдог байсан:
//
//   1. `notifyNavStart()` нь холбоос дарах бүрд БОЛЗОЛГҮЙ асдаг байсан ч
//      `notifyNavEnd()` нь зөвхөн pathname СОЛИГДОХОД ажилладаг. Иймд
//      pathname хэвээр үлдэх даралт (цэснээс өөрийнхөө хуудсыг дахин дарах,
//      зөвхөн `?query` солигдох шилжилт, Ctrl/Cmd+click, шинэ таб) бүрд
//      overlay мөнхөд наалддаг байв.
//   2. `timeout: 0` хүсэлт (төлөвлөгөөний хилээр хил солих) минутаар үргэлжилдэг
//      ба тэр бүх хугацаанд дэлгэц түгжээтэй байдаг.
//
// Одоо: (а) pathname солигдохгүй шилжилтэд loader огт асахгүй, (б) хоёуланд нь
// дээд хугацаа тавьж, хэтэрвэл overlay АВТОМАТААР унтарна. Хүсэлт өөрөө
// цуцлагдахгүй — зөвхөн дэлгэцийн түгжээ тайлагдана.
//
// ─── ХААНА ХАРУУЛАХ ─────────────────────────────────────────────────────────
// Хуудас солих болон өгөгдөл УНШИХ (GET) үед loader нь ЗӨВХӨН контентын
// хэсэгт гарна (`ContentLoader` — шилжилтийг эндээс, анхны уншилтыг
// react-query-оос авна) — шинэ таб шууд харагдаж, sidebar/табууд
// идэвхтэй хэвээр. Өгөгдөл ӨӨРЧЛӨХ (POST/PUT/DELETE) үед л бүтэн дэлгэцийг
// түгжинэ (`getScreenBlocking`) — dialog доторх хадгалах товчийг давхар
// дарахаас сэргийлнэ.

/** Хүсэлтийн overlay-ийн дээд хугацаа. Хэтэрвэл дэлгэц чөлөөлөгдөнө. */
const MAX_BLOCK_MS = 20_000;
/** Шилжилтийн overlay-ийн дээд хугацаа. */
const MAX_NAV_MS = 10_000;

export type RequestKind = "read" | "write";

/** Идэвхтэй хүсэлтүүд (id → төрөл). Map — давхар хасалт/алдагдалаас хамгаална. */
const _pending = new Map<number, RequestKind>();
let _nextId = 1;

let _navPending = false;
/** Шилжиж буй зам (pathname + query) — таб шууд нээгдэхэд хэрэглэнэ. */
let _navTarget: string | null = null;
let _navTimer: ReturnType<typeof setTimeout> | null = null;

/** Зам руу шилжихэд хуудас нь аль хэдийн mount-тай эсэх (`KeepAliveTabs` тохируулна). */
let _isWarm: (path: string) => boolean = () => false;

export function setWarmCheck(fn: (path: string) => boolean): void {
  _isWarm = fn;
}

/** ⟳ товчоор шинэчилж буй тоо — давхар дарахад зөв тоолно. */
let _refreshing = 0;

let _apiTimer: ReturnType<typeof setTimeout> | null = null;
let _apiExpired = false;

const _subscribers = new Set<() => void>();

function emit() {
  _subscribers.forEach((cb) => cb());
}

export function subscribe(cb: () => void): () => void {
  _subscribers.add(cb);
  return () => _subscribers.delete(cb);
}

/** Ямар нэг loader идэвхтэй эсэх (дэлгэц эсвэл контент). */
export function getIsBlocking(): boolean {
  return (_pending.size > 0 && !_apiExpired) || _navPending;
}

function hasPending(kind: RequestKind): boolean {
  if (_apiExpired) return false;
  let found = false;
  _pending.forEach((k) => {
    if (k === kind) found = true;
  });
  return found;
}

/** Бүтэн дэлгэцийн түгжээ — зөвхөн өөрчлөх хүсэлтийн үед. */
export function getScreenBlocking(): boolean {
  return hasPending("write");
}

/**
 * Контентын хэсгийн loader: "nav" — шинэ хуудас ачаалж байна (хуучин агуулгыг
 * бүрэн далдална), "read" — өгөгдөл уншиж байна (агуулга бүдэг харагдана).
 */
export function getContentLoading(): "nav" | "read" | null {
  // Аль хэдийн mount-тай (нээлттэй) таб руу шилжвэл шууд харагддаг — loader хэрэггүй.
  if (_navPending && !(_navTarget && _isWarm(_navTarget))) return "nav";
  return hasPending("read") ? "read" : null;
}

/** ⟳ товчоор хуудсыг шинэчилж байгаа эсэх — агуулга дээр саарал давхарга. */
export function getRefreshing(): boolean {
  return _refreshing > 0;
}

/** `work` дуустал (амжилттай эсэхээс үл хамааран) шинэчлэх давхарга харагдана. */
export async function trackRefresh(work: Promise<unknown>): Promise<void> {
  _refreshing++;
  emit();
  try {
    await work;
  } catch {
    // Алдааг query-ийн global onError логлоно — энд зөвхөн давхаргыг унтраана.
  } finally {
    _refreshing--;
    emit();
  }
}

export function getNavTarget(): string | null {
  return _navPending ? _navTarget : null;
}

/** Шилжиж буй зам аль хэдийн mount-тай (нээлттэй таб) эсэх — шууд харагдана. */
export function isWarmPath(path: string): boolean {
  return _isWarm(path);
}

function armApiWatchdog() {
  if (_apiTimer !== null || typeof window === "undefined") return;
  _apiTimer = setTimeout(() => {
    _apiTimer = null;
    _apiExpired = true;
    emit();
  }, MAX_BLOCK_MS);
}

function disarmApiWatchdog() {
  if (_apiTimer !== null) {
    clearTimeout(_apiTimer);
    _apiTimer = null;
  }
  _apiExpired = false;
}

/** Хүсэлт эхлэв. Буцаах id-г `notifyRequestEnd`-д ЗААВАЛ буцааж өгнө. */
export function notifyRequestStart(kind: RequestKind = "write"): number {
  const id = _nextId++;
  _pending.set(id, kind);
  if (_pending.size === 1) armApiWatchdog();
  emit();
  return id;
}

/**
 * Хүсэлт дууслаа. id-гаар ажилладаг тул давхар дуудвал (ижил config дахин
 * оролдох, cancel + error давхацах) тоолуур сөрөг/гажуудахгүй. `_silent`
 * хүсэлт id авдаггүй тул `undefined` ирвэл юу ч хийхгүй.
 */
export function notifyRequestEnd(id: number | undefined): void {
  if (id === undefined) return;
  if (!_pending.delete(id)) return;
  if (_pending.size === 0) disarmApiWatchdog();
  emit();
}

/**
 * Холбоос дарахад ирэх үйл явдлын шаардлагатай талбарууд. React-ийн
 * SyntheticEvent болон DOM MouseEvent хоёулаа тэнцэнэ.
 */
type NavStartEvent = {
  defaultPrevented?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
  currentTarget?: unknown;
};

/**
 * Энэ даралт ЖИНХЭНЭ хуудас солих шилжилт үү?
 *
 * `notifyNavEnd()` нь ЗӨВХӨН pathname солигдоход ажилладаг тул pathname
 * өөрчлөгдөхгүй ямар ч даралтад loader-ыг асаах ёсгүй — эс бөгөөс мөнхөд
 * үлдэнэ.
 */
function shouldTrackNavigation(event?: NavStartEvent): boolean {
  if (typeof window === "undefined") return false;
  if (!event) return true; // гараар дуудсан (router.push) — watchdog хамгаална
  if (event.defaultPrevented) return false;
  // Ctrl/Cmd/Shift/Alt + click, дунд товч → шинэ таб/цонх нээгдэнэ,
  // ЭНЭ хуудас хэвээр үлдэнэ.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (typeof event.button === "number" && event.button !== 0) return false;

  const anchor = event.currentTarget as { href?: unknown; target?: unknown } | null | undefined;
  const href = typeof anchor?.href === "string" ? anchor.href : "";
  if (!href) return true; // <a> биш элемент — шалгах зүйлгүй, watchdog хамгаална

  const target = typeof anchor?.target === "string" ? anchor.target : "";
  if (target && target !== "_self") return false; // шинэ таб

  try {
    const next = new URL(href, window.location.href);
    if (next.origin !== window.location.origin) return false; // гадаад холбоос
    if (next.pathname === window.location.pathname) return false; // pathname хэвээр
  } catch {
    return true;
  }
  return true;
}

/** Холбоосын href-ээс эсвэл шууд өгсөн замаас зорилтот замыг гаргана. */
function resolveNavTarget(event?: NavStartEvent, href?: string): string | null {
  const anchor = event?.currentTarget as { href?: unknown } | null | undefined;
  const raw = href ?? (typeof anchor?.href === "string" ? anchor.href : "");
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.href);
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

/**
 * Шилжилт эхлэв. `<Link onClick={notifyNavStart}>` хэлбэрээр event-тэй, эсвэл
 * `router.push`-ийн өмнө `notifyNavStart(undefined, path)` хэлбэрээр дуудна.
 */
export function notifyNavStart(event?: NavStartEvent, href?: string): void {
  if (!shouldTrackNavigation(event)) return;
  _navPending = true;
  _navTarget = resolveNavTarget(event, href);
  if (_navTimer !== null) clearTimeout(_navTimer);
  _navTimer = setTimeout(() => {
    _navTimer = null;
    _navPending = false;
    _navTarget = null;
    emit();
  }, MAX_NAV_MS);
  emit();
}

export function notifyNavEnd(): void {
  if (_navTimer !== null) {
    clearTimeout(_navTimer);
    _navTimer = null;
  }
  if (!_navPending) return;
  _navPending = false;
  _navTarget = null;
  emit();
}

// ─── НЭВТРЭСНИЙ ДАРААХ АЧААЛАЛ (boot) ───────────────────────────────────────
// Нэвтэрсний дараа самбар хагас ачаалагдсан (цэс, хүснэгт хоосон) байдлаар
// харагдахын оронд эхний өгөгдөл ирэх хүртэл БҮТЭН ДЭЛГЭЦИЙН loader харагдана.
// Login хуудас `startBoot()`-ийг router.push-ийн өмнө дуудна, самбар эхний
// уншилт дуусахад `endBoot()`-ийг дуудна. Watchdog нь самбар ямар нэг
// шалтгаанаар `endBoot()` дуудаагүй ч дэлгэцийг мөнхөд түгжихгүй.

/** Нэвтэрсний дараах loader-ийн дээд хугацаа. */
const MAX_BOOT_MS = 15_000;

let _booting = false;
let _bootTimer: ReturnType<typeof setTimeout> | null = null;

export function getBooting(): boolean {
  return _booting;
}

export function startBoot(): void {
  _booting = true;
  if (_bootTimer !== null) clearTimeout(_bootTimer);
  _bootTimer = setTimeout(() => {
    _bootTimer = null;
    _booting = false;
    emit();
  }, MAX_BOOT_MS);
  emit();
}

export function endBoot(): void {
  if (_bootTimer !== null) {
    clearTimeout(_bootTimer);
    _bootTimer = null;
  }
  if (!_booting) return;
  _booting = false;
  emit();
}
