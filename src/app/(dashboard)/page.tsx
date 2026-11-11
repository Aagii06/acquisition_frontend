"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { dashboardApi, landApi, usersApi } from "@/lib/api";
import { useDepartmentGeneralCategory } from "@/hooks/use-department-category";
import { profApi } from "@/lib/prof-api";
import { hasPermission, isExternalSpecialRole, isFinanceSpecialist, isMika, isProfessionalOrg, isSeniorSpecialist } from "@/lib/role-utils";
import { useChronosData } from "@/components/map/chronos/use-chronos";
import { ChronosTimeline } from "@/components/map/chronos/chronos-timeline";
import { overviewAt } from "@/lib/chronos-overview";
import { monthLabel } from "@/lib/chronos";
import { FinanceDashboard } from "@/components/dashboard/finance-dashboard";
import Link from "next/link";
import { cn, formatMoneyExact } from "@/lib/utils";
import { AbbrevAmount } from "@/components/ui/amount-hint";
import { YEAR_OPTIONS as SHARED_YEAR_OPTIONS } from "@/components/ui/year-multi-select";
import { getParcelStatusStyle } from "@/types";
import { StatusDot, StatusLabel } from "@/components/ui/status-label";
import { useParcelStatusColors } from "@/lib/use-parcel-status-style";
import type { ParcelStatus } from "@/types";
import { AcquisitionOverviewPanel } from "@/components/map/acquisition-overview-panel";
import { monthlyTimeline } from "@/lib/timeline-months";
import {
  Map as MapIcon,
  Layers,
  FileText,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Send,
  Search,
  X,
  ChevronDown,
  Calendar,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { ProgressBadge } from "@/components/ui/progress-badge";
import { authStorage } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { searchOnEnter } from "@/components/ui/search-on-enter";

// "Ажлын зураг" цонх — дотроо OpenLayers газрын зураг үүсгэдэг тул
// зөвхөн хэрэглэгч товч дархад л ачаална (ssr: false).
const PrintMapDialog = dynamic(() => import("@/components/map/print-map-dialog"), { ssr: false });

const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full animate-pulse bg-slate-100 dark:bg-[#252630]" />
  ),
});

/** Тогтвортой хоосон утга — `?? []` нь рендер бүрд шинэ массив үүсгэхээс сэргийлнэ. */
const EMPTY_STATUS_LIST: ParcelStatus[] = [];

// Оны сонголт — БҮХ дэлгэцэд нэг ижил муж (2010-оос хойш).
const YEAR_OPTIONS = SHARED_YEAR_OPTIONS;

/* ── Text highlighter ────────────────────────────────── */
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

