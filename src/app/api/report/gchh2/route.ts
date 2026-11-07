import { NextRequest, NextResponse } from "next/server";
import { hasAnyRole } from "@/lib/server/verify-auth";
import {
  buildGchh2Workbook,
  type CountArea,
  type CountAreaMoney,
  type Gchh2GeneralCategory,
  type Gchh2Report,
  type Gchh2Work,
  type ReleaseBreakdown,
} from "@/lib/server/gchh2-report";

export const runtime = "nodejs";

const BACKEND = process.env.NEXT_API_URL ?? "http://localhost:8080";

// ГЧХ АЖЛЫН МЭДЭЭ — дашбоардын шүүлтээр Excel татах.
//
// ЭРХ: тайланг ЗӨВХӨН АХЛАХ МЭРГЭЖИЛТЭН татна. Ролийг `/users/me`-ээр
// backend-ээс шалгана — тэр нь гарын үсэг шалгасны дараа ӨГӨГДЛИЙН САНГИЙН
// бодит ролийг буцаадаг тул хуурамчлах боломжгүй (frontend дээр JWT-г өөрөө
// задалж шалгавал хуурамч роль нэмж тойрч болно).
// Өгөгдлийн эрхийг (`land:read`) мөн backend нь хүсэлт тус бүрд шалгана.
const SENIOR_SPECIALIST_ROLES = ["admin", "Админ", "senior_specialist", "Ахлах мэргэжилтэн", "department_head"];

interface ApiAU {
  au1_name?: string;
  au2_name?: string;
  au3_name?: string;
}

interface ApiAssignee {
  user_name?: string;
}

interface ApiAcquisition {
  id: string;
  acquisition_name?: string;
  general_category_name?: string | null;
  sub_category_name?: string | null;
  responsible_org?: string | null;
  parcel_count?: number | null;
  area_m2?: number | null;
  aus?: ApiAU[] | null;
  assigned_users?: ApiAssignee[] | null;
}

async function backendGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: { Authorization: token },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Backend ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Дүүрэг/хорооны нэрийг загварын хэлбэрт хөрвүүлнэ ("БЗД 12, 37").
 * Дүүрэг тус бүрээр хорооны дугаарыг цуглуулж, дүүргийн товчлолтой хамт.
 */
function formatDistricts(aus: ApiAU[] | null | undefined): string {
  if (!aus || aus.length === 0) return "";
  const byDistrict = new Map<string, string[]>();
  for (const au of aus) {
    const d = (au.au2_name ?? "").trim();
    if (!d) continue;
    const khoroo = (au.au3_name ?? "").trim();
    // "12 дугаар хороо" → "12"; тоо олдохгүй бол бүтнээр
    const num = khoroo.match(/\d+/)?.[0] ?? "";
    const list = byDistrict.get(d) ?? [];
    if (num && !list.includes(num)) list.push(num);
    byDistrict.set(d, list);
  }
  return Array.from(byDistrict.entries())
    .map(([d, nums]: [string, string[]]) =>
      nums.length ? `${d} ${nums.sort((a, b) => Number(a) - Number(b)).join(", ")}` : d,
    )
    .join("; ");
}

function formatSpecialists(list: ApiAssignee[] | null | undefined): string {
  if (!list || list.length === 0) return "";
  const names = list.map((a) => (a.user_name ?? "").trim()).filter(Boolean);
  return Array.from(new Set(names)).join(", ");
}

const UNCATEGORIZED = "Ангилалгүй";

// ── Нэгж талбарын статусын код (parcel_status) ────────────────────────────
const ST_PENDING = 0; // Хүлээгдэж буй
const ST_NEGOTIATING = 1; // Зөвшилцөх шатандаа  → "Чөлөөлөх шатандаа"
const ST_VALUATION = 2; // Үнэлгээ хийх
const ST_REMOVED = 3; // Нөлөөлөгдсөн гарсан  → "Нөлөөллөөс гаргасан"
const ST_REJECTED = 4; // Татгалзсан
const ST_RELEASED = 5; // Чөлөөлсөн

