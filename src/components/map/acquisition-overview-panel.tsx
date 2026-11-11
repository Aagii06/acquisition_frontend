"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, BarChart3, LayoutDashboard, X } from "lucide-react";
import { dashboardApi, parcelSurveyApi, type DashboardData } from "@/lib/api";
import { getParcelStatusStyle, type FinanceDashboardData, type ParcelSurveySummary, type RelocationType } from "@/types";
import {
  RELOCATION_LABELS,
  SURVEY_COUNT_QUESTIONS,
  surveyCountTotal,
} from "@/lib/parcel-survey";
import { StatusDot } from "@/components/ui/status-label";
import { monthlyTimeline } from "@/lib/timeline-months";
import { cn, formatBillion } from "@/lib/utils";
import { AbbrevAmount } from "@/components/ui/amount-hint";
import { YearMultiSelect } from "@/components/ui/year-multi-select";

const ACQ_STATUS_LABEL: Record<number, string> = {
  1: "Шинэ",
  2: "Хээрийн судалгаа",
  3: "Баталгаажсан",
  4: "Цуцлагдсан",
};

const VALUATION_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Ноорог", color: "#64748b" },
  submitted: { label: "Илгээсэн", color: "#f59e0b" },
  approved: { label: "Баталгаажсан", color: "#0acf97" },
  returned: { label: "Буцаагдсан", color: "#f1556c" },
  rejected: { label: "Татгалзсан", color: "#94a3b8" },
};

const VALUATION_TYPE_LABEL: Record<string, string> = {
  asset: "Хөрөнгийн үнэлгээ",
  independent: "Хөндлөнгийн үнэлгээ",
  mika: "МИКА үнэлгээ",
};

type AcqBucket = "full" | "partial" | "fresh";
const ACQ_BUCKETS: { key: AcqBucket; label: string; color: string }[] = [
  { key: "full", label: "Бүрэн чөлөөлсөн", color: "#0acf97" },
  { key: "partial", label: "Хэрэгжиж буй", color: "#f9bc0b" },
  { key: "fresh", label: "Эхлээгүй", color: "#98a6ad" },
];
const bucketOf = (pct: number): AcqBucket => (pct >= 100 ? "full" : pct > 0 ? "partial" : "fresh");

const fmtDate = (d?: string) => (d ? d.slice(0, 10) : "");

const pct = (part: number, total: number) => (total > 0 ? Math.round((part * 100) / total) : 0);
const ha = (m2: number) => (m2 / 10_000).toLocaleString("mn-MN", { maximumFractionDigits: 2 });

/**
 * Газрын зургийг БҮТЭН ДЭЛГЭЦЭЭР харах үед зүүн талд гарах хураангуй —
 * ерөнхий мэдээлэл, нэгж талбарын явц, нөхөх олговор (олголтын шат, бүтэц,
 * эх үүсвэр), үнэлгээ, захирамж, сараар чөлөөлсөн байдал.
 * Өгөгдөл нь дашбоардын API-аас (дашбоард дээр бэлэн, чөлөөлөлтийн хуудсанд
 * `useAcquisitionOverview`-ээр).
 */
