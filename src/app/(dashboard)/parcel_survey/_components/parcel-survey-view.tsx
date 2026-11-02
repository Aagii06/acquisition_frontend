"use client";

// «Газрын судалгаа» — бүх нэгж талбарын чөлөөлөгдсөн газрын судалгаа:
// дээд хэсэгт 4 асуултын дүнгийн статистик, доор нь бүртгэлийн жагсаалт.
// Нэгж талбар бүрд хоосон судалгаа автоматаар үүсдэг; мөр дээр дарж
// modal-аас, эсвэл нэгж талбарын дэлгэрэнгүйн «Судалгаа» табаас бөглөнө.
//
// `/parcel_survey` хуудас ба чөлөөлөлтийн «Газрын судалгаа» таб хоёулаа
// үүнийг хэрэглэнэ — таб дээр `acquisitionId` тогтмол тул чөлөөлөлтийн
// сонголт, баганыг нууна.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Eye, PencilLine, Search, X } from "lucide-react";
import { parcelSurveyApi } from "@/lib/api";
import { hasPermission, isExternalSpecialRole } from "@/lib/role-utils";
import { formatDate } from "@/lib/utils";
import { notifyNavStart } from "@/lib/blocking-loader-state";
import {
  RELOCATION_LABELS,
  SURVEY_COUNT_QUESTIONS,
  isSurveyAnswered,
  surveyCountLabel,
  surveyCountTotal,
} from "@/lib/parcel-survey";
import type { ParcelSurveyRow, ParcelSurveySummary, RelocationType } from "@/types";
import { SurveyTab } from "../../parcel/[id]/_components/survey_tab";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import { AcquisitionSelect } from "../../parcel/_components/acquisition_select";

const PAGE_SIZE = 20;

type AnsweredFilter = "" | "true" | "false";

/**
 * Нэг асуултын хариултын задаргаа — хариулт бүрд тоо ба хувийн зурвас.
 * Хувийг БӨГЛӨСӨН судалгааны тооноос бодно (хоосон бүртгэл олон тул).
 */
