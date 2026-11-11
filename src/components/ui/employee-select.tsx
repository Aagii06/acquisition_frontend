"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { employeeApi } from "@/lib/api";
import { ChevronDown, X } from "lucide-react";

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#02c0ce]/20 text-[#02c0ce] rounded px-0.5 not-italic font-semibold">
        {text.slice(idx, idx + query.trim().length)}
      </mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

interface EmployeeSelectProps {
  selectedId: string;
  selectedLabel?: string;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function EmployeeSelect({
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  placeholder = "Ажилтан хайх…",
  className,
  disabled,
}: EmployeeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [displayLabel, setDisplayLabel] = useState(selectedLabel ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedLabel !== undefined) setDisplayLabel(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["employee-select", debounced],
    queryFn: () => employeeApi.list({ search: debounced.trim() || undefined, page_size: 40 }),
    enabled: open,
  });

  const results = data?.data ?? [];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(employee: { id: string; person_name?: string; position_name?: string }) {
    const label = employee.person_name || employee.id;
    setQuery("");
    setDisplayLabel(label);
    onSelect(employee.id, label);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setQuery("");
    setDisplayLabel("");
    onClear();
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div
        onClick={() => !disabled && setOpen(true)}
        className={`flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-text"}`}
      >
        {selectedId && !open ? (
          <span
            title={displayLabel}
            className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 truncate"
          >
            {displayLabel}
          </span>
        ) : (
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            disabled={disabled}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            autoFocus={open}
            className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 bg-transparent outline-none disabled:cursor-not-allowed"
          />
        )}
        {selectedId ? (
          <button
            onClick={clear}
            disabled={disabled}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors disabled:cursor-not-allowed"
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
            {isFetching ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">Хайж байна…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">Олдсонгүй</div>
            ) : (
              results.map((employee) => (
                <button
                  key={employee.id}
                  onMouseDown={(e) => { e.preventDefault(); select(employee); }}
                  className="w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors border-b border-slate-50 dark:border-[#252630] last:border-0"
                >
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 block">
                    <Highlight text={employee.person_name || employee.id} query={query} />
                  </span>
                  {employee.position_name && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{employee.department_name ? `${employee.department_name} · ` : ""}{employee.position_name}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
