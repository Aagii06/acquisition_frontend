"use client";
import { FileText, X } from "lucide-react";

export type DecreeForm = { decree_number: string; decree_date: string; file: File | null };

export const emptyDecreeForm: DecreeForm = { decree_number: "", decree_date: "", file: null };

export function isDecreeFormValid(d: DecreeForm): boolean {
  return d.decree_number.trim() !== "" && d.file != null;
}

const MAX_PDF = 20 * 1024 * 1024;

export const inp =
  "h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";
export const lbl = "text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block";
export const section = "text-[13px] font-semibold text-slate-700 dark:text-white";

/**
 * Захирамж — НЭГ дугаар, НЭГ PDF файл. «Захирамж гарч чөлөөлсөн» төлөвт заавал.
 */
export function DecreeFields({
  value,
  onChange,
  onError,
}: {
  value: DecreeForm;
  onChange: (v: DecreeForm) => void;
  onError: (msg: string) => void;
}) {
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) return onError("Захирамжийн файл PDF байх ёстой");
    if (f.size > MAX_PDF) return onError("Захирамжийн файл 20MB-аас их байна");
    onChange({ ...value, file: f });
  };
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-4 dark:border-teal-400/20 dark:bg-teal-400/[0.04]">
      <p className={section}>Захирамж *</p>
      <p className="mb-3 mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">
        Захирамжийн дугаар болон хавсралт (PDF) заавал.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>Захирамжийн дугаар *</label>
          <input
            value={value.decree_number}
            onChange={(e) => onChange({ ...value, decree_number: e.target.value })}
            placeholder="А/123"
            className={inp}
          />
        </div>
        <div>
          <label className={lbl}>Захирамжийн огноо</label>
          <input
            type="date"
            value={value.decree_date}
            onChange={(e) => onChange({ ...value, decree_date: e.target.value })}
            className={inp}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className={lbl}>Захирамжийн хавсралт (PDF) *</label>
        {value.file ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] dark:border-[#37394d] dark:bg-[#1e1f27]">
            <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
              <FileText className="h-4 w-4 shrink-0 text-rose-500" />
              <span className="truncate">{value.file.name}</span>
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...value, file: null })}
              className="text-slate-400 hover:text-rose-500"
              aria-label="Файл хасах"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="block w-full text-[12px] text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[#02c0ce]/10 file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-[#02c0ce] hover:file:bg-[#02c0ce]/20"
          />
        )}
      </div>
    </div>
  );
}
