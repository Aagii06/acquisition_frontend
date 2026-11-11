"use client";
import { useState, useRef, useEffect } from "react";
import { useAcquisitionOptions } from "@/hooks/use-acquisition-options";
import { X, ChevronDown } from "lucide-react";
import { Highlight } from "./highlight";

export function AcquisitionSelect({
  selectedId,
  onSelect,
  onClear,
  className,
}: {
  selectedId: string;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const { acquisitions } = useAcquisitionOptions();

  const selected = acquisitions.find((a) => a.id === selectedId);
  const displayLabel = selected?.acquisition_name ?? "";

  const filtered = query.trim()
    ? acquisitions.filter((acq) => {
        const q = query.trim().toLowerCase();
        return (
          (acq.acquisition_name ?? "").toLowerCase().includes(q) ||
          (acq.plan_code ?? "").toLowerCase().includes(q)
        );
      })
    : acquisitions;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(acq: { id: string; acquisition_name: string }) {
    setQuery("");
    onSelect(acq.id, acq.acquisition_name);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setQuery("");
    onClear();
    setOpen(false);
  }

  const hasValue = !!selectedId;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div
        className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 cursor-text focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all"
        onClick={() => setOpen(true)}
      >
        {hasValue && !open ? (
          <span
            title={displayLabel}
            className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 truncate"
          >
            {displayLabel}
          </span>
        ) : (
          <input
            type="text"
            placeholder="Чөлөөлөлтийн нэр"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            autoFocus={open}
            className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 bg-transparent outline-none"
          />
        )}
        {hasValue ? (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Олдсонгүй
              </div>
            ) : (
              filtered.map((acq) => (
                <button
                  type="button"
                  key={acq.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(acq);
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors border-b border-slate-50 dark:border-[#252630] last:border-0"
                >
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    {acq.acquisition_name ? (
                      <Highlight text={acq.acquisition_name} query={query} />
                    ) : (
                      "—"
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
