"use client";
import { CompensationPaymentBadge } from "@/components/ui/compensation-payment-badge";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parcelApi, parcelStatusApi } from "@/lib/api";
import { STATUS_LABELS, RIGHT_TYPE_LABELS, ACQ_STATUS } from "@/types";
import type { ParcelStatus } from "@/types";
import { StatusLabel } from "@/components/ui/status-label";
import { formatDate, formatArea } from "@/lib/utils";
import { Download, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AcquisitionSelect } from "./_components/acquisition_select";
import { PlanSelect } from "./_components/plan_select";
import { ParcelSyncDialog } from "./_components/parcel_sync_dialog";
import { isExternalSpecialRole } from "@/lib/role-utils";
import { useParcelStatusRules } from "@/lib/use-parcel-status-rules";
import { notifyNavStart } from "@/lib/blocking-loader-state";
import {
  SortableHeaderRow,
  nextSortState,
  type SortColumn,
  type SortState,
} from "@/components/ui/sortable-table-head";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { YearMultiSelect } from "@/components/ui/year-multi-select";
import { useParcelStatusStyle } from "@/lib/use-parcel-status-style";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";

const STATUS_CFG: Record<number, { color: string; bg: string }> = {
  1: { color: "#02c0ce", bg: "#02c0ce18" },
  2: { color: "#f59e0b", bg: "#f59e0b18" },
  3: { color: "#0acf97", bg: "#0acf9718" },
  4: { color: "#f1556c", bg: "#f1556c18" },
};


const EMPTY = {
  parcel_id: "",
  acquisition_id: "",
  plan_code: "",
  right_type: 0,
  landuse: "",
  status: 0,
  // Нэгж талбарын төлөв (parcel_status.id). `status` нь ЧӨЛӨӨЛӨЛТИЙН төлөв.
  status_id: 0,
  // ОЛОН он сонгож болно (чөлөөлөлтийн эхэлсэн оноор шүүнэ).
  years: [] as number[],
};

// Хүснэгтийн баганууд. `key` нь backend-ийн зөвшөөрөгдсөн эрэмбийн түлхүүр —
// эрэмбэ СЕРВЕР дээр хийгддэг тул бүх хуудсыг хамарна.
const COLUMNS: SortColumn[] = [
  { label: "Дугаар", key: "parcel_id" },
  { label: "Чөлөөлөлт", key: "acquisition_name" },
  { label: "Огноо", key: "start_date" },
  { label: "Чөлөөлөлтийн төлөв", key: "acquisition_status" },
  { label: "Эрхийн төрөл", key: "right_type" },
  { label: "Газрын зориулалт", key: "landuse" },
  { label: "Талбай", key: "area_m2" },
  // Олговрын дүн ба төлбөр олголтын хувь НЭГ баганад (дээр дүн, доор олголт).
  { label: "Нөхөн төлбөр", sublabel: "Төлбөр олголт", key: "compensation" },
  { label: "Төлөв", key: "status_id" },
  { label: "Мэдээлэл" },
  { label: "" },
];

type SyncTarget = {
  acqId: string;
  parcelUuid: string;
  parcelCode: string;
  rightType: number;
};

