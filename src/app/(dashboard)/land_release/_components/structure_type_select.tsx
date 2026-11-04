"use client";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import type { LandReleaseStructureType } from "@/types";
import { inp } from "./decree_fields";

/** Сонгосон төрөл — байгаа (id) эсвэл шинэ (зөвхөн нэр, хадгалахад нэмэгдэнэ). */
export type StructureTypeValue = { id: number; name: string } | { name: string; isNew: true };

const norm = (s: string) => s.trim().toLocaleLowerCase("mn-MN");

/**
 * Буулгасан байгууламжийн төрөл — жагсаалтаас сонгоно. Олдохгүй бол бичсэн
 * нэрээ «шинэ төрөл» болгож сонгоод үргэлжлүүлнэ; шинэ төрөл нь ХАДГАЛАХ үед
 * (backend-д газруудтай нэг гүйлгээнд) нэмэгдэнэ.
 */
export function StructureTypeSelect({
  types,
  loading,
  value,
  onChange,
}: {
  types: LandReleaseStructureType[];
  loading?: boolean;
  value: StructureTypeValue | null;
  onChange: (v: StructureTypeValue | null) => void;
}) {
  const [term, setTerm] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = norm(term);
    return q ? types.filter((t) => norm(t.name).includes(q)) : types;
  }, [types, term]);
  const exact = types.find((t) => norm(t.name) === norm(term));
  const canAdd = term.trim() !== "" && !exact;

  const pick = (v: StructureTypeValue) => {
    onChange(v);
    setTerm(v.name);
    setOpen(false);
  };

  const onType = (text: string) => {
    setTerm(text);
    setOpen(true);
    // Яг таарвал байгаа төрлийг сонгоно; бусад үед сонголтыг цэвэрлэнэ.
    const hit = types.find((t) => norm(t.name) === norm(text));
    onChange(hit ? { id: hit.id, name: hit.name } : null);
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={term}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (exact) pick({ id: exact.id, name: exact.name });
            else if (canAdd) pick({ name: term.trim(), isNew: true });
          }}
          placeholder={loading ? "Уншиж байна…" : "Төрөл сонгох эсвэл бичих"}
          className={`${inp} pr-8`}
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>

      {value && "isNew" in value && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          «{value.name}» — шинэ төрөл, хадгалахад нэмэгдэнэ.
        </p>
      )}

      {open && (matches.length > 0 || canAdd) && (
        <ul
          // onMouseDown — input-ийн blur-аас өмнө сонголт бүртгэгдэнэ.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-[13px] shadow-lg dark:border-[#37394d] dark:bg-[#1e1f27]"
        >
          {matches.map((t) => {
            const selected = value != null && "id" in value && value.id === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => pick({ id: t.id, name: t.name })}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#252630]"
                >
                  <span className="truncate">{t.name}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#02c0ce]" />}
                </button>
              </li>
            );
          })}
          {canAdd && (
            <li className={matches.length > 0 ? "border-t border-slate-100 dark:border-[#37394d]" : ""}>
              <button
                type="button"
                onClick={() => pick({ name: term.trim(), isNew: true })}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-[#02c0ce] hover:bg-[#02c0ce]/[0.07]"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">«{term.trim()}» шинэ төрөл нэмэх</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
