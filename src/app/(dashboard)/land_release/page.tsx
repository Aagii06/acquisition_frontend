"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "next-themes";
import { Layers, Plus, Search, X } from "lucide-react";
import { landReleaseApi } from "@/lib/api";
import { formatArea, formatDate } from "@/lib/utils";
import { hasPermission } from "@/lib/role-utils";
import { notifyNavStart } from "@/lib/blocking-loader-state";
import GeometryPreviewMap from "@/components/map/geometry-preview-map";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { SearchButton } from "@/components/ui/search-button";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  LAND_RELEASE_STATUS_COLORS,
  LAND_RELEASE_STATUS_LABELS,
  landReleaseNo,
} from "@/types";
import type { LandReleaseFilter } from "@/types";
import { CreateLandReleaseDialog } from "./_components/create_land_release_dialog";
import { inp } from "./_components/decree_fields";

const PAGE_SIZE = 20;
const STATUSES = [1, 2, 3];
// Дүүргийн цуврлын өнгө — dataviz-ийн баталгаажсан 8 үүр (гэрэл/бараан тус тусдаа
// шалгасан). 8-аас олон дүүрэгт ШИНЭ өнгө гаргахгүй: 9 дэх-ээс өнгө давтагдаж,
// тасархай шугам + дөрвөлжин цэгээр ялгагдана (өнгө × хэлбэр).
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

function districtSeriesStyle(slot: number, dark: boolean) {
  const palette = dark ? SERIES_DARK : SERIES_LIGHT;
  const round = Math.floor(slot / palette.length);
  return {
    color: palette[slot % palette.length],
    dash: round === 0 ? undefined : round === 1 ? "6 4" : "2 3",
    square: round % 2 === 1,
  };
}

// Цэг — гадуураа гадаргын өнгөтэй 2px хүрээтэй (шугам огтлолцоход ялгарна).
function SeriesDot(props: { cx?: number; cy?: number; stroke?: string; square?: boolean; r?: number }) {
  const { cx, cy, stroke, square, r = 4 } = props;
  if (cx == null || cy == null) return null;
  return square ? (
    <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1} fill={stroke} stroke="var(--clr-card)" strokeWidth={2} />
  ) : (
    <circle cx={cx} cy={cy} r={r} fill={stroke} stroke="var(--clr-card)" strokeWidth={2} />
  );
}
// Оны график — төлөвийн өнгөнөөс (шар/ногоон/улаан) ялгаатай хос (dataviz validator: гэрэл/бараан PASS).
const YEAR_COLORS = { releases: "#0284c7", decrees: "#c2410c" };

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.25)",
  fontSize: 12,
};
const axisTick = { fontSize: 11, fill: "#94a3b8" };

function StatusPill({ status }: { status: number }) {
  const color = LAND_RELEASE_STATUS_COLORS[status] ?? "#64748b";
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
      style={{ background: `${color}1f` }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="whitespace-normal leading-tight">{LAND_RELEASE_STATUS_LABELS[status] ?? "—"}</span>
    </span>
  );
}

