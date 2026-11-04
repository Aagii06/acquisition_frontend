"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { landReleaseApi } from "@/lib/api";
import { formatArea, formatDate } from "@/lib/utils";
import { hasPermission } from "@/lib/role-utils";
import { notifyNavStart } from "@/lib/blocking-loader-state";
import GeometryPreviewMap from "@/components/map/geometry-preview-map";
import {
  LAND_RELEASE_STATUS_COLORS,
  LAND_RELEASE_STATUS_LABELS,
  LAND_RELEASE_STATUS_PLANNING,
  landReleaseNo,
} from "@/types";
import { ChangeStatusDialog } from "./_components/change_status_dialog";
import { PhotoSection } from "./_components/photo_section";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-2 text-[13px]">
      <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
  );
}

export default function LandReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showStatus, setShowStatus] = useState(false);
  const canUpdate = hasPermission("land:update");

  const { data: r, isLoading, isError } = useQuery({
    queryKey: ["land-release", id],
    queryFn: () => landReleaseApi.get(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded bg-slate-100 dark:bg-[#252630]" />
        <div className="h-[420px] rounded-lg bg-slate-100 dark:bg-[#252630]" />
      </div>
    );
  }
  if (isError || !r) {
    return <p className="py-16 text-center text-[13px] text-slate-400">Газар олдсонгүй</p>;
  }

  const color = LAND_RELEASE_STATUS_COLORS[r.status] ?? "#64748b";
  const canChange = canUpdate && r.status === LAND_RELEASE_STATUS_PLANNING;

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/land_release"
            onClick={notifyNavStart}
            className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-[#02c0ce]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Буулгалтын мэдээлэл
          </Link>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            <span className="mr-2 font-mono">{landReleaseNo(r.release_no)}</span>
            {r.name}
          </h1>
        </div>
        {canChange && (
          <button
            onClick={() => setShowStatus(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#02c0ce] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#02a3af]"
          >
            <RefreshCw className="h-4 w-4" /> Төлөв солих
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="ap-card min-w-0 p-5">
          <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white">Байршил</p>
          <GeometryPreviewMap
            geometries={[{ wkt: r.geometry_wkt, color, filled: true, label: LAND_RELEASE_STATUS_LABELS[r.status] }]}
            height={460}
          />
        </div>

        <div className="space-y-5">
          <div className="ap-card p-5">
            <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-white">Ерөнхий мэдээлэл</p>
            <dl className="divide-y divide-slate-50 dark:divide-[#37394d]">
              <Row label="Системийн дугаар">
                <span className="font-mono">{landReleaseNo(r.release_no)}</span>
              </Row>
              <Row label="Нэр">{r.name}</Row>
              <Row label="Дүүрэг/сум">
                {r.au2_name ? `${r.au1_name ? `${r.au1_name} · ` : ""}${r.au2_name}` : "Сум/дүүрэгтэй давхцаагүй"}
              </Row>
              <Row label="Байгууламжийн төрөл">{r.structure_type_name || "—"}</Row>
              <Row label="Тайлбар">{r.description || "—"}</Row>
              <Row label="Төлөв">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  {LAND_RELEASE_STATUS_LABELS[r.status]}
                </span>
              </Row>
              <Row label="Талбай">{formatArea(r.area_m2)}</Row>
              <Row label="Эх файл">
                {r.source_file || "—"}
                {r.source_file ? ` · ${r.source_index}-р бичлэг` : ""}
              </Row>
              <Row label="Оруулсан">{formatDate(r.created_at)}</Row>
              <Row label="Шинэчилсэн">{formatDate(r.updated_at)}</Row>
            </dl>
          </div>

          <div className="ap-card p-5">
            <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-white">Захирамж</p>
            {r.decree ? (
              <dl className="divide-y divide-slate-50 dark:divide-[#37394d]">
                <Row label="Дугаар">
                  <span className="font-mono">{r.decree.decree_number}</span>
                </Row>
                <Row label="Огноо">{r.decree.decree_date ? formatDate(r.decree.decree_date) : "—"}</Row>
                <Row label="Хавсралт">
                  <a
                    href={r.decree.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#02c0ce] hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    {r.decree.file_name}
                  </a>
                </Row>
                <Row label="Холбогдсон газар">
                  {r.decree.release_count > 1 ? `${r.decree.release_count} газар (олноор оруулсан)` : "Зөвхөн энэ газар"}
                </Row>
              </dl>
            ) : (
              <p className="py-4 text-[13px] text-slate-400 dark:text-slate-500">Захирамж холбогдоогүй</p>
            )}
          </div>
        </div>
      </div>

      {/* Зураг — төлөвөөс үл хамааран нэмж болно (land:update) */}
      <PhotoSection
        release={r}
        canUpdate={canUpdate}
        onUpdated={(updated) => queryClient.setQueryData(["land-release", id], updated)}
      />

      <div className="ap-card p-5">
        <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white">Төлөвийн түүх</p>
        {!r.history?.length ? (
          <p className="text-[13px] text-slate-400">Түүх алга</p>
        ) : (
          <ol className="space-y-3">
            {r.history.map((h) => (
              <li key={h.id} className="flex gap-3 text-[13px]">
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: LAND_RELEASE_STATUS_COLORS[h.to_status] ?? "#64748b" }}
                />
                <div className="min-w-0">
                  <p className="text-slate-700 dark:text-slate-200">
                    {h.from_status ? `${LAND_RELEASE_STATUS_LABELS[h.from_status]} → ` : ""}
                    <span className="font-semibold">{LAND_RELEASE_STATUS_LABELS[h.to_status]}</span>
                    {h.decree_number && <span className="ml-2 font-mono text-[12px] text-slate-500">{h.decree_number}</span>}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(h.changed_at).toLocaleString("mn-MN")}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {showStatus && (
        <ChangeStatusDialog
          release={r}
          onClose={() => setShowStatus(false)}
          onChanged={(updated) => {
            setShowStatus(false);
            queryClient.setQueryData(["land-release", id], updated);
            queryClient.invalidateQueries({ queryKey: ["land-releases"] });
            queryClient.invalidateQueries({ queryKey: ["land-releases-stats"] });
            queryClient.invalidateQueries({ queryKey: ["land-releases-map"] });
          }}
        />
      )}
    </div>
  );
}
