"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { landReleaseApi } from "@/lib/api";
import { extractPdfJpegs } from "@/lib/pdf-images";
import { imagesToPdf } from "@/lib/images-to-pdf";
import { formatDate, getApiError } from "@/lib/utils";
import type { LandRelease, LandReleasePhoto } from "@/types";
import { landReleaseNo } from "@/types";
import { PhotoPicker } from "../../_components/photo_picker";

/** PDF-ээс (зураг бүр JPEG хуудас) зургуудыг задлаад blob URL болгоно. */
function usePhotoImages(photo: LandReleasePhoto) {
  const query = useQuery({
    queryKey: ["land-release-photo-images", photo.id],
    queryFn: async () => {
      const res = await fetch(photo.file_url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Зургийг татаж чадсангүй (${res.status})`);
      return extractPdfJpegs(await res.arrayBuffer());
    },
    staleTime: Infinity,
  });
  const urls = useMemo(
    () => (query.data ?? []).map((b) => URL.createObjectURL(new Blob([new Uint8Array(b)], { type: "image/jpeg" }))),
    [query.data],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return { urls, isLoading: query.isLoading, isError: query.isError };
}

function PhotoGroup({ photo, onOpen }: { photo: LandReleasePhoto; onOpen: (urls: string[], i: number) => void }) {
  const { urls, isLoading, isError } = usePhotoImages(photo);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <p className="text-slate-500 dark:text-slate-400">
          {formatDate(photo.created_at)} · {photo.page_count || urls.length} зураг
          {photo.release_count > 1 && (
            <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-[#252630] dark:text-slate-400">
              олноор оруулсан · {photo.release_count} газарт
            </span>
          )}
        </p>
        <a
          href={photo.file_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[#02c0ce] hover:underline"
        >
          <FileText className="h-3.5 w-3.5" /> PDF
        </a>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[...Array(Math.min(photo.page_count || 4, 8))].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.05]" />
          ))}
        </div>
      ) : isError || urls.length === 0 ? (
        // Зураг задлагдаагүй (өөр хэлбэрийн PDF) — PDF-ийг өөрийг нь харуулна.
        <iframe src={photo.file_url} title={photo.file_name} className="h-80 w-full rounded-lg border border-slate-200 dark:border-[#37394d]" />
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {urls.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => onOpen(urls, i)}
              className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition hover:ring-2 hover:ring-[#02c0ce] dark:border-[#37394d] dark:bg-[#252630]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL */}
              <img src={u} alt={`Зураг ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Lightbox({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const prev = () => setI((v) => (v - 1 + urls.length) % urls.length);
  const next = () => setI((v) => (v + 1) % urls.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setI((v) => (v - 1 + urls.length) % urls.length);
      if (e.key === "ArrowRight") setI((v) => (v + 1) % urls.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, urls.length]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL */}
      <img
        src={urls[i]}
        alt={`Зураг ${i + 1}`}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Хаах">
        <X className="h-5 w-5" />
      </button>
      {urls.length > 1 && (
        <>
          <button
            onClick={(e) => (e.stopPropagation(), prev())}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Өмнөх"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => (e.stopPropagation(), next())}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Дараах"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[13px] text-white/80">
            {i + 1} / {urls.length}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Газрын зураг — оруулсан зургийг (PDF-ээс задалж) харах ба шинээр нэмэх.
 * Нэмсэн зургууд нэг PDF болж зөвхөн энэ газарт хавсрагдана.
 */
export function PhotoSection({
  release,
  canUpdate,
  onUpdated,
}: {
  release: LandRelease;
  canUpdate: boolean;
  onUpdated: (r: LandRelease) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);
  const photos = release.photos ?? [];
  const total = photos.reduce((s, p) => s + (p.page_count || 0), 0);

  const save = async () => {
    if (files.length === 0) return;
    setSaving(true);
    try {
      const photo = await imagesToPdf(files, `Зураг - ${landReleaseNo(release.release_no)}.pdf`);
      const updated = await landReleaseApi.addPhoto(release.id, photo);
      toast.success(`${files.length} зураг нэмэгдлээ`);
      setFiles([]);
      setAdding(false);
      onUpdated(updated);
    } catch (e) {
      toast.error(e instanceof Error && !("isAxiosError" in e) ? e.message : getApiError(e, "Зураг хадгалж чадсангүй"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ap-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-slate-700 dark:text-white">
          Зураг{total > 0 && <span className="ml-1.5 font-normal text-slate-400">({total})</span>}
        </p>
        {canUpdate && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#02c0ce]/10 px-3 py-1.5 text-[12px] font-medium text-[#02c0ce] hover:bg-[#02c0ce]/20"
          >
            <ImagePlus className="h-4 w-4" /> Зураг нэмэх
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-5 rounded-lg border border-slate-100 p-3 dark:border-[#37394d]">
          <PhotoPicker files={files} onChange={setFiles} onError={(m) => toast.error(m)} disabled={saving} />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setFiles([]);
                setAdding(false);
              }}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 disabled:opacity-40 dark:border-[#37394d] dark:text-slate-300"
            >
              Болих
            </button>
            <button
              onClick={save}
              disabled={saving || files.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#02c0ce] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#02a3af] disabled:opacity-60"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "PDF болгож хадгалж байна…" : `${files.length} зураг хадгалах`}
            </button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-slate-400 dark:text-slate-500">Зураг оруулаагүй</p>
      ) : (
        <div className="space-y-5">
          {photos.map((p) => (
            <PhotoGroup key={p.id} photo={p} onOpen={(urls, index) => setViewer({ urls, index })} />
          ))}
        </div>
      )}

      {viewer && <Lightbox urls={viewer.urls} index={viewer.index} onClose={() => setViewer(null)} />}
    </div>
  );
}