function Tile({ label, value, sub, dot }: { label: string; value: string; sub?: string; dot?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white/60 p-3 dark:border-[#37394d] dark:bg-white/[0.03]">
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
      </p>
      <p className="mt-1 text-[18px] font-bold tabular-nums text-slate-800 dark:text-white">{value}</p>
      {sub && <p className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}

export default function LandReleasePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("land:create");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [draft, setDraft] = useState({ search: "", status: 0, year: 0, structure_type_id: 0 });
  const [filter, setFilter] = useState<LandReleaseFilter>({});
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const applySearch = () => {
    setFilter({
      search: draft.search,
      status: draft.status || undefined,
      year: draft.year || undefined,
      structure_type_id: draft.structure_type_id || undefined,
    });
    setPage(1);
  };
  const clearAll = () => {
    setDraft({ search: "", status: 0, year: 0, structure_type_id: 0 });
    setFilter({});
    setPage(1);
  };
  const hasFilter = Boolean(filter.search || filter.status || filter.year || filter.structure_type_id);

  const { data, isLoading } = useQuery({
    queryKey: ["land-releases", filter, page],
    queryFn: () => landReleaseApi.list({ ...filter, page, page_size: PAGE_SIZE }),
  });
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["land-releases-stats", filter],
    queryFn: () => landReleaseApi.stats(filter),
    placeholderData: (prev) => prev,
  });
  const { data: structureTypes = [] } = useQuery({
    queryKey: ["land-release-structure-types"],
    queryFn: landReleaseApi.structureTypes,
  });
  const { data: mapItems = [] } = useQuery({
    queryKey: ["land-releases-map", filter],
    queryFn: () => landReleaseApi.map(filter),
    placeholderData: (prev) => prev,
  });

  const geometries = useMemo(
    () =>
      mapItems.map((m) => ({
        wkt: m.geometry_wkt,
        color: LAND_RELEASE_STATUS_COLORS[m.status] ?? "#64748b",
        filled: true,
        width: 2,
        label: LAND_RELEASE_STATUS_LABELS[m.status],
        text: mapItems.length <= 80 ? landReleaseNo(m.release_no) : undefined,
      })),
    [mapItems],
  );

  const statusCount = (s: number) => stats?.by_status.find((r) => r.status === s);
  const years = stats?.by_year ?? [];
  const yearChart = years.map((y) => ({
    year: String(y.year),
    "Газрын тоо": y.planning + y.released + y.cancelled,
    "Захирамжийн тоо": y.decrees,
    area: y.area_m2,
  }));

  const districts = useMemo(() => stats?.by_district ?? [], [stats]);
  // Дүүрэг × он — мөр бүр нэг он, багана бүр нэг дүүрэг (байхгүй бол 0 — шугам тасрахгүй).
  const districtRefs = useMemo(() => stats?.districts ?? [], [stats]);
  const districtSeries = useMemo(() => {
    const present = new Set((stats?.by_district_year ?? []).map((r) => r.code));
    // Өнгө — шүүлтгүй жагсаалт дахь байрлалаар (шүүлт солигдоход өнгө хадгалагдана).
    return (stats?.districts ?? [])
      .map((d, i) => ({ ...d, key: d.code ? d.name : "Давхцаагүй", slot: i }))
      .filter((d) => present.has(d.code));
  }, [stats]);
  const districtYearChart = useMemo(() => {
    const byYear = new Map<number, Record<string, number>>();
    for (const r of stats?.by_district_year ?? []) {
      const ref = districtRefs.find((d) => d.code === r.code);
      const key = r.code ? (ref?.name ?? r.code) : "Давхцаагүй";
      const row = byYear.get(r.year) ?? {};
      row[key] = r.count;
      byYear.set(r.year, row);
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, row]) => {
        const full: Record<string, number | string> = { year: String(year) };
        districtSeries.forEach((d) => (full[d.key] = row[d.key] ?? 0));
        return full;
      });
  }, [stats, districtRefs, districtSeries]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["land-releases"] });
    queryClient.invalidateQueries({ queryKey: ["land-releases-stats"] });
    queryClient.invalidateQueries({ queryKey: ["land-releases-map"] });
    // Оруулахад шинэ төрөл нэмэгдсэн байж болно.
    queryClient.invalidateQueries({ queryKey: ["land-release-structure-types"] });
  };

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Шүүлт — газрын зураг, статистик, жагсаалт гурвуулаа энэ шүүлтээр */}
      <div className="ap-card w-full min-w-0 p-4">
        <div
          className="grid w-full min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto_auto_auto]"
          {...searchOnEnter(applySearch)}
        >
          <div className="relative min-w-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Буулгалтын нэр, захирамжийн дугаар эсвэл Б-дугаар"
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              className={`${inp} pl-8`}
            />
          </div>
          <select
            value={draft.status}
            onChange={(e) => setDraft((d) => ({ ...d, status: Number(e.target.value) }))}
            className={inp}
          >
            <option value={0}>Бүх төлөв</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {LAND_RELEASE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            value={draft.structure_type_id}
            onChange={(e) => setDraft((d) => ({ ...d, structure_type_id: Number(e.target.value) }))}
            className={inp}
          >
            <option value={0}>Бүх байгууламжийн төрөл</option>
            {structureTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={draft.year}
            onChange={(e) => setDraft((d) => ({ ...d, year: Number(e.target.value) }))}
            className={inp}
          >
            <option value={0}>Бүх он</option>
            {(stats?.years ?? []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <SearchButton onClick={applySearch} />
          <RefreshButton />
          {hasFilter && (
            <button
              onClick={clearAll}
              className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 text-[12px] font-medium text-rose-500 transition-colors hover:border-rose-400 hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-400"
            >
              <X className="h-3.5 w-3.5" /> Цэвэрлэх
            </button>
          )}
        </div>
      </div>

      {/* Дээд хэсэг — газрын зураг + статистик */}
      <div className="ap-card w-full min-w-0 overflow-hidden">
        <div className="grid min-w-0 grid-cols-1 divide-y divide-slate-100 dark:divide-[#37394d] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:divide-x xl:divide-y-0">
          <div className="min-w-0 space-y-5 p-5">
            <p className="-mb-2 text-[13px] font-semibold text-slate-700 dark:text-white">
              Байршил{hasFilter ? " (шүүлтээр)" : ""}
              <span className="ml-2 text-[12px] font-normal text-slate-400">{mapItems.length} газар · дарж дэлгэрэнгүй</span>
            </p>
            <GeometryPreviewMap
              geometries={geometries}
              height={420}
              emptyText="Бүртгэгдсэн газар алга"
              clusterOrder={STATUSES.map((st) => LAND_RELEASE_STATUS_COLORS[st])}
              // 1:25,000-аас хол — тоотой icon, ойр — хил (Улаанбаатарт ≈ zoom 13.9).
              iconAboveScale={25000}
              onSelect={(i) => {
                const m = mapItems[i];
                if (!m) return;
                notifyNavStart();
                router.push(`/land_release/${m.id}`);
              }}
            />

            {/* Оноор — газар ба захирамжийн тоо нэг график дээр (нэг тэнхлэг: хоёулаа тоо) */}
            <div>
              <p className="text-[13px] font-semibold text-slate-700 dark:text-white">
                Газар ба захирамжийн тоо оноор{hasFilter ? " (шүүлтээр)" : ""}
              </p>
              <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                Захирамжтай бол захирамжийн оноор, эс бөгөөс оруулсан оноор
              </p>
              {yearChart.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-slate-400">Мэдээлэл алга</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearChart} barGap={2} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
                      <XAxis dataKey="year" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(148,163,184,0.12)" }}
                        contentStyle={tooltipStyle}
                        formatter={(v, n) => [Number(v).toLocaleString("mn-MN"), n]}
                        labelFormatter={(l, p) => {
                          const area = p?.[0]?.payload?.area as number | undefined;
                          return `${l} он · ${formatArea(area)}`;
                        }}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Газрын тоо" fill={YEAR_COLORS.releases} maxBarSize={28} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Захирамжийн тоо" fill={YEAR_COLORS.decrees} maxBarSize={28} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-5 p-5">
            {statsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.05]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Tile label="Нийт газар" value={(stats?.total ?? 0).toLocaleString("mn-MN")} />
                <Tile label="Нийт талбай" value={formatArea(stats?.total_area_m2)} />
                <Tile label="Захирамж" value={(stats?.decree_count ?? 0).toLocaleString("mn-MN")} />
                {STATUSES.map((s) => (
                  <Tile
                    key={s}
                    dot={LAND_RELEASE_STATUS_COLORS[s]}
                    label={LAND_RELEASE_STATUS_LABELS[s]}
                    value={(statusCount(s)?.count ?? 0).toLocaleString("mn-MN")}
                    sub={formatArea(statusCount(s)?.area_m2)}
                  />
                ))}
              </div>
            )}

            {/* Хүснэгт — бүх сум/дүүрэг (графикийн «Бусад»-ыг задлан) */}
            <div className="min-w-0">
              <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-white">Дүүрэг/сумын хүснэгт</p>
              {districts.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-slate-400">Мэдээлэл алга</p>
              ) : (
                <div className="max-h-[260px] overflow-y-auto rounded-lg border border-slate-100 dark:border-[#37394d]">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0">
                      <tr className="border-b border-slate-100 bg-slate-50 dark:border-[#37394d] dark:bg-[#1a1d20]">
                        {["Аймаг/хот", "Сум/дүүрэг", "Газар", "Чөлөөлсөн", "Талбай"].map((h, i) => (
                          <th
                            key={h}
                            className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${i >= 2 ? "text-right" : "text-left"}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
                      {districts.map((d) => (
                        <tr key={d.code || "none"} className="hover:bg-slate-50/60 dark:hover:bg-[#252630]">
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{d.au1_name || "—"}</td>
                          <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                            {d.code ? d.name : "Давхцаагүй"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-200">
                            {d.count.toLocaleString("mn-MN")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {d.released.toLocaleString("mn-MN")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {formatArea(d.area_m2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Сум/дүүрэг × он — дүүрэг бүр нэг шугам (өнгө нь дүүрэгт тогтмол) */}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-700 dark:text-white">
                Дүүрэг/сумаар оноор{hasFilter ? " (шүүлтээр)" : ""}
              </p>
              <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
                Газрын тоо. Захирамжтай бол захирамжийн оноор, эс бөгөөс оруулсан оноор.
              </p>
              {districtYearChart.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-slate-400">Мэдээлэл алга</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={districtYearChart} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
                      {/* Ганц он байхад цэгүүд голд байрлана (padding) */}
                      <XAxis dataKey="year" padding={{ left: 24, right: 24 }} tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ stroke: "rgba(148,163,184,0.5)", strokeWidth: 1 }}
                        contentStyle={tooltipStyle}
                        itemSorter={(item) => -Number(item.value)}
                        formatter={(v, n) => [Number(v).toLocaleString("mn-MN"), n]}
                        labelFormatter={(l) => `${l} он`}
                      />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      {districtSeries.map((d) => {
                        const st = districtSeriesStyle(d.slot, isDark);
                        return (
                          <Line
                            key={d.code || "none"}
                            type="monotone"
                            dataKey={d.key}
                            stroke={st.color}
                            strokeWidth={2}
                            strokeDasharray={st.dash}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            legendType={st.square ? "square" : "circle"}
                            dot={(props) => (
                              <SeriesDot key={`${d.code}-${props.index}`} cx={props.cx} cy={props.cy} stroke={st.color} square={st.square} />
                            )}
                            activeDot={(props) => (
                              <SeriesDot key={`${d.code}-a`} cx={props.cx} cy={props.cy} stroke={st.color} square={st.square} r={6} />
                            )}
                            isAnimationActive={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Доод хэсэг — жагсаалт. Оруулах товч жагсаалтын дээр. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-slate-800 dark:text-white">Чөлөөлсөн талбайн жагсаалт</p>
          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            Нийт <span className="font-semibold text-slate-600 dark:text-slate-300">{data?.total ?? 0}</span> газар
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#02c0ce] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#02a3af]"
          >
            <Plus className="h-4 w-4" />
            Оруулах
          </button>
        )}
      </div>

      {showCreate && (
        <CreateLandReleaseDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      <div className="ap-card w-full min-w-0 overflow-hidden">
        {isLoading ? (
          <div className="animate-pulse space-y-3 p-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-100 dark:bg-[#252630]" />
            ))}
          </div>
        ) : !data?.data?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <Layers className="mb-3 h-10 w-10 text-slate-300 dark:text-[#37394d]" />
            <p className="text-[13px]">Газар олдсонгүй</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 dark:border-[#37394d] dark:bg-[#1a1d20]">
                  {["Дугаар", "Нэр", "Дүүрэг/сум", "Байгууламжийн төрөл", "Төлөв", "Захирамж", "Талбай", "Эх файл", "Оруулсан", ""].map((h, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
                {data.data.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-[#252630]">
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {landReleaseNo(r.release_no)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="whitespace-normal break-words font-medium text-slate-700 dark:text-slate-200">{r.name}</p>
                      {r.description && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400 dark:text-slate-500">{r.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-slate-600 dark:text-slate-300">{r.au2_name || "—"}</p>
                      {r.au1_name && <p className="text-[11px] text-slate-400 dark:text-slate-500">{r.au1_name}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{r.structure_type_name || "—"}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {r.decree ? (
                        <>
                          {r.decree.decree_number}
                          {r.decree.decree_date && (
                            <span className="ml-1 font-sans text-[11px] text-slate-400">{formatDate(r.decree.decree_date)}</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                      {formatArea(r.area_m2)}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-slate-500 dark:text-slate-400">
                      <p className="max-w-[220px] truncate" title={r.source_file}>
                        {r.source_file || "—"}
                        {r.source_file ? ` #${r.source_index}` : ""}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500 dark:text-slate-400">{formatDate(r.created_at)}</td>
                    <td className="px-3 py-3">
                      <Link
                        prefetch={false}
                        href={`/land_release/${r.id}`}
                        onClick={notifyNavStart}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#02c0ce]/10 px-2 py-1 text-[11px] font-medium text-[#02c0ce] transition-colors hover:bg-[#02c0ce]/20"
                      >
                        Дэлгэрэнгүй
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-[#37394d]">
            <p className="text-[12px] text-slate-400 dark:text-slate-500">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} / {data.total}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-[#37394d] dark:hover:bg-[#252630]"
              >
                Өмнөх
              </button>
              <span className="px-2 text-[12px] text-slate-500">
                {page} / {data.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-[#37394d] dark:hover:bg-[#252630]"
              >
                Дараах
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