interface ReportParcel {
  parcel_id: string;
  acquisition_id: string;
  status: number;
  status_date: string | null;
  acquisition_area_m2: number | null;
  total_comp: number | null;
  decree_number?: string | null;
  decree_date?: string | null;
}

const M2_TO_HA = 1 / 10_000;
const TO_BILLION = 1 / 1_000_000_000;
const round5 = (v: number) => Math.round(v * 100000) / 100000;

const zeroCA = (): CountArea => ({ count: 0, areaHa: 0 });
const zeroCAM = (): CountAreaMoney => ({ count: 0, areaHa: 0, moneyBn: 0 });
const emptyBreakdown = (): ReleaseBreakdown => ({
  landSwap: zeroCA(),
  removed: zeroCA(),
  revoked: zeroCA(),
  cash: zeroCAM(),
  both: zeroCAM(),
  total: zeroCAM(),
});

function addCA(t: CountArea, areaM2: number | null): void {
  t.count += 1;
  t.areaHa = round5(t.areaHa + (areaM2 ?? 0) * M2_TO_HA);
}
function addCAM(t: CountAreaMoney, areaM2: number | null, comp: number | null): void {
  addCA(t, areaM2);
  t.moneyBn = round5(t.moneyBn + (comp ?? 0) * TO_BILLION);
}

/** Нэг ажлын (чөлөөлөлтийн) бүх хэмжигдэхүүн */
interface WorkStats {
  before: ReleaseBreakdown;
  current: ReleaseBreakdown;
  inProgress: CountAreaMoney;
  notValued: CountAreaMoney;
  notUnvalued: CountAreaMoney;
  notTotal: CountAreaMoney;
  /** Y,Z — тухайн онд чөлөөлөх төлөвлөгөө */
  planned: CountArea;
  releasedCount: number;
  totalCount: number;
  basis: Set<string>;
}
const newStats = (): WorkStats => ({
  before: emptyBreakdown(),
  current: emptyBreakdown(),
  inProgress: zeroCAM(),
  notValued: zeroCAM(),
  notUnvalued: zeroCAM(),
  notTotal: zeroCAM(),
  planned: zeroCA(),
  releasedCount: 0,
  totalCount: 0,
  basis: new Set<string>(),
});

interface ApiCompensation {
  parcel_id?: string;
  compensation_type?: string;
  amount?: number;
  status?: string;
}

/** Нэгж талбар тус бүрийн нөхөх олговрын зураглал */
interface CompInfo {
  /** Батлагдсан (approved) — ЖИНХЭНЭ олгосон олговор */
  apprCash: number;
  apprSwap: number;
  /** Батлагдаагүй (pending) — "төсөөллийн үнэлгээ" */
  pending: number;
}

/**
 * Нөхөх олговрыг нэгж талбараар цуглуулна.
 *
 * ЯАГААД `/report/download`-ийн `total_comp` хүрэлцэхгүй: тэр нь батлагдсан ба
 * хүлээгдэж буйг ХАМТАД нэмдэг бөгөөд төрлийг (cash/land_grant) мөрөндөө
 * буцаадаггүй. Тайланд "Хөрөнгийн үнэлгээ хийгдсэн" (батлагдсан) ба
 * "хийгдээгүй / төсөөллийн үнэлгээ" (pending) хоёрыг ЗААВАЛ салгах шаардлагатай.
 */
