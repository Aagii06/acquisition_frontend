"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { landReleaseApi } from "@/lib/api";
import { formatArea, getApiError } from "@/lib/utils";
import GeometryPreviewMap from "@/components/map/geometry-preview-map";
import {
  LAND_RELEASE_STATUS_COLORS,
  LAND_RELEASE_STATUS_LABELS,
  LAND_RELEASE_STATUS_PLANNING,
  LAND_RELEASE_STATUS_RELEASED,
} from "@/types";
import type { LandReleaseFeature } from "@/types";
import { DecreeFields, emptyDecreeForm, inp, isDecreeFormValid, lbl, section } from "./decree_fields";
import { StructureTypeSelect, type StructureTypeValue } from "./structure_type_select";
import { PhotoPicker } from "./photo_picker";
import { imagesToPdf } from "@/lib/images-to-pdf";

const ACCEPT = ".shp,.prj,.zip";
const MAX_FILE = 40 * 1024 * 1024;

/**
 * Буулгалт оруулах попап. Shapefile (.shp, .prj эсвэл .zip) нэг болон олныг
 * оруулна — сонгосон төлөв файлд буй БҮХ газарт өгөгдөнө. Файл сонгомогц
 * backend координатын системийг шалгаж, газруудыг зураг дээр харуулна.
 */
