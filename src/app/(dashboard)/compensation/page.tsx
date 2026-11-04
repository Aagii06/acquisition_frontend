"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { landApi } from "@/lib/api";
import {
  FileText, CheckCircle2, Clock, AlertCircle,
  Search, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { AcquisitionSelect } from "@/app/(dashboard)/parcel/_components/acquisition_select";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import {
  SortableHeaderRow,
  nextSortState,
  type SortColumn,
  type SortState,
} from "@/components/ui/sortable-table-head";

type CompStatus = "pending" | "approved" | "rejected" | "";
type CompType   = "cash" | "land_grant" | "";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Хүлээгдэж буй", color: "#f9bc0b", bg: "#f9bc0b1a" },
  approved: { label: "Батлагдсан",    color: "#0acf97", bg: "#0acf971a" },
  rejected: { label: "Татгалзсан",    color: "#f1556c", bg: "#f1556c1a" },
};

const COMP_TYPE_LABELS: Record<string, string> = {
  cash:       "Мөнгөн",
  land_grant: "Газраар",
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("mn-MN").format(Math.round(n)) + "₮";
}

// key — backend-ийн globalCompensationSortColumns-ийн түлхүүр.
const HEADERS: SortColumn[] = [
  { label: "Нэгж талбар", key: "parcel_id" },
  { label: "Эзэмшигч", key: "holder" },
  { label: "Регистр", key: "register_no" },
  { label: "Олборлолт", key: "acquisition_name" },
  { label: "Хэлбэр", key: "compensation_type" },
  { label: "Дүн", key: "amount" },
  { label: "Огноо", key: "compensation_date" },
  { label: "Төлөв", key: "status" },
];

const PAGE_SIZE = 20;

const EMPTY = { search: "", acquisition_id: "", type: "" as CompType, status: "" as CompStatus };

