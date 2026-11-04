"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api";
import { hasPermission } from "@/lib/role-utils";
import { Activity, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import {
  SortableHeaderRow,
  nextSortState,
  type SortColumn,
  type SortState,
} from "@/components/ui/sortable-table-head";

const PAGE_SIZE = 20;

// key — backend-ийн auditLogSortColumns-ийн түлхүүр.
const HEADERS: SortColumn[] = [
  { label: "Огноо", key: "created_at" },
  { label: "Ажилтан", key: "actor_name" },
  { label: "Үйлдэл", key: "action" },
  { label: "Объект", key: "resource_type" },
  { label: "Дэлгэрэнгүй" },
  { label: "IP", key: "ip_address" },
];

const ACTION_LABELS: Record<string, string> = {
  created: "Үүсгэсэн",
  updated: "Зассан",
  deleted: "Устгасан",
  status_changed: "Төлөв өөрчилсөн",
  synced: "Синк хийсэн",
  imported: "Импорт хийсэн",
  approved: "Баталсан",
  rejected: "Татгалзсан",
  returned: "Буцаасан",
  uploaded: "Файл оруулсан",
};

const RESOURCE_LABELS: Record<string, string> = {
  acquisition: "Газар чөлөөлөлт",
  parcel: "Нэгж талбар",
  valuation: "Үнэлгээ",
  compensation: "Нөхөх олговор",
  document: "Баримт бичиг",
  payment: "Төлбөр",
  funding_source: "Санхүүжилтийн эх үүсвэр",
  authorized_representative: "Итгэмжлэгдсэн төлөөлөгч",
};

type AuditFilterState = {
  action: string;
  resource_type: string;
  resource_id: string;
  created_from: string;
  created_to: string;
};

const EMPTY_FILTERS: AuditFilterState = {
  action: "",
  resource_type: "",
  resource_id: "",
  created_from: "",
  created_to: "",
};

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function label(map: Record<string, string>, value: string) {
  return map[value] ?? value;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState<AuditFilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<AuditFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState | null>(null);

  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }

  const canView = hasPermission("audit:read");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-logs", page, appliedFilters, sort],
    queryFn: () =>
      auditApi.list({
        page,
        page_size: PAGE_SIZE,
        action: appliedFilters.action || undefined,
        resource_type: appliedFilters.resource_type || undefined,
        resource_id: appliedFilters.resource_id || undefined,
        created_from: appliedFilters.created_from || undefined,
        created_to: appliedFilters.created_to || undefined,
        sort: sort?.by,
        order: sort?.dir,
      }),
    enabled: canView,
  });

  const totalPages = data?.total_pages ?? 1;

  function setFilter(name: keyof AuditFilterState, value: string) {
    setDraftFilters((prev) => ({ ...prev, [name]: value }));
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
  }

  if (!canView) {
    return (
      <div className="ap-card p-8 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Энэ хуудсыг харах эрх байхгүй байна.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Үйлдлийн лог
          </h1>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            Нийт {data?.total ?? 0} бүртгэл
          </p>
        </div>
      </div>

      <form
        className="ap-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
      >
        <div className="grid gap-3 md:grid-cols-6">
          <select
            value={draftFilters.action}
            onChange={(e) => setFilter("action", e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
          >
            <option value="">Бүх үйлдэл</option>
            {Object.entries(ACTION_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>

          <select
            value={draftFilters.resource_type}
            onChange={(e) => setFilter("resource_type", e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
          >
            <option value="">Бүх төрөл</option>
            {Object.entries(RESOURCE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={draftFilters.resource_id}
              onChange={(e) => setFilter("resource_id", e.target.value)}
              placeholder="Resource ID"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
            />
          </div>

          <input
            type="date"
            value={draftFilters.created_from}
            onChange={(e) => setFilter("created_from", e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
          />

          <div className="flex gap-2">
            <input
              type="date"
              value={draftFilters.created_to}
              onChange={(e) => setFilter("created_to", e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
            />
            <button
              onClick={clearFilters}
              title="Шүүлт цэвэрлэх"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-white/[0.08] dark:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SearchButton type="submit" disabled={isLoading} className="h-10" />
          <RefreshButton className="h-10 w-10" />
        </div>
      </form>

      <div className="ap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-400 dark:border-white/[0.06] dark:bg-[#252630]/60 dark:text-slate-500">
              <SortableHeaderRow
                columns={HEADERS}
                sort={sort}
                onSort={applySort}
                thClassName="px-5 py-3 font-semibold"
              />
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-[#252630]" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-red-500">
                    Лог жагсаалт авахад алдаа гарлаа.
                  </td>
                </tr>
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-slate-400">
                    Лог олдсонгүй
                  </td>
                </tr>
              ) : (
                data.data.map((log) => (
                  <tr key={log.id} className="text-[13px] text-slate-700 hover:bg-slate-50/60 dark:text-slate-200 dark:hover:bg-[#252630]/50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500 dark:text-slate-400">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{log.actor_name || "-"}</div>
                      <div className="mt-0.5 text-[12px] text-slate-400">
                        {log.actor_position || log.actor_roles?.join(", ") || "-"}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#02c0ce]/10 px-2.5 py-1 text-[12px] font-medium text-[#02a3af]">
                        <Activity className="h-3.5 w-3.5" />
                        {label(ACTION_LABELS, log.action)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{label(RESOURCE_LABELS, log.resource_type)}</div>
                      <div className="mt-0.5 min-w-[140px] max-w-[220px] whitespace-normal break-all font-mono text-[11px] text-slate-400">
                        {log.resource_id || "-"}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="min-w-[220px] max-w-[420px] whitespace-normal break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {JSON.stringify(log.details ?? {})}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {log.ip_address || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-white/[0.06]">
          <span className="text-[12px] text-slate-400">
            Хуудас {page} / {Math.max(totalPages, 1)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