export function CreateLandReleaseDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (count: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(LAND_RELEASE_STATUS_PLANNING);
  const [files, setFiles] = useState<File[]>([]);
  const [decree, setDecree] = useState(emptyDecreeForm);
  // Зураг — заавал биш; хадгалахад нэг PDF болж бүх газарт холбогдоно.
  const [photos, setPhotos] = useState<File[]>([]);
  const [converting, setConverting] = useState(false);
  const [structureType, setStructureType] = useState<StructureTypeValue | null>(null);
  const typesQuery = useQuery({
    queryKey: ["land-release-structure-types"],
    queryFn: landReleaseApi.structureTypes,
  });

  const [features, setFeatures] = useState<LandReleaseFeature[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);

  // Файл өөрчлөгдөх бүрд шалгана (координатын систем, полигон).
  useEffect(() => {
    setFeatures([]);
    setPreviewError("");
    if (files.length === 0) return;
    let cancelled = false;
    setPreviewing(true);
    landReleaseApi
      .preview(files)
      .then((f) => !cancelled && setFeatures(f))
      .catch((e) => !cancelled && setPreviewError(getApiError(e, "Файлыг уншиж чадсангүй")))
      .finally(() => !cancelled && setPreviewing(false));
    return () => {
      cancelled = true;
    };
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const ext = f.name.toLowerCase().split(".").pop();
      if (!ext || !["shp", "prj", "zip"].includes(ext)) {
        toast.error(`${f.name}: зөвхөн .shp, .prj эсвэл .zip файл`);
        continue;
      }
      if (f.size > MAX_FILE) {
        toast.error(`${f.name}: файл 40MB-аас их байна`);
        continue;
      }
      // Ижил нэртэйг солино.
      const i = next.findIndex((o) => o.name === f.name);
      if (i >= 0) next[i] = f;
      else next.push(f);
    }
    setFiles(next);
  };

  const totalArea = useMemo(() => features.reduce((s, f) => s + (f.area_m2 || 0), 0), [features]);
  const byFile = useMemo(() => {
    const m = new Map<string, { count: number; area: number }>();
    features.forEach((f) => {
      const cur = m.get(f.source_file) ?? { count: 0, area: 0 };
      cur.count++;
      cur.area += f.area_m2 || 0;
      m.set(f.source_file, cur);
    });
    return Array.from(m.entries());
  }, [features]);

  const color = LAND_RELEASE_STATUS_COLORS[status];
  const geometries = useMemo(
    () =>
      features.map((f, i) => ({
        wkt: f.geometry_wkt,
        color,
        filled: true,
        width: 2,
        text: features.length <= 60 ? String(i + 1) : undefined,
        label: i === 0 ? "Оруулах газар" : undefined,
      })),
    [features, color],
  );

  const needsDecree = status === LAND_RELEASE_STATUS_RELEASED;
  const canSubmit =
    !saving &&
    !previewing &&
    name.trim() !== "" &&
    structureType != null &&
    features.length > 0 &&
    !previewError &&
    (!needsDecree || isDecreeFormValid(decree));

  const submit = async () => {
    if (!canSubmit || !structureType) return;
    setSaving(true);
    try {
      let photo: { file: File; pages: number } | null = null;
      if (photos.length > 0) {
        setConverting(true);
        try {
          photo = await imagesToPdf(photos, `Зураг - ${name.trim()}.pdf`);
        } finally {
          setConverting(false);
        }
      }
      const res = await landReleaseApi.create({
        name: name.trim(),
        description: description.trim(),
        status,
        files,
        structureType: "id" in structureType ? { id: structureType.id } : { name: structureType.name },
        decree: needsDecree && decree.file ? { ...decree, file: decree.file } : null,
        photo,
      });
      toast.success(`${res.created} газар бүртгэгдлээ`);
      onCreated(res.created);
    } catch (e) {
      toast.error(getApiError(e, "Хадгалж чадсангүй"));
    } finally {
      setSaving(false);
    }
  };

  const hint = !name.trim()
    ? "Нэр оруулна уу."
    : !structureType
      ? "Буулгасан байгууламжийн төрлийг сонгох эсвэл шинээр нэмнэ үү."
      : files.length === 0
      ? "Shapefile оруулна уу."
      : previewError
        ? "Файлын алдааг засна уу."
        : needsDecree && !isDecreeFormValid(decree)
          ? "Захирамжийн дугаар болон PDF файл заавал."
          : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-[#1e1f27]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-[#37394d]">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Буулгалт оруулах</h2>
            <p className="mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">
              Сонгосон төлөв файлд буй бүх газарт өгөгдөнө. Газар бүр системийн дугаартай бүртгэгдэнэ.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-40 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto px-6 py-5 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <label className={lbl}>Нэр *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Буулгалтын нэр" />
            </div>
            <div>
              <label className={lbl}>Буулгасан байгууламжийн төрөл *</label>
              <StructureTypeSelect
                types={typesQuery.data ?? []}
                loading={typesQuery.isLoading}
                value={structureType}
                onChange={setStructureType}
              />
            </div>
            <div>
              <label className={lbl}>Тайлбар</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inp} h-auto py-2`}
              />
            </div>

            <div>
              <p className={section}>Төлөв *</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[LAND_RELEASE_STATUS_PLANNING, LAND_RELEASE_STATUS_RELEASED].map((s) => (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors ${
                      status === s
                        ? "border-[#02c0ce] bg-[#02c0ce]/[0.07] text-slate-800 dark:text-white"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-[#37394d] dark:text-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="lr-status"
                      checked={status === s}
                      onChange={() => setStatus(s)}
                      className="accent-[#02c0ce]"
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAND_RELEASE_STATUS_COLORS[s] }} />
                    {LAND_RELEASE_STATUS_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>

            {needsDecree && (
              <DecreeFields value={decree} onChange={setDecree} onError={(m) => toast.error(m)} />
            )}

            <div>
              <p className={section}>Shapefile *</p>
              <p className="mb-2 mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">
                .shp (хамт .prj), эсвэл .zip — нэг болон олон. Координатын систем WGS84 (EPSG:4326) байх ёстой.
              </p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 px-4 py-5 text-center text-[12px] text-slate-500 transition-colors hover:border-[#02c0ce] dark:border-[#37394d] dark:text-slate-400">
                <FileUp className="h-5 w-5 text-[#02c0ce]" />
                Файл сонгох
                <input
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100 text-[12px] dark:divide-[#37394d] dark:border-[#37394d]">
                  {files.map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate text-slate-700 dark:text-slate-200">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((o) => o !== f))}
                        className="text-slate-400 hover:text-rose-500"
                        aria-label="Файл хасах"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className={section}>Зураг</p>
              <p className="mb-2 mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">
                Заавал биш. Оруулсан зургууд нэг PDF болж файлд буй бүх газарт хавсрагдана.
              </p>
              <PhotoPicker files={photos} onChange={setPhotos} onError={(m) => toast.error(m)} disabled={saving} />
            </div>
          </div>

          <div className="space-y-3">
            <p className={section}>Оруулах байршил</p>
            <GeometryPreviewMap
              geometries={geometries}
              height={340}
              emptyText={previewing ? "Файлыг шалгаж байна…" : "Shapefile оруулахад газрууд энд харагдана"}
            />
            {previewing && (
              <p className="flex items-center gap-2 text-[12px] text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Координатын систем, полигоныг шалгаж байна…
              </p>
            )}
            {previewError && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-600 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="whitespace-pre-wrap break-words">{previewError}</span>
              </div>
            )}
            {features.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-[12px] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                <p className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  {features.length} газар · нийт {formatArea(totalArea)} · WGS84
                </p>
                <ul className="mt-1.5 space-y-0.5 pl-6 text-slate-600 dark:text-slate-300">
                  {byFile.map(([file, v]) => (
                    <li key={file} className="flex justify-between gap-3">
                      <span className="truncate">{file}</span>
                      <span className="shrink-0 tabular-nums">
                        {v.count} газар · {formatArea(v.area)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 dark:border-[#37394d]">
          <p className="text-[12px] text-slate-400 dark:text-slate-500">{hint}</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 disabled:opacity-40 dark:border-[#37394d] dark:bg-[#1e1f27] dark:text-slate-300"
            >
              Болих
            </button>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-lg bg-[#02c0ce] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#02a3af] disabled:opacity-60"
            >
              {converting ? "Зургийг PDF болгож байна…" : saving ? "Хадгалж байна…" : features.length > 0 ? `${features.length} газар оруулах` : "Оруулах"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