export default function ParcelListPage() {
  const router = useRouter();
  const [draft, setDraft] = useState(EMPTY);
  // Төлөвийн өнгө нь `parcel_status` БҮРТГЭЛЭЭС (хатуу хүснэгтэд шинэ төлөв байхгүй).
  const statusStyle = useParcelStatusStyle();
  // Нэгж талбарын төлөвийн жагсаалт — `parcel_status` бүртгэлээс (шүүлтийн сонголт).
  const { data: parcelStatuses = [] } = useQuery<ParcelStatus[]>({
    queryKey: ["parcel-statuses"],
    queryFn: () => parcelStatusApi.list(),
    staleTime: 5 * 60_000,
  });

  const [filter, setFilter] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  // «Мэдээлэл дуудах» — дэлгэрэнгүй хуудасны товчтой ИЖИЛ цонх. Мөр дарахад
  // дэлгэрэнгүй рүү шилждэг тул цонхыг хүснэгтийн ГАДНА зурна.
  const [syncTarget, setSyncTarget] = useState<SyncTarget | null>(null);
  const statusRules = useParcelStatusRules();
  // Дэлгэрэнгүй хуудастай ижил дүрэм: гадаад рольд товч харагдахгүй;
  // баталгаажсан чөлөөлөлт, эцсийн төлөвтэй нэгж талбарт товч идэвхгүй.
  const canSync = !isExternalSpecialRole();
  const syncLockReason = (acqStatus: number, statusId: number): string | null =>
    acqStatus === ACQ_STATUS.CONFIRMED
      ? "Чөлөөлөлт баталгаажсан тул мэдээлэл дуудах боломжгүй"
      : statusRules(statusId).is_final
        ? "Нэгж талбар эцсийн төлөвтэй тул мэдээлэл дуудах боломжгүй"
        : null;
  const [searchTick, setSearchTick] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);
  const PAGE_SIZE = 20;

  // Эрэмбэ солигдоход эхний хуудас руу буцна — эс бөгөөс хэрэглэгч 5-р
  // хуудсан дээр эрэмбэлээд огт өөр мөрүүд харна.
  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }

  function applySearch() {
    setFilter({ ...draft });
    setPage(1);
    setSearchTick((t) => t + 1);
  }

  function clearAll() {
    setDraft(EMPTY);
    setFilter(EMPTY);
    setPage(1);
    setSearchTick((t) => t + 1);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["global-parcels", filter, page, searchTick, sort],
    queryFn: () =>
      parcelApi.list({
        page,
        page_size: PAGE_SIZE,
        sort: sort?.by,
        order: sort?.dir,
        parcel_id: filter.parcel_id || undefined,
        acquisition_id: filter.acquisition_id || undefined,
        plan_code: filter.plan_code || undefined,
        right_type: filter.right_type || undefined,
        landuse: filter.landuse || undefined,
        status: filter.status || undefined,
        status_id: filter.status_id || undefined,
        years: filter.years.length ? filter.years : undefined,
      }),
  });

  const inp =
    "h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";
  const hasFilter =
    draft.parcel_id ||
    draft.acquisition_id ||
    draft.plan_code ||
    draft.right_type !== 0 ||
    draft.landuse ||
    draft.status !== 0 ||
    draft.status_id !== 0 ||
    draft.years.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Нэгж талбар
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            Бүх чөлөөлөлтийн нэгж талбаруудын жагсаалт
          </p>
        </div>
        <div className="text-[13px] text-slate-400 dark:text-slate-500">
          Нийт:{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {data?.total ?? 0}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="ap-card p-4">
        <div className="flex items-center gap-3 flex-wrap" {...searchOnEnter(applySearch)}>
          {/* Parcel ID */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Талбарын дугаар"
              value={draft.parcel_id}
              onChange={(e) =>
                setDraft((f) => ({ ...f, parcel_id: e.target.value }))
              }
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              className={`${inp} pl-8 w-40`}
            />
          </div>

          {/* Plan select combobox */}
          <PlanSelect
            value={draft.plan_code}
            onChange={(code) => setDraft((f) => ({ ...f, plan_code: code }))}
            className="w-52"
          />

          {/* Acquisition searchable select */}
          <AcquisitionSelect
            selectedId={draft.acquisition_id}
            onSelect={(id) => setDraft((f) => ({ ...f, acquisition_id: id }))}
            onClear={() => setDraft((f) => ({ ...f, acquisition_id: "" }))}
            className="w-56"
          />

          <select
            value={draft.right_type}
            onChange={(e) =>
              setDraft((f) => ({
                ...f,
                right_type: e.target.value ? Number(e.target.value) : 0,
              }))
            }
            className={`${inp} w-36`}
          >
            <option value={0}>Эрхийн төрөл</option>
            <option value={1}>Ашиглах</option>
            <option value={2}>Эзэмших</option>
            <option value={3}>Өмчлөх</option>
          </select>
          <input
            type="text"
            placeholder="Газрын зориулалт"
            value={draft.landuse}
            onChange={(e) =>
              setDraft((f) => ({ ...f, landuse: e.target.value }))
            }
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className={`${inp} w-40`}
          />
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft((f) => ({
                ...f,
                status: e.target.value ? Number(e.target.value) : 0,
              }))
            }
            className={`${inp} w-44`}
          >
            <option value={0}>Чөлөөлөлтийн төлөв</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={draft.status_id}
            onChange={(e) =>
              setDraft((f) => ({
                ...f,
                status_id: e.target.value ? Number(e.target.value) : 0,
              }))
            }
            className={`${inp} w-48`}
          >
            <option value={0}>Нэгж талбарын төлөв</option>
            {parcelStatuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <YearMultiSelect
            value={draft.years}
            onChange={(years) => setDraft((f) => ({ ...f, years }))}
            className="w-32"
          />

          {/* Search button */}
          <SearchButton onClick={applySearch} />
          <RefreshButton />

          {hasFilter && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 h-9 px-3 rounded-lg border border-rose-300 dark:border-rose-400/40 bg-rose-50 dark:bg-rose-400/10 text-[12px] font-medium text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-400/20 hover:border-rose-400 dark:hover:border-rose-400/60 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Цэвэрлэх
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="ap-card overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-10 rounded bg-slate-100 dark:bg-[#252630]"
              />
            ))}
          </div>
        ) : !data?.data?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-[13px]">Нэгж талбар олдсонгүй</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <SortableHeaderRow
                  columns={COLUMNS}
                  sort={sort}
                  onSort={applySort}
                  className="border-b border-slate-100 dark:border-[#37394d] bg-slate-50/80 dark:bg-[#1a1d20]"
                />
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
                {data.data.map((p) => {
                  const sc = STATUS_CFG[p.acquisition_status] ?? STATUS_CFG[1];
                  const cashAmt = Number(p.cash_amount) || 0;
                  const landGrantAmt = Number(p.land_grant_amount) || 0;
                  const landGrantCount = Number(p.land_grant_count) || 0;
                  const detailHref = `/parcel/${p.id}?acq=${p.acquisition_id}`;
                  return (
                    <tr
                      key={p.id}
                      onClick={(e) => {
                        // Дотор нь байгаа холбоос/товч өөрөө ажиллана; текст сонгож байвал шилжихгүй.
                        if ((e.target as HTMLElement).closest("a, button")) return;
                        if (window.getSelection()?.toString()) return;
                        if (e.metaKey || e.ctrlKey) {
                          window.open(detailHref, "_blank");
                          return;
                        }
                        notifyNavStart(undefined, detailHref);
                        router.push(detailHref);
                      }}
                      className="cursor-pointer transition-colors hover:bg-[#02c0ce]/[0.07] dark:hover:bg-[#02c0ce]/[0.12]"
                    >
                      <td className="px-4 py-3 align-top font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                        {p.parcel_id}
                      </td>
                      {/* Чөлөөлөлтийн нэр ТАСРАХГҮЙ: өмнө нь truncate хийгдэж
                          урт нэрийг уншиж чаддаггүй байв. Хүснэгт нь хэвтээ
                          гүйлгэдэг тул мөр дамжуулан бүтнээр харуулна. */}
                      <td className="px-4 py-3 align-top">
                        {/* Өргөний хязгаар ДОТООД блок дээр — нүдний max-width
                            `table-layout: auto` үед үл тоогдоно. */}
                        <div className="min-w-[190px] max-w-[320px]">
                          <p
                            title={p.acquisition_name || undefined}
                            className="font-medium text-slate-700 dark:text-slate-200 break-words leading-snug"
                          >
                            {p.acquisition_name || "—"}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                            {p.plan_code}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {p.start_date ? formatDate(p.start_date) : "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap"
                          style={{ color: sc.color, background: sc.bg }}
                        >
                          {STATUS_LABELS[p.acquisition_status] ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                        {RIGHT_TYPE_LABELS[p.right_type] || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-300">
                        {p.landuse || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatArea(p.area_m2)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          {cashAmt > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400 tabular-nums w-fit">
                              Мөнгөн&nbsp;{cashAmt.toLocaleString()}₮
                            </span>
                          )}
                          {landGrantCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400 w-fit">
                              Газраар{landGrantAmt > 0 ? <>&nbsp;{landGrantAmt.toLocaleString()}₮</> : <>&nbsp;{landGrantCount}</>}
                            </span>
                          )}
                          {cashAmt === 0 && landGrantCount === 0 && (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </div>
                        <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-white/[0.06]">
                          <CompensationPaymentBadge info={p} />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {p.status_name ? (
                          <StatusLabel color={statusStyle(p.status_id).color} name={p.status_name} />
                        ) : (
                          <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {canSync ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSyncTarget({
                                acqId: p.acquisition_id,
                                parcelUuid: p.id,
                                parcelCode: p.parcel_id,
                                rightType: p.right_type,
                              })
                            }
                            disabled={syncTarget !== null || !!syncLockReason(p.acquisition_status, p.status_id)}
                            title={syncLockReason(p.acquisition_status, p.status_id) ?? "Мэдээлэл дуудах"}
                            aria-label="Мэдээлэл дуудах"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0acf97]/10 text-[#0acf97] transition-colors hover:bg-[#0acf97]/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#0acf97]/10"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {/* prefetch=false — мөр бүрийн RSC prefetch browser-ийн 6 холболтыг дүүргэдэг */}
                        <Link
                          prefetch={false}
                          href={detailHref}
                          onClick={notifyNavStart}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#02c0ce]/10 text-[#02c0ce] hover:bg-[#02c0ce]/20 px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
                        >
                          Дэлгэрэнгүй
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-[#37394d]">
            <p className="text-[12px] text-slate-400 dark:text-slate-500">
              {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, data.total)} / {data.total}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-slate-500 border border-slate-200 dark:border-[#37394d] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors"
              >
                Өмнөх
              </button>
              <span className="text-[12px] text-slate-500 px-2">
                {page} / {data.total_pages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(data.total_pages, p + 1))
                }
                disabled={page === data.total_pages}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-slate-500 border border-slate-200 dark:border-[#37394d] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors"
              >
                Дараах
              </button>
            </div>
          </div>
        )}
      </div>
      {syncTarget && (
        <ParcelSyncDialog
          {...syncTarget}
          onClose={(finished) => {
            setSyncTarget(null);
            if (finished) queryClient.invalidateQueries({ queryKey: ["global-parcels"] });
          }}
        />
      )}
    </div>
  );
}