export default function CompensationsPage() {
  const [draft, setDraft]       = useState(EMPTY);
  const [filter, setFilter]     = useState(EMPTY);
  const [page, setPage]         = useState(1);
  const [searchTick, setSearchTick] = useState(0);
  const [sort, setSort]         = useState<SortState | null>(null);

  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }

  const inp =
    "h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";

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

  const hasFilter = !!(draft.search || draft.acquisition_id || draft.type || draft.status);

  const { data, isLoading } = useQuery({
    queryKey: ["global-compensations", filter, page, searchTick, sort],
    queryFn: () =>
      landApi.listAllCompensations({
        status:         filter.status || undefined,
        search:         filter.search || undefined,
        acquisition_id: filter.acquisition_id || undefined,
        page,
        page_size: PAGE_SIZE,
        sort:  sort?.by,
        order: sort?.dir,
      }),
    placeholderData: (prev) => prev,
  });

  const countParams = {
    search:         filter.search || undefined,
    acquisition_id: filter.acquisition_id || undefined,
    page: 1,
    page_size: 1,
  };

  const { data: approvedData } = useQuery({
    queryKey: ["comp-count", "approved", filter, searchTick],
    queryFn: () => landApi.listAllCompensations({ ...countParams, status: "approved" }),
  });
  const { data: pendingData } = useQuery({
    queryKey: ["comp-count", "pending", filter, searchTick],
    queryFn: () => landApi.listAllCompensations({ ...countParams, status: "pending" }),
  });
  const { data: rejectedData } = useQuery({
    queryKey: ["comp-count", "rejected", filter, searchTick],
    queryFn: () => landApi.listAllCompensations({ ...countParams, status: "rejected" }),
  });
  const { data: allData } = useQuery({
    queryKey: ["comp-count", "all", filter, searchTick],
    queryFn: () => landApi.listAllCompensations({ ...countParams }),
  });

  const rows       = data?.data ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stats = {
    all:      allData?.total ?? 0,
    approved: approvedData?.total ?? 0,
    pending:  pendingData?.total ?? 0,
    rejected: rejectedData?.total ?? 0,
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Нөхөн төлбөр</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            Нийт{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
            {" "}нөхөн төлбөрийн бүртгэл
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: "Нийт",          value: stats.all,      icon: FileText,     color: "#02c0ce" },
          { label: "Батлагдсан",    value: stats.approved, icon: CheckCircle2, color: "#0acf97" },
          { label: "Хүлээгдэж буй", value: stats.pending,  icon: Clock,        color: "#f9bc0b" },
          { label: "Татгалзсан",    value: stats.rejected, icon: AlertCircle,  color: "#f1556c" },
        ] as { label: string; value: number; icon: React.ElementType; color: string }[]).map(
          ({ label, value, icon: Icon, color }) => (
            <div key={label} className="ap-card px-5 py-4 flex items-center gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${color}18` }}
              >
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
                  {label}
                </p>
                <p className="text-2xl font-bold tabular-nums text-slate-800 dark:text-white">{value}</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Filters */}
      <div className="ap-card p-4">
        <div className="flex items-center gap-3 flex-wrap" {...searchOnEnter(applySearch)}>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Талбарын дугаар, эзэмшигч"
              value={draft.search}
              onChange={(e) => setDraft((f) => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              className={`${inp} pl-8 w-full`}
            />
          </div>

          <AcquisitionSelect
            selectedId={draft.acquisition_id}
            onSelect={(id) => setDraft((f) => ({ ...f, acquisition_id: id }))}
            onClear={() => setDraft((f) => ({ ...f, acquisition_id: "" }))}
            className="flex-1 min-w-[180px]"
          />

          <select
            value={draft.type}
            onChange={(e) => setDraft((f) => ({ ...f, type: e.target.value as CompType }))}
            className={`${inp} w-36`}
          >
            <option value="">Олговорын хэлбэр</option>
            <option value="cash">Мөнгөн</option>
            <option value="land_grant">Газраар</option>
          </select>

          <select
            value={draft.status}
            onChange={(e) => setDraft((f) => ({ ...f, status: e.target.value as CompStatus }))}
            className={`${inp} w-44`}
          >
            <option value="">Нөхөн төлбөрийн төлөв</option>
            <option value="pending">Хүлээгдэж буй</option>
            <option value="approved">Батлагдсан</option>
            <option value="rejected">Татгалзсан</option>
          </select>

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

      {/* Table card */}
      <div className="ap-card overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-100 dark:bg-[#252630]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-[13px]">Нөхөн төлбөр олдсонгүй</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <SortableHeaderRow
                  columns={HEADERS}
                  sort={sort}
                  onSort={applySort}
                  thClassName="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap"
                  className="border-b border-slate-100 dark:border-[#37394d] bg-slate-50/80 dark:bg-[#1a1d20]"
                />
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
                {rows.map((comp) => {
                  const sc = STATUS_CONFIG[comp.status] ?? STATUS_CONFIG.pending;
                  const holderName =
                    [comp.holder_last_name, comp.holder_name].filter(Boolean).join(" ") || "—";
                  return (
                    <tr
                      key={comp.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-[#252630] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        {/* prefetch=false — мөр бүрийн RSC prefetch browser-ийн 6 холболтыг дүүргэдэг */}
                        <Link
                          prefetch={false}
                          href={`/compensation/${comp.id}`}
                          className="font-semibold text-[#02c0ce] hover:underline underline-offset-2 font-mono text-[12px]"
                        >
                          {comp.parcel_id || "—"}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-800 dark:text-white">{holderName}</p>
                        <p className="min-w-[160px] max-w-[280px] whitespace-normal break-words text-[11px] leading-snug text-slate-400">
                          {comp.acquisition_name}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {comp.holder_register_no || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                        <p className="min-w-[160px] max-w-[320px] whitespace-normal break-words leading-snug">
                          {comp.acquisition_name || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            comp.compensation_type === "cash"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400"
                              : "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400",
                          )}
                        >
                          {COMP_TYPE_LABELS[comp.compensation_type] ?? comp.compensation_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold tabular-nums text-slate-800 dark:text-white whitespace-nowrap">
                        {fmtMoney(comp.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                        {comp.compensation_date ? formatDate(comp.compensation_date) : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ color: sc.color, background: sc.bg }}
                        >
                          {sc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-[#37394d]">
            <p className="text-[12px] text-slate-400 dark:text-slate-500">
              Нийт {total} бичлэгийн {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)}-г харуулж байна
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-medium border transition-colors",
                    page === p
                      ? "bg-[#02c0ce] text-white border-[#02c0ce]"
                      : "border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:border-[#02c0ce] hover:text-[#02c0ce]",
                  )}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
