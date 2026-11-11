"use client";

// ОЛОН ОН сонгох шүүлтүүр — жагсаалтын дэлгэцүүд (Чөлөөлөлт, Нэгж талбарын
// түүх, Тайлан, Хяналтын самбар) дээр НЭГ ижил байдлаар ажиллана.
//
// Яагаад нэг компонент: өмнө нь дэлгэц бүр өөрийн хувилбартай байсан —
// Чөлөөлөлт дээр ганц он (select), бусад дээр checkbox-той цэс, оны муж нь
// 2000 эсвэл 2019-өөс эхэлдэг байв. Шүүлтүүр нэг адил ажиллах ёстой тул
// сонголт ба оны муж ЭНД л тодорхойлогдоно.

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Сонгож болох оны муж: 2010-оос эхлээд ЭНЭ он хүртэл (буурахаар). */
export const YEAR_FROM = 2010;

export function yearOptions(from: number = YEAR_FROM): number[] {
  const current = new Date().getFullYear();
  const count = Math.max(0, current - from + 1);
  return Array.from({ length: count }, (_, i) => current - i);
}

export const YEAR_OPTIONS = yearOptions();

/** Сонгосон оноос товч шошго: "2024", "2024, 2023", "3 он". */
export function yearsLabel(years: number[]): string {
  if (years.length === 0) return "";
  if (years.length <= 2) return [...years].sort((a, b) => b - a).join(", ");
  return `${years.length} он`;
}

export function YearMultiSelect({
  value,
  onChange,
  placeholder = "Бүх он",
  className,
}: {
  value: number[];
  onChange: (years: number[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Гадна дарахад хаана (цэс нээлттэй үлдээд бусад шүүлтүүрийг халхлахгүй).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (year: number) => {
    onChange(
      value.includes(year) ? value.filter((y) => y !== year) : [...value, year].sort((a, b) => b - a),
    );
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-all",
          open ? "border-[#02c0ce] ring-2 ring-[#02c0ce]/15" : "border-slate-200 dark:border-white/[0.08]",
          "bg-white dark:bg-[#1e1f27]",
        )}
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span
          className={cn(
            "flex-1 truncate text-left",
            value.length === 0 ? "text-slate-400" : "text-slate-700 dark:text-white",
          )}
        >
          {value.length === 0 ? placeholder : yearsLabel(value)}
        </span>
        {value.length > 0 ? (
          <span
            role="button"
            tabIndex={-1}
            title="Цэвэрлэх"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="shrink-0"
          >
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <ul className="absolute z-50 mt-1 max-h-56 w-36 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-[#252630]">
          {YEAR_OPTIONS.map((year) => {
            const checked = value.includes(year);
            return (
              <li
                key={year}
                onClick={() => toggle(year)}
                className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-slate-50 dark:hover:bg-[#1e1f27]"
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                    checked ? "border-[#02c0ce] bg-[#02c0ce]" : "border-slate-300 dark:border-white/[0.2]",
                  )}
                >
                  {checked && (
                    <svg viewBox="0 0 10 8" fill="none" className="h-2 w-2">
                      <path
                        d="M1 4l2.5 2.5L9 1"
                        stroke="#fff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className={checked ? "font-semibold text-[#02c0ce]" : "text-slate-700 dark:text-slate-200"}>
                  {year}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