function DistributionCard({
  title,
  options,
  total,
}: {
  title: string;
  options: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div className="ap-card p-4">
      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <div className="mt-3 space-y-2.5">
        {options.map((o) => {
          const pct = total > 0 ? Math.round((o.count / total) * 100) : 0;
          return (
            <div key={o.label}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-slate-500 dark:text-slate-400">{o.label}</span>
                <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                  {o.count.toLocaleString()}
                  <span className="ml-1 font-normal text-slate-400">{pct}%</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-[#252630]">
                <div className="h-1.5 rounded-full bg-[#02c0ce]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Тоон асуултын нийт тоо — 1 / 2 / 3+ задаргаагүй. */
function TotalCard({ title, total }: { title: string; total: number }) {
  return (
    <div className="ap-card p-4">
      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-3 text-2xl font-bold tabular-nums text-[#02c0ce]">{total.toLocaleString()}</p>
      <p className="text-[11px] text-slate-400">Нийт</p>
    </div>
  );
}

function SummaryCards({ summary }: { summary: ParcelSurveySummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {SURVEY_COUNT_QUESTIONS.map((q) => (
        <TotalCard key={q.field} title={q.title} total={surveyCountTotal(summary[q.summaryKey])} />
      ))}
      <DistributionCard
        title="Шилжин суурьшсан байршил"
        total={summary.answered}
        options={(Object.keys(RELOCATION_LABELS) as RelocationType[]).map((value) => ({
          label: RELOCATION_LABELS[value],
          count: summary.relocation_counts[value] ?? 0,
        }))}
      />
    </div>
  );
}

/** Мөр дээр дарахад нээгдэх бөглөх хэсэг — нэгж талбарын «Судалгаа» табтай ижил маягт. */
function SurveyModal({ row, canEdit, onClose }: { row: ParcelSurveyRow; canEdit: boolean; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 dark:border-white/[0.06] dark:bg-[#1e1f27]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-[#37394d]">
          <div className="min-w-0">
            <p className="font-mono text-[14px] font-semibold text-slate-800 dark:text-white">{row.parcel_code}</p>
            <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
              {row.acquisition_name || "—"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              prefetch={false}
              href={`/parcel/${row.parcel_id}?acq=${row.acquisition_id}&tab=survey`}
              onClick={notifyNavStart}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-500 transition-colors hover:border-[#02c0ce] hover:text-[#02c0ce] dark:border-white/[0.08] dark:text-slate-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Нэгж талбар
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#252630]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-4">
          <SurveyTab parcelId={row.parcel_id} canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}

/** `acquisitionId` өгвөл зөвхөн тэр чөлөөлөлтийн нэгж талбаруудын судалгаа. */
export function ParcelSurveyView({ acquisitionId: fixedAcquisitionId }: { acquisitionId?: string }) {
  const [page, setPage] = useState(1);
  const [draftCode, setDraftCode] = useState("");
  const [parcelCode, setParcelCode] = useState("");
  const [answered, setAnswered] = useState<AnsweredFilter>("");
  const [draftAcquisitionId, setDraftAcquisitionId] = useState("");
  const [selectedAcquisitionId, setAcquisitionId] = useState("");
  const acquisitionId = fixedAcquisitionId ?? selectedAcquisitionId;
  const colCount = fixedAcquisitionId ? 7 : 8;
  const [selected, setSelected] = useState<ParcelSurveyRow | null>(null);
  const canView = hasPermission("land:read");
  // Parcel detail-ийн «Судалгаа» табтай ижил дүрэм.
  const canEdit = !isExternalSpecialRole() && hasPermission("land:update");

  const { data: summary } = useQuery({
    queryKey: ["parcel-surveys", "summary", acquisitionId],
    queryFn: () => parcelSurveyApi.summary(acquisitionId ? { acquisition_ids: [acquisitionId] } : undefined),
    enabled: canView,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["parcel-surveys", "list", page, parcelCode, answered, acquisitionId],
    queryFn: () =>
      parcelSurveyApi.list({
        page,
        page_size: PAGE_SIZE,
        acquisition_id: acquisitionId || undefined,
        parcel_id: parcelCode || undefined,
        answered: answered === "" ? undefined : answered === "true",
      }),
    enabled: canView,
  });
  const totalPages = data?.total_pages ?? 1;

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
      {!fixedAcquisitionId && (
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Чөлөөлөгдсөн газрын судалгаа</h1>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            Нийт {summary?.total ?? 0} нэгж талбар · {summary?.answered ?? 0} бөглөсөн · Мөр дээр дарж бөглөнө
          </p>
        </div>
      )}

      {summary && <SummaryCards summary={summary} />}

      <form
        className="ap-card flex gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setParcelCode(draftCode.trim());
          if (!fixedAcquisitionId) setAcquisitionId(draftAcquisitionId);
          setPage(1);
        }}
      >
        {!fixedAcquisitionId && (
          <AcquisitionSelect
            selectedId={draftAcquisitionId}
            onSelect={(id) => setDraftAcquisitionId(id)}
            onClear={() => setDraftAcquisitionId("")}
            className="w-72"
          />
        )}
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            placeholder="Нэгж талбарын дугаар"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
          />
        </div>
        <select
          value={answered}
          onChange={(e) => {
            setAnswered(e.target.value as AnsweredFilter);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
        >
          <option value="">Бүгд</option>
          <option value="true">Бөглөсөн</option>
          <option value="false">Бөглөөгүй</option>
        </select>
        <SearchButton type="submit" />
        <RefreshButton />
      </form>

      <div className="ap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-400 dark:border-white/[0.06] dark:bg-[#252630]/60 dark:text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Нэгж талбар</th>
                {!fixedAcquisitionId && <th className="px-5 py-3 font-semibold">Чөлөөлөлт</th>}
                {SURVEY_COUNT_QUESTIONS.map((q) => (
                  <th key={q.field} className="px-5 py-3 font-semibold text-center">
                    {q.title}
                  </th>
                ))}
                <th className="px-5 py-3 font-semibold">Шилжин суурьшсан</th>
                <th className="px-5 py-3 font-semibold">Шинэчилсэн</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={colCount} className="px-5 py-3">
                      <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-[#252630]" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-10 text-center text-[13px] text-red-500">
                    Судалгааны жагсаалт авахад алдаа гарлаа.
                  </td>
                </tr>
              ) : !data?.data?.length ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-10 text-center text-[13px] text-slate-400">
                    <ClipboardList className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-[#37394d]" />
                    Судалгаа олдсонгүй
                  </td>
                </tr>
              ) : (
                data.data.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer text-[13px] text-slate-700 hover:bg-slate-50/60 dark:text-slate-200 dark:hover:bg-[#252630]/50"
                  >
                    <td className="px-5 py-3">
                      {/* prefetch=false — мөр бүрийн RSC prefetch browser-ийн 6 холболтыг дүүргэдэг */}
                      <Link
                        prefetch={false}
                        href={`/parcel/${row.parcel_id}?acq=${row.acquisition_id}&tab=survey`}
                        onClick={(e) => {
                          e.stopPropagation();
                          notifyNavStart(e);
                        }}
                        className="font-mono font-medium text-[#02c0ce] hover:underline"
                      >
                        {row.parcel_code}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-slate-400">{row.au3_code || "—"}</div>
                    </td>
                    {!fixedAcquisitionId && (
                      <td className="px-5 py-3 min-w-[220px] max-w-[320px] whitespace-normal break-words text-slate-600 dark:text-slate-300">
                        {row.acquisition_name || "—"}
                      </td>
                    )}
                    {SURVEY_COUNT_QUESTIONS.map((q) => (
                      <td key={q.field} className="px-5 py-3 text-center tabular-nums font-semibold">
                        {surveyCountLabel(row[q.field])}
                      </td>
                    ))}
                    <td className="px-5 py-3">
                      {(row.relocation_type && RELOCATION_LABELS[row.relocation_type]) || "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500 dark:text-slate-400">
                      {isSurveyAnswered(row) ? (
                        formatDate(row.updated_at)
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                          Бөглөөгүй
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(row);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#02c0ce] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#02a3af]"
                      >
                        {canEdit ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {canEdit ? "Бөглөх" : "Харах"}
                      </button>
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

      {selected && <SurveyModal row={selected} canEdit={canEdit} onClose={() => setSelected(null)} />}
    </div>
  );
}