async function fetchCompensations(
  token: string,
  acquisitionIds: string[],
): Promise<Map<string, CompInfo>> {
  const byParcel = new Map<string, CompInfo>();
  const CHUNK = 5;
  const PAGE = 500;
  for (let i = 0; i < acquisitionIds.length; i += CHUNK) {
    const chunk = acquisitionIds.slice(i, i + CHUNK);
    const lists = await Promise.all(
      chunk.map(async (id) => {
        const out: ApiCompensation[] = [];
        for (let p = 1; p <= 50; p++) {
          const res = await backendGet<{ data?: ApiCompensation[]; total_pages?: number }>(
            `/api/v1/compensations?acquisition_id=${id}&page=${p}&page_size=${PAGE}`,
            token,
          ).catch(() => ({ data: [], total_pages: 1 }));
          out.push(...(res.data ?? []));
          if (p >= (res.total_pages ?? 1)) break;
        }
        return out;
      }),
    );
    for (const rows of lists) {
      for (const c of rows) {
        const pid = c.parcel_id;
        if (!pid) continue;
        const info = byParcel.get(pid) ?? { apprCash: 0, apprSwap: 0, pending: 0 };
        const amt = c.amount ?? 0;
        if (c.status === "approved") {
          if (c.compensation_type === "land_grant") info.apprSwap += amt;
          else info.apprCash += amt;
        } else if (c.status !== "rejected") {
          info.pending += amt;
        }
        byParcel.set(pid, info);
      }
    }
  }
  return byParcel;
}

