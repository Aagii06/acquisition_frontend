"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { profApi } from "@/lib/prof-api";
import { STATUS_LABELS, ACQ_STATUS } from "@/types";
import type { LandAcquisition } from "@/types";
import { formatDate, formatArea } from "@/lib/utils";
import { Search, MapPin, ChevronLeft, ChevronRight, X, AlertCircle } from "lucide-react";
import Link from "next/link";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import {
  SortableHeaderRow,
  nextSortState,
  type SortColumn,
  type SortState,
} from "@/components/ui/sortable-table-head";

const STATUS_CFG: Record<number, { color: string; bg: string }> = {
  1: { color: "#02c0ce", bg: "#02c0ce18" },
  2: { color: "#0acf97", bg: "#0acf9718" },
  3: { color: "#8391a2", bg: "#8391a218" },
  4: { color: "#f1556c", bg: "#f1556c18" },
};

const PAGE_SIZE = 15;

// key — backend-ийн acquisitionSortColumns-ийн түлхүүр.
const HEADERS: SortColumn[] = [
  { label: "Төлөвлөгөө", key: "plan_code" },
  { label: "Чөлөөлөлтийн нэр", key: "acquisition_name" },
  { label: "Ерөнхий ангилал", key: "general_category" },
  { label: "Статус", key: "status" },
  { label: "Талбай", key: "area_m2" },
  { label: "Эхлэх", key: "start_date" },
  { label: "Нэгж талбар", key: "parcel_count" },
  { label: "" },
];

export default function MyAcquisitionsPage() {
  const [nameFilter, setNameFilter] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);

  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }

  function applySearch() {
    setAppliedName(nameFilter);
    setPage(1);
  }

  function clearSearch() {
    setNameFilter("");
    setAppliedName("");
    setPage(1);
  }

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["my-land", page, appliedName, sort],
    queryFn: () =>
      profApi.profListMyAcquisitions({
        page,
        page_size: PAGE_SIZE,
        acquisition_name: appliedName || undefined,
        sort: sort?.by,
        order: sort?.dir,
      }),
  });

  const acquisitions: LandAcquisition[] = rawData?.data ?? [];
  const total = rawData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Миний чөлөөлөлтүүд
          </h1>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            Нийт {total} чөлөөлөлтийн бүртгэл
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2" {...searchOnEnter(applySearch)}>
        <div className="flex items-center h-9 flex-1 max-w-xs rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all">
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Нэрээр хайх..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 bg-transparent outline-none"
          />
          {nameFilter && (
            <button onClick={clearSearch} className="text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <SearchButton onClick={applySearch} />
        <RefreshButton />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-[#37394d] bg-white dark:bg-[#1e1f27] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <SortableHeaderRow
                columns={HEADERS}
                sort={sort}
                onSort={applySort}
                thClassName="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap"
                className="border-b border-slate-100 dark:border-[#37394d]"
              />
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-[#2a2c38]">
                    {HEADERS.map((_, j) => (
                      <td key={j} className="px-5 py-3.5">
                        <div className="h-4 rounded bg-slate-100 dark:bg-slate-700 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !acquisitions.length ? (
                <tr>
                  <td
                    colSpan={HEADERS.length}
                    className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500"
                  >
                    Танд холбоотой чөлөөлөлт олдсонгүй
                  </td>
                </tr>
              ) : (
                acquisitions.map((land) => {
                  const sc = STATUS_CFG[land.status] ?? { color: "#8391a2", bg: "#8391a218" };
                  return (
                    <tr
                      key={land.id}
                      className="border-b border-slate-50 dark:border-[#2a2c38] hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      {/* Нэр, ангиллын баганууд ТАСРАХГҮЙ — урт нэрийг
                          жагсаалтаас шууд уншиж чадах ёстой. */}
                      <td className="px-5 py-3.5 align-top">
                        {/* Өргөний хязгаар ДОТООД блок дээр — нүдний max-width
                            `table-layout: auto` үед үл тоогдоно. */}
                        <div className="min-w-[150px] max-w-[260px]">
                          <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200 break-words">
                            {land.plan_code}
                          </p>
                          {land.plan_name && (
                            <p
                              title={land.plan_name}
                              className="text-[11px] text-slate-500 dark:text-slate-400 break-words leading-snug mt-0.5"
                            >
                              {land.plan_name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <p
                          title={land.acquisition_name || undefined}
                          className="min-w-[230px] max-w-[380px] text-[13px] text-slate-700 dark:text-slate-200 break-words leading-snug"
                        >
                          {land.acquisition_name || "—"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[12px] text-slate-600 dark:text-slate-300">
                        <span
                          title={land.general_category_name || undefined}
                          className="block min-w-[120px] max-w-[200px] break-words leading-snug"
                        >
                          {land.general_category_name || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ color: sc.color, background: sc.bg }}
                        >
                          {STATUS_LABELS[land.status] ?? "Тодорхойгүй"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-top text-slate-600 dark:text-slate-400">
                        {formatArea(land.area_m2)}
                      </td>
                      <td className="px-5 py-3.5 align-top tabular-nums text-slate-600 dark:text-slate-400">
                        {formatDate(land.start_date)}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <MapPin className="h-3.5 w-3.5" />
                            {land.parcel_count ?? 0}
                          </span>
                          {/* БАЙРШЛААР давхардсан талбарын тоо — ЗӨВХӨН тоо,
                              улаанаар. Давхардал арилтал чөлөөлөлт "Хээрийн
                              судалгаа" төлөв рүү шилжихгүй тул жагсаалтаас
                              шууд харагдана. */}
                          {(land.overlapping_parcel_count ?? 0) > 0 && (
                            <span
                              title={`${land.overlapping_parcel_count} нэгж талбар байршлаар давхцаж байна. Давхардлыг арилгах хүртэл "Хээрийн судалгаа" төлөвт шилжих боломжгүй.`}
                              className="inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums text-red-600 dark:text-red-400"
                            >
                              <AlertCircle className="h-3 w-3" />
                              {land.overlapping_parcel_count}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        {land.status === ACQ_STATUS.CONFIRMED ? (
                          <span
                            title="Баталгаажсан чөлөөлөлтийн дэлгэрэнгүй мэдээлэлд хандах боломжгүй"
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap cursor-not-allowed select-none"
                          >
                            🔒 Хаалттай
                          </span>
                        ) : (
                          <Link
                            prefetch={false}
                            href={`/acquisition/${land.id}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#02c0ce]/10 text-[#02c0ce] hover:bg-[#02c0ce]/20 px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
                          >
                            Дэлгэрэнгүй
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-[#37394d]">
          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            {total === 0
              ? "Бичлэг олдсонгүй"
              : `Нийт ${total} бичлэгийн ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}-г харуулж байна`}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-medium transition-colors ${
                  p === page
                    ? "bg-[#02c0ce] text-white"
                    : "border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-[#02c0ce] hover:text-[#02c0ce]"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