/* ── Acquisition select ──────────────────────────────── */
function AcquisitionSelect({
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
  const [debounced, setDebounced] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const isProfOrg = isProfessionalOrg();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["acq-suggest", isProfOrg ? "prof" : "internal", debounced],
    queryFn: async () => {
      if (isProfOrg) {
        const res = await profApi.profListMyAcquisitions({
          acquisition_name: debounced,
          page: 1,
          page_size: 10,
        });
        return (res.data ?? []).map((a) => ({
          id: a.id,
          acquisition_name: a.acquisition_name,
          plan_code: a.plan_code,
        }));
      }
      return landApi.suggest(debounced);
    },
    enabled: debounced.trim().length > 0,
  });

  const results = data ?? [];

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
    setDisplayLabel(acq.acquisition_name);
    onSelect(acq.id, acq.acquisition_name);
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
        className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 cursor-text focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all"
        onClick={() => setOpen(true)}
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
            placeholder="Чөлөөлөлт сонгох…"
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
        {selectedId ? (
          <button
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
        <div className="absolute z-50 mt-1 w-full sm:w-80 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {!debounced.trim() ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Хайх үгээ бичнэ үү…
              </div>
            ) : isFetching ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Хайж байна…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Олдсонгүй
              </div>
            ) : (
              results.map((acq) => (
                <button
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
                  {acq.plan_code && (
                    <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                      {acq.plan_code}
                    </span>
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

/* ── Employee select ─────────────────────────────────── */
function EmployeeSelect({
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
  const [debounced, setDebounced] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["employee-suggest", debounced],
    queryFn: () => usersApi.list({ search: debounced.trim(), page_size: 30 }),
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

  function select(user: { id: string; first_name: string; last_name: string; position?: string }) {
    const label = `${user.last_name} ${user.first_name}`;
    setQuery("");
    setDisplayLabel(label);
    onSelect(user.id, label);
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
        className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 cursor-text focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all"
        onClick={() => setOpen(true)}
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
            placeholder="Ажилтан хайх…"
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
        {selectedId ? (
          <button
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
        <div className="absolute z-50 mt-1 w-full sm:w-72 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {isFetching ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Хайж байна…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Олдсонгүй
              </div>
            ) : (
              results.map((user) => (
                <button
                  key={user.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(user);
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors border-b border-slate-50 dark:border-[#252630] last:border-0"
                >
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 block">
                    <Highlight text={`${user.last_name} ${user.first_name}`} query={query} />
                  </span>
                  {user.position && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {user.position}
                    </span>
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

/* ── Plan select ─────────────────────────────────────── */
function PlanSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState(value);
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isProfOrg = isProfessionalOrg();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["plan-suggest", isProfOrg ? "prof" : "internal", debounced],
    queryFn: async () => {
      if (isProfOrg) {
        const res = await profApi.profListMyAcquisitions({
          plan_code: debounced,
          page: 1,
          page_size: 10,
        });
        return (res.data ?? []).map((a) => ({
          id: a.id,
          acquisition_name: a.acquisition_name,
          plan_code: a.plan_code,
        }));
      }
      return landApi.suggest(debounced);
    },
    enabled: debounced.trim().length > 0,
  });

  const plans = Array.from(
    new Map(
      (data ?? [])
        .filter((a) => a.plan_code)
        .map((a) => [a.plan_code, { plan_code: a.plan_code, name: a.acquisition_name ?? "" }]),
    ).values(),
  );

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [value]);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div
        className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 cursor-text focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all"
        onClick={() => setOpen(true)}
      >
        <input
          type="text"
          placeholder="Төлөвлөгөөний код…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange("");
          }}
          onFocus={() => setOpen(true)}
          className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 bg-transparent outline-none"
        />
        {value ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setQuery("");
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full sm:w-64 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {!debounced.trim() ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Хайх үгээ бичнэ үү…
              </div>
            ) : isFetching ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Хайж байна…
              </div>
            ) : plans.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Олдсонгүй
              </div>
            ) : (
              plans.map((p) => (
                <button
                  key={p.plan_code}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(p.plan_code);
                    setQuery(p.plan_code);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors border-b border-slate-50 dark:border-[#252630] last:border-0"
                >
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    <Highlight text={p.plan_code} query={query} />
                  </span>
                  {p.name && (
                    <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500 whitespace-normal break-words">
                      {p.name}
                    </span>
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

/* ── Year multi-select ───────────────────────────────── */
function YearMultiSelect({
  value,
  onChange,
  className,
}: {
  value: string[];
  onChange: (years: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function toggle(y: string) {
    onChange(value.includes(y) ? value.filter((v) => v !== y) : [...value, y]);
  }

  const label =
    value.length === 0
      ? "Он сонгох…"
      : value.length === 1
        ? `${value[0]} он`
        : `${value.length} он сонгосон`;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 text-left focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 text-[13px] text-slate-800 dark:text-slate-200 truncate">
          {label}
        </span>
        {value.length > 0 ? (
          <span
            role="button"
            aria-label="Clear"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onChange([]);
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full sm:w-44 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-1">
            {YEAR_OPTIONS.map((y) => {
              const ys = String(y);
              const checked = value.includes(ys);
              return (
                <button
                  key={y}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(ys);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors text-[13px]",
                    checked
                      ? "text-[#02c0ce] font-semibold"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#252630]",
                  )}
                >
                  <span
                    className={cn(
                      "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                      checked
                        ? "bg-[#02c0ce] border-[#02c0ce]"
                        : "border-slate-300 dark:border-white/20",
                    )}
                  >
                    {checked && (
                      <svg
                        viewBox="0 0 10 8"
                        className="h-2 w-2 text-white fill-current"
                      >
                        <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────── */
function Skel({ w = "w-12" }: { w?: string }) {
  return (
    <span className={`inline-block ${w} h-[1em] rounded bg-slate-200 dark:bg-white/10 animate-pulse align-middle`} />
  );
}

/* ── Custom horizontal bar ───────────────────────────── */
function HBar({
  label,
  value,
  maxVal,
  color,
  suffix = "",
}: {
  label: string;
  value: number;
  maxVal: number;
  color: string;
  suffix?: string;
}) {
  const pct = Math.max(3, (value / Math.max(maxVal, 1)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 text-right leading-tight whitespace-normal break-words"
        style={{ width: 86 }}
      >
        {label}
      </span>
      <div className="flex-1 h-[16px] rounded-sm overflow-hidden bg-slate-100 dark:bg-white/[0.05]">
        <div
          className="h-full rounded-sm transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0 text-right"
        style={{ width: 54 }}
      >
        {value.toLocaleString()}
        {suffix}
      </span>
    </div>
  );
}

const VALUATION_STATUS_LABELS: Record<string, string> = {
  draft: "Ноорог",
  submitted: "Илгээсэн",
  approved: "Баталгаажсан",
  returned: "Буцаагдсан",
  rejected: "Татгалзсан",
};

const VALUATION_TYPE_LABELS: Record<string, string> = {
  asset: "Хөрөнгийн үнэлгээ",
  independent: "Хөндлөнгийн үнэлгээ",
  mika: "МИКА үнэлгээ",
};

const VALUATION_STATUS_COLORS: Record<string, string> = {
  draft: "#64748b",
  submitted: "#f59e0b",
  approved: "#0acf97",
  returned: "#f1556c",
  rejected: "#94a3b8",
};

const VALUATION_TYPE_COLORS = ["#02c0ce", "#777edd", "#0acf97", "#f9bc0b", "#f1556c"];

const EXTERNAL_TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#334155",
  boxShadow: "0 8px 24px rgba(15,23,42,.12)",
};

function moneyShort(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} тэр`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} сая`;
  return value.toLocaleString();
}

function ExternalDashboard() {
  // Ажлын зураг бэлдэх чөлөөлөлт (null = цонх хаалттай)
  const [printAcq, setPrintAcq] = useState<{ id: string; name?: string } | null>(null);
  const isFinance = isFinanceSpecialist();
  const isMikaRole = isMika();
  const isProfOrgRole = isProfessionalOrg();
  const roleLabel = isFinance
    ? "Санхүүгийн хяналт"
    : isMikaRole
      ? "МИКА үнэлгээ"
      : "Үнэлгээ оруулах байгууллага";
  const listHref = isProfOrgRole ? "/my_acquisitions" : "/acquisition";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "external"],
    queryFn: () => dashboardApi.get(),
  });

  const acquisitions = data?.acquisitions ?? [];
  const statuses = data?.status_breakdown ?? [];
  const statusColors = useParcelStatusColors();
  const valuationStatuses = data?.valuation_statuses ?? [];
  const valuationTypes = data?.valuation_types ?? [];
  const totalCompensation = data?.total_compensation ?? 0;
  const statusCount = (status: string) =>
    valuationStatuses.find((s) => s.status === status)?.count ?? 0;
  const draftCount = statusCount("draft");
  const returnedCount = statusCount("returned");
  const submittedCount = statusCount("submitted");
  const approvedCount = statusCount("approved");
  const workToEditCount = draftCount + returnedCount;
  const statusTotal = valuationStatuses.reduce((sum, row) => sum + row.count, 0);
  const reviewCompletionPct = statusTotal > 0 ? Math.round((approvedCount / statusTotal) * 100) : 0;
  const actionAcquisitions = isFinance
    ? acquisitions.filter((land) => (land.parcel_count ?? 0) > 0)
    : acquisitions;
  const pageTitle = isFinance ? "Санхүүгийн хяналтын самбар" : "Үнэлгээний ажлын самбар";
  const pageHint = isFinance
    ? "Илгээсэн үнэлгээ, баталгаажуулалт, нөхөх олговорын хяналтын мэдээлэл"
    : "Өөрт хуваарилагдсан үнэлгээний ажил, илгээх явц, буцаагдсан засварын мэдээлэл";
  const queueTitle = isFinance ? "Хянах шаардлагатай чөлөөлөлтүүд" : "Ажиллах чөлөөлөлтүүд";
  const queueEmpty = isFinance ? "Хянах үнэлгээ олдсонгүй" : "Танд ажиллах үнэлгээ олдсонгүй";
  const primaryActionLabel = isFinance ? "Хянах" : "Ажиллах";
  const mainStatusTitle = isFinance ? "Хяналтын төлөв" : "Ажлын төлөв";
  const statusPanelTitle = isFinance ? "Баталгаажуулалтын явц" : "Илгээх явц";
  const compensationLabel = isFinance ? "Хянагдаж буй нөхөх олговор" : "Оруулсан нөхөх олговор";
  const cards = isFinance
    ? [
        { label: "Хянах үнэлгээ", value: submittedCount, icon: Clock3, color: "#f59e0b" },
        { label: "Баталгаажсан", value: approvedCount, icon: CheckCircle2, color: "#0acf97" },
        { label: "Буцаасан", value: returnedCount, icon: RotateCcw, color: "#f1556c" },
        { label: "Үнэлгээ хийх нэгж талбар", value: data?.total_parcels ?? 0, icon: Layers, color: "#777edd" },
      ]
    : [
        { label: "Ажиллах үнэлгээ", value: workToEditCount, icon: FileText, color: "#02c0ce" },
        { label: "Илгээсэн", value: submittedCount, icon: Send, color: "#f9bc0b" },
        { label: "Буцаагдсан", value: returnedCount, icon: RotateCcw, color: "#f1556c" },
        { label: "Баталгаажсан", value: approvedCount, icon: CheckCircle2, color: "#0acf97" },
      ];
  const focusStatuses = isFinance
    ? ["submitted", "approved", "returned"]
    : ["draft", "returned", "submitted", "approved"];
  const valuationStatusChart = focusStatuses.map((status) => ({
    status,
    name: VALUATION_STATUS_LABELS[status] ?? status,
    count: statusCount(status),
    color: VALUATION_STATUS_COLORS[status] ?? "#02c0ce",
  }));
  const valuationTypeChart = valuationTypes.map((type, index) => ({
    name: VALUATION_TYPE_LABELS[type.valuation_type] ?? type.valuation_type,
    count: type.count,
    amount: Math.round(type.amount / 1_000_000),
    rawAmount: type.amount,
    color: VALUATION_TYPE_COLORS[index % VALUATION_TYPE_COLORS.length],
  }));
  const parcelStatusChart = statuses.slice(0, 6).map((status) => ({
    name: status.name,
    count: status.count,
    color: getParcelStatusStyle(statusColors.get(status.status_id)).color,
  }));
  const hasValuationStatusChart = valuationStatusChart.some((status) => status.count > 0);
  const hasValuationTypeChart = valuationTypeChart.some((type) => type.count > 0 || type.amount > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{pageTitle}</h1>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {roleLabel} · {pageHint}
          </p>
        </div>
        <Link
          href={listHref}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 dark:border-[#37394d] px-3 text-[12px] font-semibold text-slate-600 dark:text-slate-300 hover:border-[#02c0ce] hover:text-[#02c0ce] transition-colors"
        >
          Жагсаалт харах
        </Link>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="ap-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-3xl font-black tabular-nums text-slate-800 dark:text-white">
                    {isLoading ? <Skel w="w-14" /> : card.value.toLocaleString()}
                  </p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ background: `${card.color}18` }}>
                  <Icon className="h-5 w-5" style={{ color: card.color }} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-stretch">
        <div className="ap-card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {isFinance ? "Үнэлгээний хяналтын график" : "Үнэлгээний ажлын график"}
              </p>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                {statusPanelTitle}
              </p>
            </div>
            <span className="rounded-md bg-slate-100 dark:bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
              {statusTotal.toLocaleString()} үнэлгээ
            </span>
          </div>
          {isLoading ? (
            <div className="h-[250px] rounded-lg bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
          ) : !hasValuationStatusChart ? (
            <p className="py-24 text-center text-[13px] text-slate-400">Үнэлгээний төлөв бүртгэгдээгүй</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-center">
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={valuationStatusChart.filter((status) => status.count > 0)}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={3}
                    >
                      {valuationStatusChart.filter((status) => status.count > 0).map((entry) => (
                        <Cell key={entry.status} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={EXTERNAL_TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {valuationStatusChart.map((status) => (
                  <div key={status.status} className="rounded-lg border border-slate-100 dark:border-[#37394d] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.color }} />
                        {status.name}
                      </span>
                      <span className="text-lg font-black tabular-nums text-slate-800 dark:text-white">
                        {status.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${statusTotal > 0 ? Math.round((status.count / statusTotal) * 100) : 0}%`,
                          background: status.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ap-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
            {compensationLabel}
          </p>
          <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] px-3 py-3 mb-4">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Нийт дүн</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-slate-800 dark:text-white">
              {isLoading ? (
                <Skel w="w-20" />
              ) : (
                <AbbrevAmount value={totalCompensation}>{`${moneyShort(totalCompensation)} ₮`}</AbbrevAmount>
              )}
            </p>
            {isFinance && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Баталгаажуулалт</span>
                  <span>{reviewCompletionPct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white dark:bg-[#252630] overflow-hidden">
                  <div className="h-full rounded-full bg-[#0acf97]" style={{ width: `${reviewCompletionPct}%` }} />
                </div>
              </div>
            )}
          </div>
          {isLoading ? (
            <div className="h-[160px] rounded-lg bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
          ) : !hasValuationTypeChart ? (
            <p className="py-10 text-center text-[12px] text-slate-400">Мэдээлэл олдсонгүй</p>
          ) : (
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valuationTypeChart} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={EXTERNAL_TOOLTIP_STYLE}
                    formatter={(value: unknown, name: unknown, item: { payload?: { rawAmount?: number } }) => [
                      `${Number(value ?? 0).toLocaleString()} сая (${formatMoneyExact(item?.payload?.rawAmount)})`,
                      String(name ?? ""),
                    ]}
                  />
                  <Bar dataKey="amount" name="Дүн (сая ₮)" radius={[5, 5, 0, 0]}>
                    {valuationTypeChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
        <div className="ap-card p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {mainStatusTitle}
            </p>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isLoading ? "…" : `${(data?.total_parcels ?? 0).toLocaleString()} нэгж талбар`}
            </span>
          </div>
          {isLoading ? (
            <div className="h-[220px] rounded-lg bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
          ) : parcelStatusChart.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-slate-400">Мэдээлэл олдсонгүй</p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parcelStatusChart} layout="vertical" margin={{ top: 0, right: 8, left: 10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={128}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip contentStyle={EXTERNAL_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Нэгж талбар" radius={[0, 6, 6, 0]}>
                    {parcelStatusChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-[#37394d] bg-white dark:bg-[#1e1f27] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#37394d]">
            <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
              {queueTitle}
            </p>
            <span className="text-[12px] text-slate-400">
              {isLoading ? "…" : `${acquisitions.length.toLocaleString()} бичлэг`}
            </span>
          </div>
        {isLoading ? (
          <div className="px-5 py-8 text-center text-[13px] text-slate-400">Ачааллаж байна...</div>
        ) : !actionAcquisitions.length ? (
          <div className="px-5 py-8 text-center text-[13px] text-slate-400">
            {queueEmpty}
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-[#2a2c38]">
            {actionAcquisitions.slice(0, 12).map((land) => (
              <div key={land.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">
                    <ProgressBadge
                      percent={land.progress_percent}
                      parcelCount={land.parcel_count}
                      finalCount={land.final_parcel_count}
                    />
                    <span className="min-w-0 whitespace-normal break-words">{land.acquisition_name || land.plan_code}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {land.plan_code} · {land.parcel_count ?? 0} нэгж талбар
                  </p>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPrintAcq({ id: land.id, name: land.acquisition_name || land.plan_code })}
                    title="Ажлын зураг бэлдэх"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#02c0ce]/10 hover:text-[#02c0ce]"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </button>
                  {/* prefetch=false — мөр бүрийн RSC prefetch browser-ийн 6 холболтыг дүүргэдэг */}
                  <Link
                    prefetch={false}
                    href={`/acquisition/${land.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#02c0ce]/10 text-[#02c0ce] hover:bg-[#02c0ce]/20 px-2.5 py-1 text-[11px] font-medium transition-colors"
                  >
                    {primaryActionLabel}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {printAcq && (
        <PrintMapDialog
          acquisitionId={printAcq.id}
          acquisitionName={printAcq.name}
          onClose={() => setPrintAcq(null)}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [roleReady, setRoleReady] = useState(false);
  const [isProfOrg, setIsProfOrg] = useState(false);
  const [isOtherExternal, setIsOtherExternal] = useState(false);
  // Санхүүгийн мэргэжилтэн — ТУСДАА самбар (зөвхөн мөнгөн дүн/тоо, график).
  const [isFinanceRole, setIsFinanceRole] = useState(false);
  // "Мэдээ татах" — ЗӨВХӨН ахлах мэргэжилтэнд. Энэ нь UI-ийн нуулт;
  // жинхэнэ хоригийг /api/report/gchh2 route нь `/users/me`-ээр шалгана.
  const [isSenior, setIsSenior] = useState(false);
  useEffect(() => {
    setIsProfOrg(isProfessionalOrg());
    setIsOtherExternal(isExternalSpecialRole() && !isProfessionalOrg());
    setIsFinanceRole(isFinanceSpecialist());
    setIsSenior(isSeniorSpecialist());
    setRoleReady(true);
  }, []);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const tickColor  = isDark ? "#8391a2" : "#94a3b8";
  const gridColor  = isDark ? "#37394d" : "#eef2f7";
  const tooltipStyle = {
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${isDark ? "#37394d" : "#e5e7eb"}`,
    background: isDark ? "#1e1f27" : "#fff",
    color: isDark ? "#aab8c5" : "#4c4c5c",
    boxShadow: "0 4px 20px rgba(0,0,0,.12)",
  };

  /* Input state — хэрэглэгч сонгож буй утга */
  const [inAcqId,        setInAcqId]        = useState("");
  const [inAcqName,      setInAcqName]      = useState("");
  const [inPlanCode,     setInPlanCode]     = useState("");
  const [inYears,        setInYears]        = useState<string[]>([]);
  const [inGenCatId,     setInGenCatId]     = useState(0);
  const [inSubCatId,     setInSubCatId]     = useState(0);
  const [inEmployeeId,   setInEmployeeId]   = useState("");
  const [inEmployeeName, setInEmployeeName] = useState("");
  const [inAu2Code,      setInAu2Code]      = useState("");
  // Ажлын зураг бэлдэх чөлөөлөлт (null = цонх хаалттай)
  const [printAcq, setPrintAcq] = useState<{ id: string; name?: string } | null>(null);

  const { data: dashGenCats = [] } = useQuery({
    queryKey: ["acquisition-categories"],
    queryFn: () => landApi.listCategories(),
    staleTime: Infinity,
    enabled: roleReady && !isProfOrg && !isOtherExternal,
  });
  // Сум/дүүрэг — чөлөөлөлт бүртгэгдсэн дүүргүүд (land_acquisition_au).
  const { data: dashDistricts = [] } = useQuery({
    queryKey: ["acquisition-districts"],
    queryFn: () => landApi.listDistricts(),
    staleTime: 5 * 60_000,
    enabled: roleReady && !isProfOrg && !isOtherExternal,
  });
  const { data: dashSubCats = [] } = useQuery({
    queryKey: ["acquisition-categories", inGenCatId],
    queryFn: () => landApi.listCategories(inGenCatId),
    enabled: roleReady && !isProfOrg && !isOtherExternal && !!inGenCatId,
    staleTime: Infinity,
  });

  /* Applied filter — хуудас нээгдэхэд одоогийн он автоматаар сонгогдоно */
  const [appliedFilter, setAppliedFilter] = useState({
    acqId: "", acqName: "", planCode: "", years: [] as string[], genCatId: 0, subCatId: 0,
    employeeId: "", employeeName: "", au2Code: "",
  });

  // Хэрэглэгчийн хэлтэст холбогдсон ерөнхий ангилал байвал АНХ нээхэд шууд
  // сонгогдож, самбар тэр ангиллаар шүүгдэнэ. Нэг л удаа — «Цэвэрлэх» дарвал
  // дахин сонгогдохгүй. Анхдагч тодорхой болтол самбарын өгөгдлийг татахгүй.
  const internalDash = roleReady && !isProfOrg && !isOtherExternal;
  const deptCat = useDepartmentGeneralCategory(internalDash);
  const [deptDefaultApplied, setDeptDefaultApplied] = useState(false);
  useEffect(() => {
    // Гадаад ролиудад анхдагч ангилал байхгүй — role тодормогц шууд «шийдэгдсэн».
    if (deptDefaultApplied || !roleReady || (internalDash && !deptCat.ready)) return;
    if (internalDash && deptCat.categoryId) {
      const genCatId = deptCat.categoryId;
      setInGenCatId((cur) => cur || genCatId);
      setAppliedFilter((f) => (f.genCatId ? f : { ...f, genCatId, subCatId: 0 }));
    }
    setDeptDefaultApplied(true);
  }, [roleReady, internalDash, deptCat.ready, deptCat.categoryId, deptDefaultApplied]);

  const handleView = () => {
    setAppliedFilter({ acqId: inAcqId, acqName: inAcqName, planCode: inPlanCode, years: inYears, genCatId: inGenCatId, subCatId: inSubCatId, employeeId: inEmployeeId, employeeName: inEmployeeName, au2Code: inAu2Code });
  };
  const handleReset = () => {
    setInAcqId(""); setInAcqName(""); setInPlanCode(""); setInYears([]); setInGenCatId(0); setInSubCatId(0); setInEmployeeId(""); setInEmployeeName(""); setInAu2Code("");
    setAppliedFilter({ acqId: "", acqName: "", planCode: "", years: [], genCatId: 0, subCatId: 0, employeeId: "", employeeName: "", au2Code: "" });
  };

  /* ── ГЧХ АЖЛЫН МЭДЭЭ (Excel) — ХЭРЭГЛЭСЭН шүүлтээр татна ──────────────
     appliedFilter-ийг ашиглана (inXxx биш): дашбоард дээр ХАРАГДАЖ байгаа
     мэдээлэлтэй ижил хүрээтэй байхын тулд. Токеныг header-ээр дамжуулна —
     URL query-д хэзээ ч тавихгүй (тэр нь логд алдагддаг). */
  const [dlBusy, setDlBusy] = useState(false);
  const handleDownloadGchh2 = useCallback(async () => {
    setDlBusy(true);
    try {
      const token = authStorage.getAccessToken() ?? "";
      const p = new URLSearchParams();
      if (appliedFilter.acqId) p.set("acquisition_id", appliedFilter.acqId);
      if (appliedFilter.acqName) p.set("acquisition_name", appliedFilter.acqName);
      if (appliedFilter.planCode) p.set("plan_code", appliedFilter.planCode);
      if (appliedFilter.genCatId) p.set("general_category_id", String(appliedFilter.genCatId));
      if (appliedFilter.subCatId) p.set("sub_category_id", String(appliedFilter.subCatId));
      if (appliedFilter.employeeId) p.set("assigned_user_id", appliedFilter.employeeId);
      if (appliedFilter.au2Code) p.set("au2_code", appliedFilter.au2Code);
      appliedFilter.years.forEach((y) => p.append("year", y));

      const res = await fetch(`/api/report/gchh2?${p.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}` } : {},
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        toast.error(msg?.error ?? "Мэдээ татахад алдаа гарлаа");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ГЧХ-2_АЖЛЫН_МЭДЭЭ_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Мэдээ татагдлаа");
    } catch (err) {
      toast.error("Мэдээ татахад алдаа гарлаа");
      logger.error("gchh2 download failed", { error: String(err) });
    } finally {
      setDlBusy(false);
    }
  }, [appliedFilter]);

  /* ── Dashboard API — mount хийхэд одоогийн оноор, "Харах" дарахад шүүлтүүрээр дуудна ── */
  const fetchDashboard = (f: typeof appliedFilter) => dashboardApi.get({
    acquisition_id:     f.acqId || undefined,
    plan_code:          f.planCode || undefined,
    years:              f.years.map(Number).filter(Boolean),
    general_category_id: f.genCatId || undefined,
    sub_category_id:    f.subCatId || undefined,
    assigned_user_id:   f.employeeId || undefined,
    au2_code:           f.au2Code || undefined,
  });
  const { data: dashDataRaw, isLoading } = useQuery({
    queryKey: ["dashboard", appliedFilter],
    queryFn: () => fetchDashboard(appliedFilter),
    enabled: roleReady && !isProfOrg && !isOtherExternal && deptDefaultApplied,
  });

  /* ── «Он цагийн зураг» — цагийн голоор сар сонгоход дашбоардын БҮХ тоо
     тухайн сарын байдлаар (Он цагийн зурагтай ижил тооцоо: overviewAt).
     null = одоогийн байдал. Шүүлт солигдоход цэвэрлэгдэнэ. ── */
  const [chronosAllowed, setChronosAllowed] = useState(false);
  useEffect(() => setChronosAllowed(!isExternalSpecialRole() && hasPermission("land:read")), []);
  const chronosIds = useMemo(() => dashDataRaw?.acquisitions.map((a) => a.id), [dashDataRaw?.acquisitions]);
  const chronos = useChronosData(chronosIds, chronosAllowed && !!dashDataRaw && !isProfOrg && !isOtherExternal);
  const [asOfIdx, setAsOfIdx] = useState<number | null>(null);
  useEffect(() => setAsOfIdx(null), [appliedFilter]);
  const asOfKey = asOfIdx !== null ? chronos.months[asOfIdx] ?? null : null;
  const dashData = useMemo(
    () => (asOfKey && chronos.data && dashDataRaw ? overviewAt(dashDataRaw, null, chronos.data, asOfKey).data : dashDataRaw),
    [asOfKey, chronos.data, dashDataRaw],
  );

  /* ── API-аас бэлэн утгуудыг авна — тооцоо frontend-д байхгүй ── */
  const filteredAcqs     = useMemo(() => dashData?.acquisitions ?? [], [dashData?.acquisitions]);
  // ЗААВАЛ мемолно: `?? []` нь рендер бүрд ШИНЭ массив үүсгэдэг тул доорх
  // өнгөний хүснэгт байнга дахин бодогдоно.
  const parcelStatusList = useMemo(
    () => dashData?.parcel_statuses ?? EMPTY_STATUS_LIST,
    [dashData?.parcel_statuses],
  );
  const totalParcels     = dashData?.total_parcels   ?? 0;
  const freedParcels     = dashData?.freed_parcels   ?? 0;
  const freedAreaHa      = (dashData?.freed_area_m2  ?? 0) / 10_000;
  const planAreaHa       = (dashData?.plan_area_m2   ?? 0) / 10_000;
  const decisions        = dashData?.decisions;
  const totalOrders      = decisions?.confirmed ?? dashData?.total_orders ?? 0;
  const compensation     = dashData?.compensation;
  const billion          = (v: number | undefined) => (v ?? 0) / 1_000_000_000;
  const totalCompensation = billion(compensation?.total ?? dashData?.total_compensation);

  /* Төлөвийн ӨНГӨ нь `parcel_status` бүртгэлээс. Дашбоардын хариунд
     бүртгэл аль хэдийн ирдэг тул НЭМЭЛТ дуудлага үүсэхгүй. Задаргааны
     мөрөнд өнгө байдаггүй тул id-гаар нь тааруулна. */
  const statusColorById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of parcelStatusList) if (s.color) m.set(s.id, s.color);
    return m;
  }, [parcelStatusList]);

  const STATUSES = useMemo(() => (dashData?.status_breakdown ?? []).map((s) => ({
    key:   `ps-${s.status_id}`,
    label: s.name,
    // Өнгө нь зөвхөн бүртгэлээс; өнгөгүй төлөв — саарал.
    color: getParcelStatusStyle(statusColorById.get(s.status_id)).color,
    count: s.count,
    area:  Math.round(s.area_m2),
  })), [dashData?.status_breakdown, statusColorById]);

  /* Цагийн график — сонгосон оны БҮХ сарыг гаргана (лог: timeline-months.ts).
     Тооцоо нь цэвэр функцэд байгаа тул тестээр хамгаалагдсан. */
  const TIMELINE = useMemo(
    () => monthlyTimeline(dashData?.timeline ?? [], appliedFilter.years.map(Number)),
    [dashData?.timeline, appliedFilter.years],
  );

  /* ── Чөлөөлөлтийн ГҮЙЦЭТГЭЛ ───────────────────────────────────────
     Гүйцэтгэл = эцсийн төлөвт шилжсэн нэгж талбар / нийт нэгж талбар.
     Чөлөөлөлт бүрийн хувийг backend бодож өгдөг (progress_percent); нийт
     гүйцэтгэлийг МӨРӨӨР дундажлахгүй, НЭГЖ ТАЛБАРААР жинлэнэ — 3 талбартай
     чөлөөлөлт 300 талбартайтай ижил жинтэй байх нь буруу дүр зураг өгнө. */
  const perf = useMemo(() => {
    // Чөлөөлөлт бүрийг ЯВЦААР нь 3 ангилна:
    //   бүрэн (100%) · дутуу (0-ээс их, 100-аас бага) · шинэ (0% — эхлээгүй)
    let full = 0;
    let partial = 0;
    let fresh = 0;
    for (const a of filteredAcqs) {
      const pct = (a.parcel_count ?? 0) > 0 ? (a.progress_percent ?? 0) : 0;
      if (pct >= 100) full++;
      else if (pct > 0) partial++;
      else fresh++;
    }
    const totalParcelsAll = filteredAcqs.reduce((sum, a) => sum + (a.parcel_count ?? 0), 0);
    const totalFinalAll = filteredAcqs.reduce((sum, a) => sum + (a.final_parcel_count ?? 0), 0);
    return {
      single: filteredAcqs.length === 1 ? filteredAcqs[0] : null,
      full,
      partial,
      fresh,
      percent: totalParcelsAll > 0 ? Math.round((totalFinalAll * 100) / totalParcelsAll) : 0,
    };
  }, [filteredAcqs]);

  const maxCount = STATUSES.length > 0 ? Math.max(...STATUSES.map((s) => s.count)) : 1;

  /* Газрын зургийг бүтэн дэлгэцээр харах үеийн зүүн талын хураангуй — дээрх
     dashData-г ашиглана; санхүүжилтийг ГАНЦ чөлөөлөлт сонгосон үед л татна
     (санхүүгийн API нь чөлөөлөлт/он/дүүргээр л шүүдэг). Эрхгүй бол нуугдана. */
  const overviewAcqId = perf.single?.id ?? "";
  const overviewYears = useMemo(() => appliedFilter.years.map(Number).filter(Boolean), [appliedFilter.years]);
  // Санхүүгийн API нь чөлөөлөлт/он/дүүргээр л шүүдэг — бусад шүүлт (ангилал,
  // ажилтан, төлөвлөгөө) хэрэглэсэн үед нийлбэр нь зөрөх тул татахгүй.
  const financeFilter = useMemo(
    () =>
      overviewAcqId
        ? { acquisition_id: overviewAcqId }
        : !appliedFilter.acqId && !appliedFilter.planCode && !appliedFilter.genCatId && !appliedFilter.subCatId && !appliedFilter.employeeId
          ? { years: overviewYears, au2_code: appliedFilter.au2Code || undefined }
          : null,
    [overviewAcqId, appliedFilter, overviewYears],
  );
  const { data: overviewFinance } = useQuery({
    queryKey: ["map-overview", "finance", financeFilter],
    queryFn: () => dashboardApi.finance(financeFilter!, { silent: true }),
    // Анхдагч (хэлтсийн) ангилал тодорхой болтол хүлээнэ — эс бөгөөс ангилалгүй
    // нийлбэрийг дэмий татна.
    enabled: !!financeFilter && deptDefaultApplied,
    retry: false,
  });
  // Сар сонгосон бол үнэлгээний бүтэц ч тухайн сарын байдлаар.
  const overviewFinanceView = useMemo(() => {
    const base = financeFilter ? overviewFinance ?? null : null;
    return asOfKey && chronos.data && dashDataRaw ? overviewAt(dashDataRaw, base, chronos.data, asOfKey).finance : base;
  }, [asOfKey, chronos.data, dashDataRaw, financeFilter, overviewFinance]);
  const chronosTimeline = (variant: "card" | "overlay") => (
    <ChronosTimeline months={chronos.months} counts={chronos.counts} value={asOfIdx} onChange={setAsOfIdx}
      loading={chronos.isLoading} variant={variant} />
  );
  // Нэг чөлөөлөлтийг ХАЙЖ олсон үед бүтэн дэлгэцийн самбар түүн дээр нээгдэх ч
  // ←-ээр «бүх чөлөөлөлт» рүү буцаж болно: тэр жагсаалт нь чөлөөлөлтийн хайлтгүй,
  // бусад шүүлт нь ижил хариу (хайлтгүй үеийн дашбоардтай ижил кэш түлхүүр).
  const acqSearched = !!(appliedFilter.acqId || appliedFilter.acqName || appliedFilter.planCode);
  const searchedAcqId = acqSearched ? perf.single?.id ?? null : null;
  const allFilter = useMemo(() => ({ ...appliedFilter, acqId: "", acqName: "", planCode: "" }), [appliedFilter]);
  const { data: allDashData, isLoading: allLoading } = useQuery({
    queryKey: ["dashboard", allFilter],
    queryFn: () => fetchDashboard(allFilter),
    enabled: !!searchedAcqId,
  });
  const allFinanceFilter = useMemo(
    () =>
      searchedAcqId && !appliedFilter.genCatId && !appliedFilter.subCatId && !appliedFilter.employeeId
        ? { years: overviewYears, au2_code: appliedFilter.au2Code || undefined }
        : null,
    [searchedAcqId, appliedFilter, overviewYears],
  );
  const { data: allFinance } = useQuery({
    queryKey: ["map-overview", "finance", allFinanceFilter],
    queryFn: () => dashboardApi.finance(allFinanceFilter!, { silent: true }),
    enabled: !!allFinanceFilter,
    retry: false,
  });
  // «Бүх» үеийн газрын зураг — commitMap-ийн дүрэмтэй ижил (шүүлтгүй бол бүх давхарга).
  const allMapIds = useMemo(() => {
    const hasF = !!(appliedFilter.years.length > 0 || appliedFilter.employeeId || appliedFilter.genCatId || appliedFilter.subCatId || appliedFilter.au2Code);
    if (!hasF) return undefined;
    const ids = allDashData?.acquisitions.map((a) => a.id) ?? [];
    return ids.length > 0 ? ids : ["__none__"];
  }, [appliedFilter, allDashData?.acquisitions]);

  // Бүтэн дэлгэцийн самбараас нэг чөлөөлөлт рүү орсон үед газрын зураг зөвхөн
  // түүнийг харуулна (бусад чөлөөлөлтийн давхарга нуугдана). Шүүлт солигдоход
  // зураг дахин үүсэх (самбар ч шинээр) тул энд ч цэвэрлэнэ. Хайж орсон үед
  // анхны утга нь тэр чөлөөлөлт; null = «бүх» рүү буцсан.
  const [focusAcqId, setFocusAcqId] = useState<string | null>(null);
  const focusAcqIds = useMemo(() => (focusAcqId ? [focusAcqId] : undefined), [focusAcqId]);
  // Самбарын толгойд он солиход: бусад шүүлт хэвээр, зөвхөн он өөр дашбоард/санхүү
  // (газрын зураг, дашбоардын шүүлт өөрчлөгдөхгүй). Санхүүгийн дүрэм нь дээрхтэй ижил.
  const panelRootYears = (base: typeof appliedFilter, financeById: string) => (years: number[]) => {
    const f = { ...base, years: years.map(String) };
    const financeArgs = financeById
      ? { acquisition_id: financeById }
      : !f.acqId && !f.planCode && !f.genCatId && !f.subCatId && !f.employeeId
        ? { years, au2_code: f.au2Code || undefined }
        : null;
    return {
      key: ["dashboard", f],
      data: () => fetchDashboard(f),
      financeKey: financeArgs ? ["map-overview", "finance", financeArgs] : null,
      finance: () => dashboardApi.finance(financeArgs!, { silent: true }),
    };
  };
  const showAllOnMap = !!searchedAcqId && !focusAcqId;
  const mapOverview = searchedAcqId ? (
    <AcquisitionOverviewPanel
      onSelectAcquisition={setFocusAcqId}
      initialSelectedId={searchedAcqId}
      data={allDashData}
      finance={allFinanceFilter ? allFinance ?? null : null}
      loading={allLoading}
      title={`Нийт ${allDashData?.acquisitions.length ?? 0} чөлөөлөлт`}
      years={overviewYears}
      showYears
      showSurvey
      surveyAll={!allMapIds}
      rootYears={panelRootYears(allFilter, "")}
    />
  ) : (
    <AcquisitionOverviewPanel
      onSelectAcquisition={setFocusAcqId}
      data={dashData}
      finance={overviewFinanceView}
      loading={isLoading}
      title={perf.single?.acquisition_name || appliedFilter.acqName || `Нийт ${filteredAcqs.length} чөлөөлөлт`}
      subtitle={perf.single?.plan_code}
      years={overviewYears}
      showYears
      showSurvey
      surveyAll={!acqSearched && !allMapIds}
      rootYears={panelRootYears(appliedFilter, overviewAcqId)}
    />
  );

  /* Map: API дуусахад л шинэчлэгдэх committed state */
  const [mapCommit, setMapCommit] = useState<{
    key: number;
    acqIds: string[] | undefined;
    years: number[] | undefined;
    au1Codes: string[] | undefined;
    au2Codes: string[] | undefined;
    au3Codes: string[] | undefined;
    employeeId: string | undefined;
  } | null>(null);
  const mapCommitKeyRef = useRef(0);

  // Газрын зургийн давхаргын шүүлт — сар сонголтоос ҮЛ хамаарна (түүхий хариу).
  const rawAcqs = useMemo(() => dashDataRaw?.acquisitions ?? [], [dashDataRaw?.acquisitions]);
  const commitMap = useCallback(() => {
    // Шүүлт хийгдсэн эсэх — АНГИЛЛЫГ ч тооцно. Өмнө нь зөвхөн чөлөөлөлт/
    // төлөвлөгөө/он/ажилтныг л шалгадаг байсан тул "он"-оо цэвэрлээд зөвхөн
    // ангилал сонгож "Харах" дарахад acqIds хоосон гарч, зураг нь шүүгдээгүй
    // бүх давхаргыг харуулаад олдсон хэсэг рүү зумладаггүй байв.
    const hasF = !!(
      appliedFilter.acqId ||
      appliedFilter.planCode ||
      appliedFilter.years.length > 0 ||
      appliedFilter.employeeId ||
      appliedFilter.genCatId ||
      appliedFilter.subCatId ||
      appliedFilter.au2Code
    );
    const acqIds = hasF
      ? (rawAcqs.length > 0 ? rawAcqs.map((a) => a.id) : ["__none__"])
      : undefined;

    const years = appliedFilter.years.length > 0 ? appliedFilter.years.map(Number) : undefined;

    const au1Codes = dashDataRaw?.filtered_au1_codes?.length ? dashDataRaw.filtered_au1_codes : undefined;
    const au2Codes = dashDataRaw?.filtered_au2_codes?.length ? dashDataRaw.filtered_au2_codes : undefined;
    const au3Codes = dashDataRaw?.filtered_au3_codes?.length ? dashDataRaw.filtered_au3_codes : undefined;

    const employeeId = appliedFilter.employeeId || undefined;

    // Нэг чөлөөлөлт хайж олсон бол самбар түүн дээр нээгдэнэ (газрын зураг ч зөвхөн түүнийг).
    const searched = appliedFilter.acqId || appliedFilter.acqName || appliedFilter.planCode;
    mapCommitKeyRef.current += 1;
    setFocusAcqId(searched && rawAcqs.length === 1 ? rawAcqs[0].id : null);
    setMapCommit({ key: mapCommitKeyRef.current, acqIds, years, au1Codes, au2Codes, au3Codes, employeeId });
  }, [appliedFilter, rawAcqs, dashDataRaw]);

  // Газрын зургийг дашбоардын ХАРИУ ӨӨРЧЛӨГДӨХ БҮРД шинэчилнэ. Өмнө нь зөвхөн
  // ачаалалт true→false шилжихэд шинэчилдэг байсан тул КЭШЛЭГДСЭН шүүлт рүү
  // (60с дотор дахин сонгоход) буцахад хариу шууд ирж, газрын зураг өмнөх
  // шүүлтээрээ (ж: бүх чөлөөлөлт) үлддэг байв.
  const committedDataRef = useRef<typeof dashDataRaw>(undefined);
  useEffect(() => {
    if (isLoading || !dashDataRaw || committedDataRef.current === dashDataRaw) return;
    committedDataRef.current = dashDataRaw;
    commitMap();
  }, [isLoading, dashDataRaw, commitMap]);

  /* Filter display label */
  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (appliedFilter.acqName)          parts.push(appliedFilter.acqName);
    if (appliedFilter.planCode)         parts.push(`Төлөвлөгөө: ${appliedFilter.planCode}`);
    if (appliedFilter.years.length > 0) parts.push(`${appliedFilter.years.join(", ")} он`);
    if (appliedFilter.employeeName)     parts.push(`Ажилтан: ${appliedFilter.employeeName}`);
    if (appliedFilter.au2Code) {
      const d = dashDistricts.find((x) => x.code === appliedFilter.au2Code);
      parts.push(`Дүүрэг: ${d?.name || appliedFilter.au2Code}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Бүх чөлөөлөлт";
  }, [appliedFilter, dashDistricts]);

  if (!roleReady) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 rounded bg-slate-100 dark:bg-[#252630] animate-pulse" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-100 dark:bg-[#252630] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (isFinanceRole) return <FinanceDashboard />;
  if (isProfOrg || isOtherExternal) return <ExternalDashboard />;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Filter card ───────────────────────────────── */}
      <div className="ap-card w-full px-4 py-3">
        {/* Талбарууд БҮТЭН ӨРГӨНИЙГ эзэлнэ (flex-1), товчнууд grid-ийн ГАДНА,
            хажууд бэхлэгдэнэ.
            ЯАГААД: өмнө нь товчнууд ч grid-ийн элемент байсан тул "Дэд ангилал"
            гарч ирэхэд 6 баганад 7 элемент болж товчнууд ганцаараа шинэ мөрт
            үсэрч, шүүлт дутуу/тасарсан харагддаг байв. */}
        <div className="flex flex-col xl:flex-row xl:items-end gap-3" {...searchOnEnter(handleView)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 items-end flex-1 min-w-0">
          {/* Acquisition select */}
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
              Чөлөөлөлт
            </label>
            <AcquisitionSelect
              selectedId={inAcqId}
              onSelect={(id, label) => { setInAcqId(id); setInAcqName(label); }}
              onClear={() => { setInAcqId(""); setInAcqName(""); }}
            />
          </div>

          {/* Plan code */}
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
              Төлөвлөгөө
            </label>
            <PlanSelect value={inPlanCode} onChange={setInPlanCode} />
          </div>

          {/* Year multi-select */}
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
              Он
            </label>
            <YearMultiSelect value={inYears} onChange={setInYears} />
          </div>

          {/* Employee select */}
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
              Хариуцсан ажилтан
            </label>
            <EmployeeSelect
              selectedId={inEmployeeId}
              onSelect={(id, label) => { setInEmployeeId(id); setInEmployeeName(label); }}
              onClear={() => { setInEmployeeId(""); setInEmployeeName(""); }}
            />
          </div>

          {/* Сум/дүүрэг — чөлөөлөлтийн хилээр тодорхойлогдсон (land_acquisition_au) */}
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
              Сум/дүүрэг
            </label>
            <select
              value={inAu2Code}
              onChange={(e) => setInAu2Code(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-700 dark:text-slate-200 outline-none focus:border-[#02c0ce] transition-all"
            >
              <option value="">Бүгд</option>
              {dashDistricts.map((d) => (
                <option key={d.code} value={d.code}>{d.name || d.code}</option>
              ))}
            </select>
          </div>

          {/* General category */}
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
              Ерөнхий ангилал
            </label>
            <select
              value={inGenCatId}
              onChange={(e) => {
                setInGenCatId(Number(e.target.value));
                setInSubCatId(0);
              }}
              className="h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-700 dark:text-slate-200 outline-none focus:border-[#02c0ce] transition-all"
            >
              <option value={0}>Бүгд</option>
              {dashGenCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Sub category */}
          {!!inGenCatId && (
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 pl-0.5">
                Дэд ангилал
              </label>
              <select
                value={inSubCatId}
                onChange={(e) => setInSubCatId(Number(e.target.value))}
                className="h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-700 dark:text-slate-200 outline-none focus:border-[#02c0ce] transition-all"
              >
                <option value={0}>Бүгд</option>
                {dashSubCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

        </div>

          {/* Action buttons — grid-ийн гадна, хажууд бэхлэгдсэн */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleView}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5 transition-all hover:opacity-90 active:scale-95"
              style={{ background: "#02c0ce" }}
            >
              <Search className="h-3.5 w-3.5" />
              Харах
            </button>
            <button
              onClick={handleReset}
              className="h-9 px-3 rounded-lg text-[13px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Title / active filter ──────────────────────── */}
      <div className="ap-card px-5 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-[3px] rounded-full shrink-0" style={{ background: "#02c0ce" }} />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 leading-snug truncate">
            {filterLabel}
            {asOfKey && (
              <span className="ml-2 rounded-full bg-[#F2A541]/15 px-2 py-0.5 normal-case tracking-normal text-[#c77a12] dark:text-[#FFD9A0]">
                {monthLabel(asOfKey)} байдлаар
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-4 border-l border-slate-100 dark:border-[#37394d] pl-4">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#02c0ce" }}>
              {filteredAcqs.length} чөлөөлөлт
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isLoading ? "…" : `${totalParcels} нэгж талбар`}
            </p>
          </div>
          {/* ГЧХ АЖЛЫН МЭДЭЭ — дээрх тоонуудтай ижил (хэрэглэсэн) шүүлтээр татна.
              Зөвхөн АХЛАХ МЭРГЭЖИЛТЭНД харагдана. */}
          {isSenior && (
            <button
              onClick={handleDownloadGchh2}
              disabled={dlBusy}
              title="ГЧХ АЖЛЫН МЭДЭЭ (Excel)"
              className="h-9 px-4 rounded-lg text-[13px] font-semibold text-white flex items-center gap-1.5 transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
              style={{ background: "#0f9ed5" }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {dlBusy ? "Татаж байна…" : "Мэдээ татах"}
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards — xl: 12 багана (хил 2, нэгж талбар 2, захирамж 3,
             олговор 5). Задаргаатай картууд задаргааг БАРУУН талд харуулна
             (карт доош сунгахгүй). ─────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-12 gap-4">
        {([
          {
            label: "ТӨЛӨВЛӨЛТИЙН ХИЛ",
            sub: "нийт талбай",
            value: isLoading ? null : `${planAreaHa.toFixed(1)} га`,
            color: "#02c0ce",
            icon: MapIcon,
            bg: "#02c0ce18",
            span: "xl:col-span-2",
          },
          {
            label: "НЭГЖ ТАЛБАР",
            sub: "нийт тоо",
            value: isLoading ? null : totalParcels,
            color: "#777edd",
            icon: Layers,
            bg: "#777edd18",
            span: "xl:col-span-2",
          },
          {
            label: "ЗАХИРАМЖ",
            sub: <><span className="font-semibold text-[#0acf97]">Баталгаажсан</span> · нийт {decisions?.total ?? 0}</>,
            // Баруун талын явцын нэрстэй ижил хэмжээтэй.
            subClass: "text-[11px] text-slate-500 dark:text-slate-400",
            value: isLoading ? null : totalOrders,
            color: "#f9bc0b",
            span: "col-span-2 xl:col-span-3",
            details: decisions ? [
              { label: "Баталгаажуулах", value: String(decisions.confirming), color: "#f9bc0b" },
              { label: "Хянагдаж буй", value: String(decisions.reviewing), color: "#777edd" },
              { label: "Төсөл", value: String(decisions.draft), color: "#94a3b8" },
            ] : undefined,
          },
          {
            label: "НИЙТ НӨХӨХ ОЛГОВОР",
            sub: "тэрбум ₮",
            value: isLoading ? null : (
              <AbbrevAmount value={compensation?.total ?? dashData?.total_compensation}>
                {`${totalCompensation.toFixed(2)} тэр`}
              </AbbrevAmount>
            ),
            color: "#0acf97",
            span: "col-span-2 xl:col-span-5",
            details: compensation ? [
              { label: "Захирамж гарсан", value: <AbbrevAmount value={compensation.issued}>{`${billion(compensation.issued).toFixed(2)} тэр`}</AbbrevAmount>, color: "#0acf97",
                pct: compensation.total ? (compensation.issued / compensation.total) * 100 : 0 },
              { label: "Төсөлд байгаа · үнэлгээ баталгаажсан", value: <AbbrevAmount value={compensation.approved}>{`${billion(compensation.approved).toFixed(2)} тэр`}</AbbrevAmount>, color: "#0f9ed5",
                pct: compensation.total ? (compensation.approved / compensation.total) * 100 : 0 },
              { label: "Үнэлгээ баталгаажаагүй", value: <AbbrevAmount value={compensation.unapproved}>{`${billion(compensation.unapproved).toFixed(2)} тэр`}</AbbrevAmount>, color: "#f9bc0b",
                pct: compensation.total ? (compensation.unapproved / compensation.total) * 100 : 0 },
            ] : undefined,
          },
        ] as {
          label: string; sub: React.ReactNode; subClass?: string; value: React.ReactNode; color: string; span: string;
          icon?: typeof MapIcon; bg?: string;
          details?: { label: string; value: React.ReactNode; color: string; pct?: number }[];
        }[]).map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`ap-card relative overflow-hidden p-5 ${s.span}`}>
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: s.color }} />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 leading-tight">
                    {s.label}
                  </p>
                  <div className="flex items-end gap-1.5 mt-2">
                    <span className="text-[26px] font-black tabular-nums leading-none text-slate-800 dark:text-white">
                      {s.value === null ? <Skel w="w-16" /> : s.value}
                    </span>
                  </div>
                  <p className={`mt-1 whitespace-nowrap ${s.subClass ?? "text-[10px] text-slate-400 dark:text-slate-500"}`}>{s.sub}</p>
                </div>
                {Icon && (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: s.bg }}>
                    <Icon className="h-5 w-5" style={{ color: s.color }} />
                  </div>
                )}
                {s.details && !isLoading && (
                  <ul className="min-w-0 flex-1 space-y-1 border-l border-slate-100 pl-4 dark:border-white/[0.06]">
                    {s.details.map((d) => (
                      <li key={d.label} className="text-[11px] leading-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                            <span className="min-w-0 whitespace-normal break-words">{d.label}</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-200">{d.value}</span>
                        </div>
                        {d.pct !== undefined && (
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, d.pct)}%`, background: d.color }} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Freed parcels row + гүйцэтгэлийн карт ─────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {[
          {
            label: "ЧӨЛӨӨЛӨГДСӨН НЭГЖ ТАЛБАР",
            sub: isLoading ? "…" : `${totalParcels} нийт нэгж талбараас`,
            value: isLoading ? null : freedParcels,
            pct: totalParcels > 0 ? Math.round((freedParcels / totalParcels) * 100) : 0,
            color: "#0acf97",
          },
          {
            label: "ЧӨЛӨӨЛӨГДСӨН ТАЛБАЙ",
            sub: isLoading ? "…" : `${planAreaHa.toFixed(1)} га нийт талбайгаас`,
            value: isLoading ? null : `${freedAreaHa.toFixed(1)} га`,
            pct: planAreaHa > 0 ? Math.round((freedAreaHa / planAreaHa) * 100) : 0,
            color: "#0acf97",
          },
        ].map((s) => (
          // Карт НАМ: тоо, явцын зураас, хувь нь нэг мөрөнд зэрэгцэнэ —
          // ингэснээр газрын зураг дээш татагдаж илүү өндөр талбай эзэлнэ.
          <div key={s.label} className="ap-card px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-normal break-words">
                {s.label}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-normal break-words">{s.sub}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <span className="text-[20px] font-black tabular-nums leading-none" style={{ color: s.color }}>
                {s.value === null ? <Skel w="w-14" /> : s.value}
              </span>
              <div className="h-1.5 w-16 rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
              </div>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: s.color }}>{s.pct}%</span>
            </div>
          </div>
        ))}

        {/* ── ЧӨЛӨӨЛӨЛТИЙН ГҮЙЦЭТГЭЛ ──────────────────────────────
            Ганц чөлөөлөлт олдвол — pie нь ЯВЦЫН хувь (дууссан/үлдсэн).
            Олон бол — pie нь чөлөөлөлтийн ТОО: бүрэн / дутуу / шинэ (0%).
            Хажуугийн том тоо нь хоёр тохиолдолд ч НИЙТ гүйцэтгэлийн хувь. */}
        <div
          className="ap-card flex items-center justify-between gap-3 px-4 py-2"
          // Гүйцэтгэл нь ЭЦСИЙН 3 төлөвийг (Нөлөөлөгдсөн гарсан · Татгалзсан ·
          // Чөлөөлсөн) тоолдог тул зэргэлдээх "чөлөөлөгдсөн" картуудаас
          // (зөвхөн «Чөлөөлсөн») ӨНДӨР гарч болно — ялгааг эндээс тайлбарлана.
          title="Эцсийн төлөвт (Нөлөөлөгдсөн гарсан · Татгалзсан · Чөлөөлсөн) шилжсэн нэгж талбарын хувь"
        >
          <div className="min-w-0">
            <p className="whitespace-normal break-words text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Чөлөөлөлтийн гүйцэтгэл
            </p>
            {isLoading ? (
              <p className="text-[10px] text-slate-400">…</p>
            ) : perf.single ? (
              <p className="whitespace-normal break-words text-[10px] text-slate-400 dark:text-slate-500">
                {perf.single.acquisition_name || perf.single.plan_code}
              </p>
            ) : (
              <p className="whitespace-normal break-words text-[10px] text-slate-400 dark:text-slate-500">
                <span className="font-bold text-[#0acf97]">{perf.full}</span> бүрэн ·{" "}
                <span className="font-bold text-[#f9bc0b]">{perf.partial}</span> дутуу ·{" "}
                <span className="font-bold text-[#94a3b8]">{perf.fresh}</span> шинэ
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            {/* Ганц чөлөөлөлт — явцын хувиар; олон бол чөлөөлөлтийн ТООГООР
                (бүрэн/дутуу/шинэ) — хоёуланг нь pie-гаар харуулна. */}
            <div className="h-[38px] w-[38px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      perf.single
                        ? [
                            { name: "Дууссан", value: perf.percent, color: "#0acf97" },
                            { name: "Үлдсэн", value: 100 - perf.percent, color: isDark ? "#37394d" : "#e2e8f0" },
                          ]
                        : [
                            { name: "Бүрэн", value: perf.full, color: "#0acf97" },
                            { name: "Дутуу", value: perf.partial, color: "#f9bc0b" },
                            { name: "Шинэ", value: perf.fresh, color: isDark ? "#4b5563" : "#cbd5e1" },
                          ]
                    }
                    dataKey="value"
                    nameKey="name"
                    innerRadius={11}
                    outerRadius={19}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    {(perf.single
                      ? ["#0acf97", isDark ? "#37394d" : "#e2e8f0"]
                      : ["#0acf97", "#f9bc0b", isDark ? "#4b5563" : "#cbd5e1"]
                    ).map((c) => (
                      <Cell key={c} fill={c} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <span className="text-[20px] font-black leading-none tabular-nums" style={{ color: "#0acf97" }}>
              {isLoading ? <Skel w="w-12" /> : `${perf.percent}%`}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3-column main ─────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_252px] gap-4 items-start">

        {/* LEFT: bar charts + legend */}
        <div className="flex flex-col gap-4">
          <div className="ap-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3.5">
              НЭГЖ ТАЛБАРЫН МЭДЭЭЛЭЛ
            </p>
            {STATUSES.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">—</p>
            ) : (
              <div className="space-y-2.5">
                {STATUSES.map((s) => (
                  <HBar key={s.key} label={s.label} value={s.count} maxVal={maxCount} color={s.color} />
                ))}
              </div>
            )}
          </div>

          <div className="ap-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3.5">
              НЭГЖ ТАЛБАРЫН ТАЛБАЙ /ГА/
            </p>
            {STATUSES.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">—</p>
            ) : (
              <div className="space-y-2.5">
                {STATUSES.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-normal break-words">
                      <StatusDot color={s.color} />
                      {s.label}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                      {(s.area / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })} га
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ap-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
              ТАЙЛБАР
            </p>
            <div className="space-y-2">
              {[...parcelStatusList]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((s) => (
                  // Өнгө нь БҮРТГЭЛЭЭС (`parcel_status.color`) — дашбоардын хариунд
                  // аль хэдийн ирдэг тул НЭМЭЛТ дуудлага үүсэхгүй.
                  <div key={s.id}>
                    <StatusLabel color={s.color} name={s.name} />
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* CENTER: map + timeline — min-w-0: урт цагийн гол баганыг дэлгэцээс өргөн сунгахгүй (дотроо гүйлгэнэ). */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Газрын зураг — дээрх картууд нам болсон тул өндрийг нэмэв */}
          <div className="ap-card overflow-hidden" style={{ height: 460 }}>
            {(!mapCommit || isLoading) ? (
              <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-[#252630] animate-pulse">
                <MapIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              </div>
            ) : (
              <MapView
                key={mapCommit.key}
                acquisitionIds={focusAcqIds ?? (showAllOnMap ? allMapIds : mapCommit.acqIds)}
                years={mapCommit.years}
                au1Codes={mapCommit.au1Codes}
                au2Codes={mapCommit.au2Codes}
                au3Codes={mapCommit.au3Codes}
                employeeId={mapCommit.employeeId}
                filterPending={false}
                fullscreenOverlay={mapOverview}
                chronos={chronosAllowed ? {
                  data: chronos.data,
                  months: chronos.months,
                  asOf: asOfIdx ?? Math.max(0, chronos.months.length - 1),
                  changed: chronos.counts.get(chronos.months[asOfIdx ?? chronos.months.length - 1] ?? "") ?? 0,
                  loading: chronos.isLoading,
                  acquisitions: filteredAcqs,
                  timeline: chronosTimeline("overlay"),
                } : undefined}
              />
            )}
          </div>

          {chronosAllowed ? (
            // Цаг хугацааны өөрчлөлт — сар сонгоход дээрх бүх тоо ба «Он цагийн зураг» шинэчлэгдэнэ.
            <div className="ap-card p-4">{chronosTimeline("card")}</div>
          ) : (
          <div className="ap-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
              БАТАЛГААЖСАН ОГНООГООР НЭГЖ ТАЛБАР · САРААР
            </p>
            {TIMELINE.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 py-4 text-center">
                Огноон мэдээлэл байхгүй
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={168}>
                <AreaChart data={TIMELINE} margin={{ top: 10, bottom: 0, left: -10, right: 8 }}>
                  <defs>
                    <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#02c0ce" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#02c0ce" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: tickColor }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: tickColor }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="count" name="Нэгж талбар" stroke="#02c0ce" strokeWidth={2} fill="url(#tlGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          )}
        </div>

        {/* RIGHT: acquisition list */}
        <div className="ap-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
            ЧӨЛӨӨЛӨЛТҮҮД
          </p>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-white/[0.05] animate-pulse" />
              ))}
            </div>
          ) : filteredAcqs.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 py-4 text-center">
              Олдсонгүй
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
              {filteredAcqs.map((acq) => {
                const style = { 1: "#02c0ce", 2: "#f59e0b", 3: "#0acf97", 4: "#f1556c" } as Record<number, string>;
                const dotColor = style[acq.status] ?? "#94a3b8";
                return (
                  <div
                    key={acq.id}
                    className="group flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dotColor }}
                    />
                    <div className="min-w-0">
                      {/* Явцын хувь — нэрийн ӨМНӨ */}
                      <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-200 leading-tight">
                        <ProgressBadge
                          percent={acq.progress_percent}
                          parcelCount={acq.parcel_count}
                          finalCount={acq.final_parcel_count}
                        />
                        <span className="min-w-0 whitespace-normal break-words">{acq.acquisition_name || "—"}</span>
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {acq.plan_code} · {acq.parcel_count ?? 0} нэгж талбар
                      </p>
                    </div>
                    {/* АЖЛЫН ЗУРАГ — байршил таб руу очиж хэвлэх цонхыг
                        ӨӨРӨӨ нээнэ (?print=1). Зураг нь тухайн чөлөөлөлтийн
                        давхаргууд бүрэн ачаалагдсаны дараа бэлдэгдэнэ. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrintAcq({ id: acq.id, name: acq.acquisition_name || acq.plan_code });
                      }}
                      title="Ажлын зураг бэлдэх"
                      className="ml-auto mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-[#02c0ce]/10 hover:text-[#02c0ce]"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {printAcq && (
        <PrintMapDialog
          acquisitionId={printAcq.id}
          acquisitionName={printAcq.name}
          onClose={() => setPrintAcq(null)}
        />
      )}
    </div>
  );
}