/** Тайлангийн нэгж талбарын мөрүүдийг бүх хуудсаар татна. */
async function fetchAllReportParcels(
  query: string,
  token: string,
): Promise<ReportParcel[]> {
  const PAGE = 500;
  const first = await backendGet<{ data?: ReportParcel[]; total_pages?: number }>(
    `/api/v1/report/download?${query}&page=1&page_size=${PAGE}`,
    token,
  );
  let rows = first.data ?? [];
  const pages = first.total_pages ?? 1;
  for (let p = 2; p <= pages; p++) {
    const res = await backendGet<{ data?: ReportParcel[] }>(
      `/api/v1/report/download?${query}&page=${p}&page_size=${PAGE}`,
      token,
    );
    rows = rows.concat(res.data ?? []);
  }
  return rows;
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Нэвтрэх шаардлагатай" }, { status: 401 });
  }
  if (!(await hasAnyRole(token, SENIOR_SPECIALIST_ROLES))) {
    return NextResponse.json(
      { error: "Мэдээ татах эрх зөвхөн ахлах мэргэжилтэнд бий" },
      { status: 403 },
    );
  }

  const sp = request.nextUrl.searchParams;

  // Дашбоардын шүүлтийг backend-ийн /land-acquisitions-д ЯГ тэр нэрээр дамжуулна
  const q = new URLSearchParams();
  const pass = [
    "acquisition_id",
    "plan_code",
    "acquisition_name",
    "general_category_id",
    "sub_category_id",
    "assigned_user_id",
  ];
  for (const k of pass) {
    const v = sp.get(k);
    if (v) q.set(k === "acquisition_id" ? "acquisition_id" : k, v);
  }
  for (const y of sp.getAll("year")) if (y) q.append("year", y);

  try {
    // ── 1. Шүүлтэд тохирох бүх чөлөөлөлт (хуудаслалтыг дуустал) ───────────
    const PAGE_SIZE = 200;
    const first = await backendGet<{ data?: ApiAcquisition[]; total_pages?: number }>(
      `/api/v1/land-acquisitions?${q}&page=1&page_size=${PAGE_SIZE}`,
      token,
    );
    let list: ApiAcquisition[] = first.data ?? [];
    const pages = first.total_pages ?? 1;
    for (let p = 2; p <= pages; p++) {
      const res = await backendGet<{ data?: ApiAcquisition[] }>(
        `/api/v1/land-acquisitions?${q}&page=${p}&page_size=${PAGE_SIZE}`,
        token,
      );
      list = list.concat(res.data ?? []);
    }

    // ── 2. Дүүрэг/хороо ба хариуцсан мэргэжилтэн зөвхөн ДЭЛГЭРЭНГҮЙ дээр
    //       ирдэг (list projection-д null) тул тус бүрээр татна. Зэрэг олон
    //       хүсэлт backend-ыг дүүргэхээс сэргийлж багцалж (10) явуулна.
    const detailed = new Map<string, ApiAcquisition>();
    const CHUNK = 10;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      const res = await Promise.all(
        chunk.map((a) =>
          backendGet<{ data?: ApiAcquisition }>(`/api/v1/land-acquisitions/${a.id}`, token)
            .then((r) => r.data)
            .catch(() => undefined),
        ),
      );
      res.forEach((d, idx) => {
        if (d) detailed.set(chunk[idx].id, d);
      });
    }

    // ── 2b. Нэгж талбарын задаргаа (чөлөөлөлтийн мэдээ) ───────────────────
    const [allRows, compByParcel] = await Promise.all([
      fetchAllReportParcels(q.toString(), token),
      fetchCompensations(token, list.map((a) => a.id)),
    ]);

    // Хуваах он: сонгосон онуудын ХАМГИЙН СҮҮЛИЙНХ (заагаагүй бол өнөөдрийн).
    const selectedYears = sp.getAll("year").map(Number).filter((n) => n > 0);
    const pivotYear =
      selectedYears.length > 0
        ? Math.max(...selectedYears)
        : new Date().getUTCFullYear();

    const statsByAcq = new Map<string, WorkStats>();
    for (const p of allRows) {
      const s = statsByAcq.get(p.acquisition_id) ?? newStats();
      statsByAcq.set(p.acquisition_id, s);
      s.totalCount += 1;
      const area = p.acquisition_area_m2;
      const c = compByParcel.get(p.parcel_id) ?? { apprCash: 0, apprSwap: 0, pending: 0 };
      // Батлагдсан олговор нь ЖИНХЭНЭ олгосон дүн (pending нь зөвхөн төсөөлөл)
      const paid = c.apprCash + c.apprSwap;
      const yearOf = (d: string | null) =>
        d ? new Date(d).getUTCFullYear() : pivotYear;

      if (p.status === ST_RELEASED) {
        s.releasedCount += 1;
        const b = yearOf(p.status_date) >= pivotYear ? s.current : s.before;
        if (c.apprSwap > 0 && c.apprCash > 0) addCAM(b.both, area, paid);
        else if (c.apprCash > 0) addCAM(b.cash, area, paid);
        else if (c.apprSwap > 0) addCA(b.landSwap, area);
        // Олговоргүй чөлөөлсөн = газар эзэмших/ашиглах ЭРХИЙГ ЦУЦАЛСАН (M,N)
        else addCA(b.revoked, area);
        addCAM(b.total, area, paid);
        if (p.decree_number) s.basis.add(p.decree_number);
      } else if (p.status === ST_REMOVED) {
        // Нөлөөллөөс гаргасан — чөлөөлсөнтэй ижил он хуваалтаар
        const b = yearOf(p.status_date) >= pivotYear ? s.current : s.before;
        addCA(b.removed, area);
        addCAM(b.total, area, paid);
      } else if (p.status === ST_NEGOTIATING) {
        addCAM(s.inProgress, area, paid || c.pending);
      } else if (p.status === ST_VALUATION) {
        // Хөрөнгийн үнэлгээ ХИЙГДСЭН = батлагдсан үнэлгээтэй;
        // хийгдээгүй бол pending дүн нь "төсөөллийн үнэлгээ" (AX)
        if (paid > 0) addCAM(s.notValued, area, paid);
        else addCAM(s.notUnvalued, area, c.pending);
      } else if (p.status === ST_PENDING || p.status === ST_REJECTED) {
        addCAM(s.notUnvalued, area, c.pending);
      }

      // "<он> онд ЧӨЛӨӨЛӨХ" төлөвлөгөө = тухайн онд чөлөөлсөн + хараахан
      // чөлөөлөөгүй (өмнөх онуудад аль хэдийн чөлөөлөгдсөнийг оруулахгүй).
      const releasedBefore =
        (p.status === ST_RELEASED || p.status === ST_REMOVED) &&
        yearOf(p.status_date) < pivotYear;
      if (!releasedBefore) addCA(s.planned, area);
    }
    // Нийт чөлөөлөөгүй = үнэлгээтэй + үнэлгээгүй
    statsByAcq.forEach((s) => {
      s.notTotal = {
        count: s.notValued.count + s.notUnvalued.count,
        areaHa: round5(s.notValued.areaHa + s.notUnvalued.areaHa),
        moneyBn: round5(s.notValued.moneyBn + s.notUnvalued.moneyBn),
      };
    });

    // ── 3. Хэлтэс → Ерөнхий ангилал → Дэд ангилал → ажил гэж бүлэглэнэ ────
    const catMap = new Map<string, Map<string, Gchh2Work[]>>();
    const departments = new Set<string>();

    for (const a of list) {
      const d = detailed.get(a.id) ?? a;
      const dept = (d.responsible_org ?? a.responsible_org ?? "").trim();
      if (dept) departments.add(dept);

      const gc = (d.general_category_name ?? a.general_category_name ?? "").trim() || UNCATEGORIZED;
      const sc = (d.sub_category_name ?? a.sub_category_name ?? "").trim() || UNCATEGORIZED;

      const areaM2 = d.area_m2 ?? a.area_m2 ?? null;
      const st = statsByAcq.get(a.id);
      const work: Gchh2Work = {
        district: formatDistricts(d.aus),
        name: (d.acquisition_name ?? a.acquisition_name ?? "").trim(),
        specialist: formatSpecialists(d.assigned_users),
        parcelCount: d.parcel_count ?? a.parcel_count ?? null,
        // Талбай м²-ээс га (загварын "Талбайн хэмжээ /га/")
        areaHa: areaM2 != null ? round5(areaM2 * M2_TO_HA) : null,
        ...(st
          ? {
              before: st.before,
              current: st.current,
              inProgress: st.inProgress,
              notReleasedValued: st.notValued,
              notReleasedUnvalued: st.notUnvalued,
              notReleasedTotal: st.notTotal,
              plannedCurrent: st.planned,
              basis: Array.from(st.basis).join(", "),
              // Ажлын хувь — чөлөөлсөн / нийт нэгж талбар (0..1, numFmt 0%)
              progressPct:
                st.totalCount > 0
                  ? Math.round((st.releasedCount / st.totalCount) * 10000) / 10000
                  : null,
            }
          : {}),
      };

      const subs = catMap.get(gc) ?? new Map<string, Gchh2Work[]>();
      const works = subs.get(sc) ?? [];
      works.push(work);
      subs.set(sc, works);
      catMap.set(gc, subs);
    }

    const categories: Gchh2GeneralCategory[] = Array.from(catMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "mn"))
      .map(([name, subs]: [string, Map<string, Gchh2Work[]>]) => ({
        name,
        subs: Array.from(subs.entries())
          .sort((a, b) => a[0].localeCompare(b[0], "mn"))
          .map(([sName, works]: [string, Gchh2Work[]]) => ({
            name: sName,
            works: works.sort((x, y) => x.name.localeCompare(y.name, "mn")),
          })),
      }));

    const report: Gchh2Report = {
      // Хэлтэс нэгээс их бол загварын нэг нүдэнд багтахгүй тул зөвхөн нэг
      // байвал нэрийг бичнэ, үгүй бол хоосон (оператор гараар бөглөнө).
      department: departments.size === 1 ? Array.from(departments)[0] : "",
      categories,
      pivotYear,
    };

    const ExcelJS = (await import("exceljs")).default;
    const buffer = await buildGchh2Workbook(ExcelJS, report);

    const filename = `ГЧХ-2_АЖЛЫН_МЭДЭЭ_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gchh2] тайлан үүсгэж чадсангүй", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
