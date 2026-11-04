"use client";
import { useEffect, useMemo } from "react";
import { ImagePlus, X } from "lucide-react";

// Нэг удаад оруулах зургийн дээд тоо, нэг зургийн дээд хэмжээ (жижигрүүлэхээс өмнө).
export const MAX_PHOTOS = 40;
const MAX_PHOTO_SIZE = 25 * 1024 * 1024;

/**
 * Зураг сонгох — олон зураг, жижиг зургаар (thumbnail) урьдчилан харуулна.
 * Хадгалахад дуудагч `imagesToPdf`-ээр НЭГ PDF болгоно.
 */
export function PhotoPicker({
  files,
  onChange,
  onError,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) {
        onError(`${f.name}: зураг биш файл`);
        continue;
      }
      if (f.size > MAX_PHOTO_SIZE) {
        onError(`${f.name}: зураг 25MB-аас их байна`);
        continue;
      }
      if (next.length >= MAX_PHOTOS) {
        onError(`Нэг удаад ${MAX_PHOTOS} хүртэл зураг оруулна`);
        break;
      }
      next.push(f);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {files.map((f, i) => (
          <div
            key={`${f.name}-${i}`}
            className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-[#37394d] dark:bg-[#252630]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image дэмжихгүй */}
            <img src={urls[i]} alt={f.name} className="h-full w-full object-cover" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 rounded-full bg-black/55 p-0.5 text-white opacity-0 transition-opacity hover:bg-rose-600 group-hover:opacity-100"
              aria-label="Зураг хасах"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <label
          className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 text-[11px] text-slate-500 transition-colors hover:border-[#02c0ce] dark:border-[#37394d] dark:text-slate-400 ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <ImagePlus className="h-5 w-5 text-[#02c0ce]" />
          Зураг нэмэх
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {files.length} зураг · хадгалахад нэг PDF болж хадгалагдана (зураг бүр нэг хуудас)
        </p>
      )}
    </div>
  );
}