export function AcquisitionOverviewPanel({
  data: rootData,
  finance: rootFinance,
  loading: rootLoading,
  title: rootTitle,
  subtitle: rootSubtitle,
  years = [],
  showYears = false,
  embedded = false,
  onClose,
  onSelectAcquisition,
  initialSelectedId,
  showSurvey = false,
  surveyAll = false,
  rootYears,
}: {
  data?: DashboardData;
  /** Санхүүжилт — нэг чөлөөлөлт сонгосон үед (эрхгүй бол null). */
  finance?: FinanceDashboardData | null;
  loading?: boolean;
  title: string;
  subtitle?: string;
  /** Сарын графикийн хүрээ (сонгосон он); хоосон бол өгөгдлийн хүрээ. */
  years?: number[];
  /** Сонгосон оныг толгойд ТОД тэмдгээр харуулах (дашбоардын шүүлт). */
  showYears?: boolean;
  /**
   * Он цагийн зураг дотор — «Статистик» товчгүй, эх элементийн хэмжээгээр (бүтэн өндөр),
   * ✕ нь onClose-ийг дуудна.
   */
  embedded?: boolean;
  onClose?: () => void;
  /**
   * «Чөлөөлөлтүүд» жагсаалтаас нэгийг сонгох/буцах үед (null) — газрын зураг
   * бусад чөлөөлөлтийн давхаргыг нуухад. Самбар хаагдах (бүтэн дэлгэцээс гарах) үед
   * initialSelectedId (байхгүй бол null).
   */
  onSelectAcquisition?: (id: string | null) => void;
  /**
   * Самбар нээгдэхэд шууд энэ чөлөөлөлтийн дэлгэрэнгүйг харуулна (← нь `data`-гийн
   * бүх чөлөөлөлт рүү буцна). Хаагдах үед onSelectAcquisition-д энэ утгыг буцааж өгнө.
   */
  initialSelectedId?: string | null;
  /** «Захирамжийн төсөл»-ийн доор газрын судалгааны (санал асуулга) статистик. */
  showSurvey?: boolean;
  /**
   * `data` нь шүүлтгүй «бүх чөлөөлөлт» бол судалгааг чөлөөлөлтөөр хязгаарлалгүй — бүх
   * нэгж талбараар татна. Нэг чөлөөлөлт рүү орсон үед зөвхөн түүнийх.
   */
  surveyAll?: boolean;
  /**
   * Толгойн оныг «бүх чөлөөлөлт» дээр ч сольж болгоно: өгсөн онуудаар `data`/`finance`-ийг
   * хэрхэн татахыг (дашбоардын бусад шүүлттэй) буцаана. Газрын зураг, дашбоардын
   * шүүлт өөрчлөгдөхгүй. Байхгүй бол зөвхөн нэг чөлөөлөлт рүү орсон үед сольж болно.
   */
  rootYears?: (years: number[]) => {
    key: unknown[];
    data: () => Promise<DashboardData>;
    financeKey: unknown[] | null;
    finance: () => Promise<FinanceDashboardData>;
  };
}) {
  // Бүтэн дэлгэцэд орохтой зэрэг НЭЭЛТТЭЙ; ✕-ээр хаавал «Статистик» товчоор дахин нээнэ.
  const [openState, setOpen] = useState(true);
  const open = embedded || openState;

  // «Чөлөөлөлтүүд» жагсаалтаас нэгийг сонгоход тэр чөлөөлөлтийн дэлгэрэнгүй (←-ээр буцна).
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  // Толгойн он — шүүлтийн онгоос эхэлж, ЭНД сольж болно (дашбоардын шүүлт, газрын
  // зураг өөрчлөгдөхгүй). Шүүлтийн он солигдоход түүн рүү буцна.
  const yearsKey = sortedYearsKey(years);
  const [panelYears, setPanelYears] = useState(years);
  useEffect(() => {
    setPanelYears(yearsKey ? yearsKey.split(",").map(Number) : []);
  }, [yearsKey]);
  const rootOverride = rootYears && sortedYearsKey(panelYears) !== yearsKey ? rootYears(panelYears) : null;
  const overrideData = useQuery({
    queryKey: rootOverride?.key ?? ["map-overview", "root-years", "off"],
    queryFn: rootOverride ? rootOverride.data : skipToken,
  });
  const overrideFinance = useQuery({
    queryKey: rootOverride?.financeKey ?? ["map-overview", "root-years-finance", "off"],
    queryFn: rootOverride?.financeKey ? rootOverride.finance : skipToken,
    retry: false,
  });
  const baseData = rootOverride ? overrideData.data : rootData;
  const baseFinance = rootOverride ? (rootOverride.financeKey ? overrideFinance.data ?? null : null) : rootFinance;
  const baseLoading = rootOverride ? overrideData.isLoading : rootLoading;

  const rootAcqs = baseData?.acquisitions ?? [];
  const drillAcq = selectedId ? rootAcqs.find((a) => a.id === selectedId) : undefined;
  const drill = useAcquisitionOverview(drillAcq?.id ?? "", !!drillAcq, panelYears);
  const bodyRef = useRef<HTMLDivElement>(null);
  // «Чөлөөлөлтүүд» жагсаалтыг гүйцэтгэлийн ангиллаар шүүх — олныг зэрэг сонгож болно
  // (чип дээр дахин дарвал тэр ангиллыг хасна; хоосон бол бүгд).
  const [bucketFilter, setBucketFilter] = useState<Set<AcqBucket>>(() => new Set());
  const toggleBucket = (b: AcqBucket) =>
    setBucketFilter((cur) => {
      const next = new Set(cur);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  const filtering = bucketFilter.size > 0;
  const onSelectRef = useRef(onSelectAcquisition);
  onSelectRef.current = onSelectAcquisition;
  const initialIdRef = useRef(initialSelectedId ?? null);
  useEffect(() => () => onSelectRef.current?.(initialIdRef.current), []);
  const selectAcq = (id: string | null) => {
    setSelectedId(id);
    onSelectAcquisition?.(id);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const data = drillAcq ? drill.data : baseData;
  const finance = drillAcq ? drill.finance : baseFinance;
  const loading = drillAcq ? drill.loading : baseLoading;
  const title = drillAcq ? drillAcq.acquisition_name || drillAcq.plan_code : rootTitle;
  const subtitle = drillAcq ? rootTitle : rootSubtitle;

  const statuses = useMemo(() => {
    const colors = new Map((data?.parcel_statuses ?? []).map((s) => [s.id, s.color]));
    return (data?.status_breakdown ?? [])
      .filter((s) => s.count > 0)
      .map((s) => ({
        id: s.status_id,
        name: s.name,
        count: s.count,
        area: s.area_m2,
        color: getParcelStatusStyle(colors.get(s.status_id)).color,
      }));
  }, [data?.parcel_statuses, data?.status_breakdown]);

  const months = useMemo(
    () => monthlyTimeline(data?.timeline ?? [], panelYears),
    [data?.timeline, panelYears],
  );
  const monthTotal = months.reduce((s, m) => s + m.count, 0);

  const acqs = useMemo(() => data?.acquisitions ?? [], [data?.acquisitions]);
  // Судалгааны хамрах хүрээ: сонгосон чөлөөлөлт → зөвхөн түүнийх; шүүлтгүй «бүх» → бүх
  // нэгж талбар (null); бусад үед харагдаж буй чөлөөлөлтүүдийнх. selectedId-аар (drillAcq биш)
  // шалгана — rootData ачаалагдаж амжаагүй/тэр чөлөөлөлт жагсаалтад байхгүй үед бүх нэгж
  // талбарынх гарч ирэхээс сэргийлнэ.
  const surveyAcqIds = useMemo(
    () => (selectedId ? [selectedId] : surveyAll ? null : acqs.map((a) => a.id).sort()),
    [selectedId, surveyAll, acqs],
  );
  const { data: survey } = useQuery({
    queryKey: ["parcel-surveys", "summary", "overview", surveyAcqIds ?? "all"],
    queryFn: () =>
      surveyAcqIds ? fetchSurveySummary(surveyAcqIds) : parcelSurveyApi.summary(undefined, { silent: true }),
    enabled: showSurvey && (surveyAcqIds === null || surveyAcqIds.length > 0),
    retry: false,
  });
  const single = acqs.length === 1 ? acqs[0] : null;
  const total = data?.total_parcels ?? 0;
  const finalCount = acqs.reduce((s, a) => s + (a.final_parcel_count ?? 0), 0);
  const parcelCountAll = acqs.reduce((s, a) => s + (a.parcel_count ?? 0), 0);
  const progress = pct(finalCount, parcelCountAll);
  const freed = data?.freed_parcels ?? 0;
  const comp = data?.compensation;
  const compTotal = comp?.total ?? data?.total_compensation ?? 0;
  const dec = data?.decisions;
  const valStatuses = (data?.valuation_statuses ?? []).filter((v) => v.count > 0);
  const valTypes = (data?.valuation_types ?? []).filter((v) => v.count > 0 || v.amount > 0);
  // Олон чөлөөлөлт шүүсэн үед — гүйцэтгэлээр эрэмбэлсэн жагсаалт.
  const acqProgress = useMemo(
    () =>
      acqs.length > 1
        ? [...acqs]
            .map((a) => ({ id: a.id, name: a.acquisition_name || a.plan_code, parcels: a.parcel_count ?? 0, pct: a.parcel_count ? (a.progress_percent ?? 0) : 0 }))
            .sort((a, b) => b.pct - a.pct || b.parcels - a.parcels)
        : [],
    [acqs],
  );
  const acqBuckets = acqProgress.reduce(
    (c, a) => ({ ...c, [bucketOf(a.pct)]: c[bucketOf(a.pct)] + 1 }),
    { full: 0, partial: 0, fresh: 0 } as Record<AcqBucket, number>,
  );
  const visibleAcqs = filtering ? acqProgress.filter((a) => bucketFilter.has(bucketOf(a.pct))) : acqProgress;
  const structure = finance
    ? [
        { label: "Газар", color: "#0acf97", value: finance.land_amount },
        { label: "Үл хөдлөх хөрөнгө", color: "#0f9ed5", value: finance.real_state_amount },
        { label: "Эд хөрөнгө", color: "#f9bc0b", value: finance.property_amount },
      ].filter((x) => x.value > 0)
    : [];
  const structureTotal = structure.reduce((s, x) => s + x.value, 0);
  const funding = (finance?.funding_by_type ?? []).filter((f) => f.amount > 0);
  const locations = (data?.locations ?? []).filter((l) => l.district);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 top-14 z-20 flex h-9 items-center gap-1.5 rounded-lg bg-white/90 px-3 text-[12px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:bg-[#252630]/90 dark:text-slate-200 dark:hover:bg-[#2d2f3d]"
      >
        <BarChart3 className="h-4 w-4 text-[#02c0ce]" /> Статистик
      </button>
    );
  }

  return (
    <div
      // 2D/3D (дээд) ба бүтэн дэлгэцийн (доод) товчнуудын ХООРОНД — тэдгээрийг хөдөлгөхгүй.
      className={cn(
        "z-20 flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-xl backdrop-blur dark:border-[#37394d] dark:bg-[#1e1f27]/95",
        embedded ? "h-full w-full" : "absolute bottom-14 left-3 top-14 w-[440px] max-w-[calc(100%-1.5rem)]",
      )}
      // Самбар дээрх товшилт/гүйлгэлт газрын зургийг хөдөлгөхгүй.
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="border-b border-slate-100 px-4 py-3 dark:border-[#37394d]">
      <div className="flex items-start gap-2">
        {drillAcq ? (
          <button
            type="button"
            onClick={() => selectAcq(null)}
            title="Бүх чөлөөлөлт рүү буцах"
            aria-label="Буцах"
            className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-[#02c0ce] dark:text-slate-300 dark:hover:bg-[#252630]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <LayoutDashboard className="mt-0.5 h-4 w-4 shrink-0 text-[#02c0ce]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words text-[13px] font-bold leading-snug text-slate-800 dark:text-white">{title}</p>
          {(subtitle || single) && (
            <p className="mt-0.5 break-words text-[11px] text-slate-500 dark:text-slate-400">
              {[subtitle, single ? ACQ_STATUS_LABEL[single.status] : ""].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => (embedded ? onClose?.() : setOpen(false))}
          title="Хаах"
          aria-label="Статистик хаах"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#252630]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Оны сонголт зүүн захаас, сонгосон онууд ард нь жагсана */}
      {showYears && (drillAcq || rootYears) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <YearMultiSelect value={panelYears} onChange={setPanelYears} className="w-36" />
          {[...panelYears].sort((a, b) => a - b).map((y) => (
            <span
              key={y}
              className="inline-flex h-6 items-center gap-1 rounded-md bg-[#02c0ce] pl-2 pr-1 text-[12px] font-bold tabular-nums text-white shadow-sm"
            >
              {y}
              <button
                type="button"
                onClick={() => setPanelYears(panelYears.filter((p) => p !== y))}
                title="Хасах"
                aria-label={`${y} он хасах`}
                className="flex h-4 w-4 items-center justify-center rounded hover:bg-white/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : showYears && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {years.length > 0 ? (
            [...years].sort((a, b) => a - b).map((y) => (
              <span key={y} className="inline-flex h-6 items-center rounded-md bg-[#02c0ce] px-2 text-[12px] font-bold tabular-nums text-white shadow-sm">
                {y}
              </span>
            ))
          ) : (
            <span className="inline-flex h-6 items-center rounded-md bg-[#02c0ce] px-2 text-[12px] font-bold text-white shadow-sm">Бүх он</span>
          )}
        </div>
      )}
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {loading && !data ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-[#252630]" />
              ))}
            </div>
          ) : !data ? (
            <p className="text-[12px] text-slate-500">Мэдээлэл алга</p>
          ) : (
            <>
              {/* Гол үзүүлэлтүүд */}
              <div className="grid grid-cols-4 gap-1.5">
                <Kpi label="Нийт нэгж талбар" value={total.toLocaleString()} />
                <Kpi label="Чөлөөлсөн" value={`${freed.toLocaleString()}`} hint={`${pct(freed, total)}%`} tone="good" />
                <Kpi
                  label="Чөлөөлсөн талбай"
                  value={`${ha(data.freed_area_m2 ?? 0)} га`}
                  hint={data.plan_area_m2 ? `/ ${ha(data.plan_area_m2)} га` : undefined}
                />
                <Kpi label="Захирамж" value={`${(dec?.confirmed ?? 0).toLocaleString()}`} hint={dec ? `/ ${dec.total} төсөл` : undefined} />
              </div>

              {/* Олон чөлөөлөлт — гүйцэтгэлээр */}
              {acqProgress.length > 0 && (
                <Section
                  title="Чөлөөлөлтүүд"
                  right={filtering ? `${visibleAcqs.length} / ${acqProgress.length}` : `${acqProgress.length}`}
                >
                  <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
                    {ACQ_BUCKETS.map((b) => (
                      <DecisionChip
                        key={b.key}
                        label={b.label}
                        value={acqBuckets[b.key]}
                        color={b.color}
                        active={bucketFilter.has(b.key)}
                        dimmed={filtering && !bucketFilter.has(b.key)}
                        onClick={() => toggleBucket(b.key)}
                      />
                    ))}
                  </div>
                  {visibleAcqs.length === 0 && <p className="px-1.5 text-[12px] text-slate-500">Чөлөөлөлт алга</p>}
                  <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                    {visibleAcqs.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => selectAcq(a.id)}
                          className="group block w-full rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 flex-1 break-words text-slate-600 group-hover:text-[#02c0ce] dark:text-slate-300">{a.name}</span>
                            <span className="shrink-0 tabular-nums font-semibold text-slate-800 dark:text-white">{a.pct}%</span>
                          </div>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                            <div className="h-full bg-[#02c0ce]" style={{ width: `${Math.min(100, a.pct)}%` }} />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Нэгж талбар — явцаар */}
              <Section title="Нэгж талбар явцаар" right={parcelCountAll > 0 ? `Гүйцэтгэл ${progress}%` : undefined}>
                {statuses.length === 0 ? (
                  <p className="text-[12px] text-slate-500">Нэгж талбар алга</p>
                ) : (
                  <>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                      {statuses.map((s) => (
                        <div key={s.id} style={{ width: `${pct(s.count, total)}%`, background: s.color }} title={`${s.name}: ${s.count}`} />
                      ))}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {statuses.map((s) => (
                        <li key={s.id} className="flex items-start gap-2 text-[12px]">
                          <StatusDot color={s.color} className="mt-1" />
                          <span className="min-w-0 flex-1 break-words text-slate-600 dark:text-slate-300">{s.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-white">{s.count.toLocaleString()}</span>
                          <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">{pct(s.count, total)}%</span>
                          <span className="w-16 shrink-0 text-right tabular-nums text-slate-400">{ha(s.area)} га</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              {/* Нөхөх олговор */}
              <Section title="Нөхөх олговор">
                <p className="text-[18px] font-bold tabular-nums text-slate-800 dark:text-white">
                  <AbbrevAmount value={compTotal}>{formatBillion(compTotal)}</AbbrevAmount>
                </p>
                {comp && (
                  <ul className="mt-1.5 space-y-1 text-[12px]">
                    <MoneyRow color="#0acf97" label="Захирамж гарсан" value={comp.issued} />
                    <MoneyRow color="#0f9ed5" label="Төсөлд байгаа · үнэлгээ баталгаажсан" value={comp.approved} />
                    <MoneyRow color="#f9bc0b" label="Үнэлгээ баталгаажаагүй" value={comp.unapproved} />
                  </ul>
                )}
              </Section>

              {/* Үнэлгээний бүтэц */}
              {structureTotal > 0 && (
                <Section title="Үнэлгээний бүтэц">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                    {structure.map((x) => (
                      <div key={x.label} style={{ width: `${pct(x.value, structureTotal)}%`, background: x.color }} />
                    ))}
                  </div>
                  <ul className="mt-2 space-y-1 text-[12px]">
                    {structure.map((x) => (
                      <MoneyRow key={x.label} color={x.color} label={`${x.label} · ${pct(x.value, structureTotal)}%`} value={x.value} />
                    ))}
                  </ul>
                </Section>
              )}

              {/* Санхүүжилтийн эх үүсвэр */}
              {funding.length > 0 && (
                <Section title="Санхүүжилтийн эх үүсвэр">
                  <ul className="space-y-1 text-[12px]">
                    {funding.map((f, i) => (
                      <MoneyRow key={f.key || f.name} color={["#02c0ce", "#777edd", "#f9bc0b", "#0acf97", "#f1556c"][i % 5]} label={f.name || "—"} value={f.amount} />
                    ))}
                  </ul>
                </Section>
              )}

              {/* Үнэлгээ */}
              {(valStatuses.length > 0 || valTypes.length > 0) && (
                <Section title="Үнэлгээ">
                  {valStatuses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {valStatuses.map((v) => {
                        const meta = VALUATION_STATUS[v.status] ?? { label: v.status, color: "#64748b" };
                        return (
                          <span key={v.status} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: `${meta.color}1f`, color: meta.color }}>
                            {meta.label} <b className="tabular-nums">{v.count}</b>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {valTypes.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[12px]">
                      {valTypes.map((v) => (
                        <li key={v.valuation_type} className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 break-words text-slate-600 dark:text-slate-300">
                            {VALUATION_TYPE_LABEL[v.valuation_type] ?? v.valuation_type}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-500">{v.count}</span>
                          <span className="w-[92px] shrink-0 text-right font-semibold tabular-nums text-slate-800 dark:text-white">
                            <AbbrevAmount value={v.amount}>{formatBillion(v.amount)}</AbbrevAmount>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}

              {/* Захирамжийн төсөл — явцаар */}
              {dec && dec.total > 0 && (
                <Section title="Захирамжийн төсөл" right={`${dec.total}`}>
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <DecisionChip label="Төсөл" value={dec.draft} color="#98a6ad" />
                    <DecisionChip label="Хянагдаж буй" value={dec.reviewing} color="#777edd" />
                    <DecisionChip label="Батлах" value={dec.confirming} color="#f9bc0b" />
                    <DecisionChip label="Батлагдсан" value={dec.confirmed} color="#0acf97" />
                  </div>
                </Section>
              )}

              {/* Газрын судалгаа (санал асуулга) — хариулт бүрийн тоо */}
              {showSurvey && survey && survey.total > 0 && (
                <Section title="Газрын судалгаа" right={`${survey.answered.toLocaleString()} / ${survey.total.toLocaleString()} бөглөсөн`}>
                  <div className="space-y-1.5">
                    {SURVEY_COUNT_QUESTIONS.map((q) => (
                      <SurveyRow
                        key={q.field}
                        title={q.title}
                        options={[{ label: "Нийт", value: surveyCountTotal(survey[q.summaryKey]) }]}
                      />
                    ))}
                    <SurveyRow
                      title="Шилжин суурьшсан"
                      options={(Object.keys(RELOCATION_LABELS) as RelocationType[]).map((v) => ({
                        label: RELOCATION_LABELS[v],
                        value: survey.relocation_counts[v] ?? 0,
                      }))}
                    />
                  </div>
                </Section>
              )}

              {/* Сараар чөлөөлсөн */}
              <Section title="Сараар чөлөөлсөн нэгж талбар" right={monthTotal > 0 ? `${monthTotal}` : undefined}>
                {monthTotal === 0 ? (
                  <p className="text-[12px] text-slate-500">Чөлөөлсөн нэгж талбар алга</p>
                ) : (
                  <div className="h-[130px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                        <Tooltip
                          cursor={{ fill: "rgba(2,192,206,0.08)" }}
                          formatter={(v: unknown) => [`${v} нэгж талбар`, "Чөлөөлсөн"]}
                          contentStyle={{ fontSize: 12, borderRadius: 6 }}
                        />
                        <Bar dataKey="count" fill="#0acf97" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Section>

              {/* Ерөнхий мэдээлэл */}
              {(single || locations.length > 0) && (
                <Section title="Ерөнхий">
                  <dl className="space-y-1 text-[12px]">
                    {single?.general_category_name && (
                      <InfoRow label="Ангилал" value={[single.general_category_name, single.sub_category_name].filter(Boolean).join(" › ")} />
                    )}
                    {(single?.start_date || single?.end_date) && (
                      <InfoRow label="Хугацаа" value={`${fmtDate(single?.start_date) || "—"} – ${fmtDate(single?.end_date) || "—"}`} />
                    )}
                    {single && acqs.length === 1 && single.area_m2 > 0 && <InfoRow label="Талбай" value={`${ha(single.area_m2)} га`} />}
                    {!!single?.assigned_users?.length && (
                      <InfoRow label="Хариуцагч" value={single.assigned_users.map((u) => u.user_name).filter(Boolean).join(", ")} />
                    )}
                    {single?.professional_org_name && <InfoRow label="Мэргэжлийн байгууллага" value={single.professional_org_name} />}
                    {single?.implementing_org && <InfoRow label="Хэрэгжүүлэгч" value={single.implementing_org} />}
                    {single?.decree_number && (
                      <InfoRow label="Шийдвэр" value={[single.decree_number, fmtDate(single.decree_date)].filter(Boolean).join(" · ")} />
                    )}
                    {locations.length > 0 && (
                      <div className="flex items-start gap-2">
                        <dt className="w-[110px] shrink-0 text-slate-400">Байршил</dt>
                        <dd className="min-w-0 flex-1 space-y-0.5 font-medium text-slate-700 dark:text-slate-200">
                          {locations.map((l) => (
                            <p key={l.district} className="break-words">
                              {l.district}
                              {l.khoroos.length > 0 && <span className="font-normal text-slate-500 dark:text-slate-400">, {l.khoroos.join(", ")}</span>}
                            </p>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {(single?.overlapping_parcel_count ?? 0) > 0 && (
                    <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                      Байршлаар давхцсан {single?.overlapping_parcel_count} нэгж талбар байна
                    </p>
                  )}
                </Section>
              )}
            </>
          )}
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</h3>
        {right && <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{right}</span>}
      </div>
      {children}
    </section>
  );
}

function SurveyRow({ title, options }: { title: string; options: { label: string; value: number }[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[120px] shrink-0 text-[12px] leading-tight text-slate-500 dark:text-slate-400">{title}</span>
      <div className="grid flex-1 gap-1.5 text-center" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <DecisionChip key={o.label} label={o.label} value={o.value} color="#02c0ce" />
        ))}
      </div>
    </div>
  );
}

// URL хэт урт болохоос сэргийлж чөлөөлөлтүүдийг багцлан татаж нийлбэрийг нь авна.
const SURVEY_ID_CHUNK = 100;

async function fetchSurveySummary(acquisitionIds: string[]): Promise<ParcelSurveySummary> {
  const chunks: string[][] = [];
  for (let i = 0; i < acquisitionIds.length; i += SURVEY_ID_CHUNK) chunks.push(acquisitionIds.slice(i, i + SURVEY_ID_CHUNK));
  const parts = await Promise.all(chunks.map((ids) => parcelSurveyApi.summary({ acquisition_ids: ids }, { silent: true })));
  const sum: ParcelSurveySummary = {
    total: 0,
    answered: 0,
    chimney_counts: {},
    toilet_counts: {},
    cohabitant_counts: {},
    relocation_counts: {},
  };
  const add = (into: Record<string, number>, from: Record<string, number> | undefined) => {
    for (const [k, n] of Object.entries(from ?? {})) into[k] = (into[k] ?? 0) + n;
  };
  for (const p of parts) {
    sum.total += p.total;
    sum.answered += p.answered;
    add(sum.chimney_counts, p.chimney_counts);
    add(sum.toilet_counts, p.toilet_counts);
    add(sum.cohabitant_counts, p.cohabitant_counts);
    add(sum.relocation_counts, p.relocation_counts);
  }
  return sum;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-[110px] shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/[0.03]">
      <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn("mt-0.5 text-[16px] font-bold leading-tight tabular-nums text-slate-800 dark:text-white", tone === "good" && "text-[#0acf97] dark:text-[#0acf97]")}>
        {value}
        {hint && <span className="ml-1 text-[11px] font-medium text-slate-400">{hint}</span>}
      </p>
    </div>
  );
}

function MoneyRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 break-words text-slate-600 dark:text-slate-300">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-white">
        <AbbrevAmount value={value}>{formatBillion(value)}</AbbrevAmount>
      </span>
    </li>
  );
}

function DecisionChip({
  label,
  value,
  color,
  active,
  dimmed,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-[15px] font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">{label}</p>
    </>
  );
  if (!onClick) return <div className="rounded-lg bg-slate-50 px-1 py-1.5 dark:bg-white/[0.03]">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? `${label} — шүүлтээс хасах` : `${label} — шүүлтэд нэмэх`}
      className={cn(
        "rounded-lg border bg-slate-50 px-1 py-1.5 transition-all hover:bg-slate-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
        active ? "shadow-sm" : "border-transparent",
        dimmed && "opacity-50",
      )}
      style={active ? { borderColor: color, background: `${color}14` } : undefined}
    >
      {body}
    </button>
  );
}

/**
 * Нэг чөлөөлөлтийн хураангуй (чөлөөлөлтийн хуудасны газрын зураг) — газрын
 * зураг бүтэн дэлгэцэд орох үед л татна. Санхүүгийн хэсэг эрхгүй бол (403) нуугдана.
 */
function sortedYearsKey(years: number[]): string {
  return [...years].sort((a, b) => a - b).join(",");
}

export function useAcquisitionOverview(acquisitionId: string, enabled: boolean, years?: number[]) {
  const yearKey = years?.length ? [...years].sort((a, b) => a - b) : [];
  const dash = useQuery({
    queryKey: ["map-overview", "dashboard", acquisitionId, yearKey],
    queryFn: () => dashboardApi.get({ acquisition_id: acquisitionId, years: yearKey }, { silent: true }),
    enabled: enabled && !!acquisitionId,
  });
  const finance = useQuery({
    queryKey: ["map-overview", "finance", acquisitionId, yearKey],
    queryFn: () => dashboardApi.finance({ acquisition_id: acquisitionId, years: yearKey }, { silent: true }),
    enabled: enabled && !!acquisitionId,
    retry: false,
  });
  return { data: dash.data, finance: finance.data ?? null, loading: dash.isLoading };
}
