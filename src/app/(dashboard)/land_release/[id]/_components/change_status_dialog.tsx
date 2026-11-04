"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { landReleaseApi } from "@/lib/api";
import { getApiError } from "@/lib/utils";
import {
  LAND_RELEASE_STATUS_CANCELLED,
  LAND_RELEASE_STATUS_COLORS,
  LAND_RELEASE_STATUS_LABELS,
  LAND_RELEASE_STATUS_RELEASED,
  landReleaseNo,
} from "@/types";
import type { LandRelease } from "@/types";
import { DecreeFields, emptyDecreeForm, inp, isDecreeFormValid, lbl, section } from "../../_components/decree_fields";

/**
 * Төлөв солих — «Төлөвлөж байгаа»-аас «Захирамж гарч чөлөөлсөн» (захирамж
 * заавал, энэ газарт ТУСДАА хадгалагдана) эсвэл «Хүчингүй» болгоно.
 */
export function ChangeStatusDialog({
  release,
  onClose,
  onChanged,
}: {
  release: LandRelease;
  onClose: () => void;
  onChanged: (r: LandRelease) => void;
}) {
  const [status, setStatus] = useState(LAND_RELEASE_STATUS_RELEASED);
  const [note, setNote] = useState("");
  const [decree, setDecree] = useState(emptyDecreeForm);
  const [saving, setSaving] = useState(false);

  const needsDecree = status === LAND_RELEASE_STATUS_RELEASED;
  const canSubmit = !saving && (!needsDecree || isDecreeFormValid(decree));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const updated = await landReleaseApi.changeStatus(release.id, {
        status,
        note: note.trim(),
        decree: needsDecree && decree.file ? { ...decree, file: decree.file } : null,
      });
      toast.success(`Төлөв «${LAND_RELEASE_STATUS_LABELS[status]}» боллоо`);
      onChanged(updated);
    } catch (e) {
      toast.error(getApiError(e, "Төлөв сольж чадсангүй"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-[#1e1f27]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-[#37394d]">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Төлөв солих</h2>
            <p className="mt-0.5 text-[12px] text-slate-400 dark:text-slate-500">
              {landReleaseNo(release.release_no)} · {release.name}
            </p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-slate-400 hover:text-slate-600 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <p className={section}>Шинэ төлөв</p>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {[LAND_RELEASE_STATUS_RELEASED, LAND_RELEASE_STATUS_CANCELLED].map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-colors ${
                    status === s
                      ? "border-[#02c0ce] bg-[#02c0ce]/[0.07] text-slate-800 dark:text-white"
                      : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-[#37394d] dark:text-slate-300"
                  }`}
                >
                  <input type="radio" checked={status === s} onChange={() => setStatus(s)} className="accent-[#02c0ce]" />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: LAND_RELEASE_STATUS_COLORS[s] }} />
                  {LAND_RELEASE_STATUS_LABELS[s]}
                </label>
              ))}
            </div>
          </div>

          {needsDecree && <DecreeFields value={decree} onChange={setDecree} onError={(m) => toast.error(m)} />}

          <div>
            <label className={lbl}>Тайлбар</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inp} h-auto py-2`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-[#37394d]">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:border-slate-300 disabled:opacity-40 dark:border-[#37394d] dark:bg-[#1e1f27] dark:text-slate-300"
          >
            Болих
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-lg bg-[#02c0ce] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#02a3af] disabled:opacity-60"
          >
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </button>
        </div>
      </div>
    </div>
  );
}
