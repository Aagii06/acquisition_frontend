"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/lib/api";
import { ChevronDown, X } from "lucide-react";

type UserSelectProps = {
  selectedId: string;
  selectedLabel?: string;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-[#02c0ce]/20 px-0.5 font-semibold text-[#02c0ce]">
        {text.slice(idx, idx + query.trim().length)}
      </mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

export function UserSelect({
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  placeholder = "Хэрэглэгч хайх…",
  className,
  disabled,
}: UserSelectProps) {
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
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["user-select", debounced],
    queryFn: () => usersApi.list({ search: debounced.trim() || undefined, page_size: 40 }),
    enabled: open,
  });

  const results = data?.data ?? [];
  const select = (user: { id: string; first_name: string; last_name: string; position?: string }) => {
    const label = `${user.last_name} ${user.first_name}`;
    setQuery("");
    setDisplayLabel(label);
    onSelect(user.id, label);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div
        onClick={() => !disabled && setOpen(true)}
        className={`flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 transition-all focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] ${disabled ? "cursor-not-allowed opacity-60" : "cursor-text"}`}
      >
        {selectedId && !open ? (
          <span title={displayLabel} className="min-w-0 flex-1 truncate text-[13px] text-slate-800 dark:text-slate-200">
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
            className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none disabled:cursor-not-allowed dark:text-slate-200"
          />
        )}
        {selectedId ? (
          <button
            onClick={(e) => { e.stopPropagation(); setQuery(""); setDisplayLabel(""); onClear(); setOpen(false); }}
            disabled={disabled}
            className="shrink-0 text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-[#1e1f27]">
          <div className="max-h-56 overflow-y-auto">
            {isFetching ? (
              <div className="px-3 py-3 text-[12px] text-slate-400">Хайж байна…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400">Олдсонгүй</div>
            ) : (
              results.map((user) => (
                <button key={user.id} onMouseDown={(e) => { e.preventDefault(); select(user); }} className="w-full border-b border-slate-50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-slate-50 dark:border-[#252630] dark:hover:bg-[#252630]">
                  <span className="block text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    <Highlight text={`${user.last_name} ${user.first_name}`} query={query} />
                  </span>
                  {user.position && <span className="text-[11px] text-slate-400">{user.position}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
