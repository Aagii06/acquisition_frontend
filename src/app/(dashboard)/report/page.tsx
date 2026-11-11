"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportApi, landApi } from "@/lib/api";
import {
  useAcquisitionOptions,
  useAcquisitionPlanOptions,
} from "@/hooks/use-acquisition-options";
import { authStorage } from "@/lib/auth";
import { RIGHT_TYPE_LABELS } from "@/types";
import type { ReportParcelRow } from "@/types";
import {
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Calendar,
  FileText,
  MapPinned,
  Banknote,
  ListChecks,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { useParcelStatusStyle } from "@/lib/use-parcel-status-style";
import { YEAR_OPTIONS as SHARED_YEAR_OPTIONS } from "@/components/ui/year-multi-select";
import { AbbrevAmount, AmountHint } from "@/components/ui/amount-hint";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import {
  SortButton,
  ariaSort,
  nextSortState,
  type SortState,
} from "@/components/ui/sortable-table-head";

// Тайлангийн хүснэгтийн толгойг татаж буй Excel тайлангийн (report_template.xlsx)
// толгойтой яг ижилхэн байлгана — эх сурвалж: тухайн xlsx-ийн B2:S3 нүднүүд.
// sortKey — backend-ийн reportParcelSortColumns-ийн түлхүүр (байхгүй бол
// тухайн багана эрэмбэлэгдэхгүй; бүлгийн толгой ч мөн адил).
const REPORT_TABLE_GROUP_HEADERS: { label: string; colSpan?: number; rowSpan?: number; sortKey?: string }[] = [
  { label: "№", rowSpan: 2 },
  { label: "Бүтээн байгуулалтын төрөл", rowSpan: 2, sortKey: "construction_type" },
  { label: "Бүтээн байгуулалтын ажлын нэр", rowSpan: 2, sortKey: "acquisition_name" },
  { label: "Нөхөх олговор олгосон НЗД-ын захирамжийн огноо дугаар", rowSpan: 2, sortKey: "decree_date" },
  { label: "Газар өмчлөгч, эзэмшигчийн нэр, регистрийн дугаар", rowSpan: 2, sortKey: "holder" },
  { label: "Хаяг", rowSpan: 2 },
  { label: "Нэгж талбарын дугаар", rowSpan: 2, sortKey: "parcel_id" },
  { label: "Үндсэн талбайн хэмжээ /м2/", rowSpan: 2, sortKey: "area_m2" },
  { label: "Эдэлбэрийн хэлбэр", rowSpan: 2, sortKey: "right_type" },
  { label: "Нөлөөлөлд өртсөн газрын үнэлгээ", colSpan: 2 },
  { label: "Хөрөнгийн нөхөх олговрын хэмжээ, үнэ /төгрөг/", colSpan: 2 },
  { label: "Нийт нөхөх олговор /төгрөг/", rowSpan: 2, sortKey: "total_comp" },
  { label: "Үлдэх газрын хэмжээ /м2/", rowSpan: 2, sortKey: "remaining_area_m2" },
  { label: "Мэдээллийн санд өөрчлөлт хийгдсэн байдал", colSpan: 3 },
];

const REPORT_TABLE_SUB_HEADERS: { label: string; sortKey?: string }[] = [
  { label: "Хэмжээ /м2/", sortKey: "acquisition_area_m2" },
  { label: "Үнэ /төгрөг/", sortKey: "land_comp" },
  { label: "Үл хөдлөх хөрөнгө", sortKey: "real_state_comp" },
  { label: "Эд хөрөнгө", sortKey: "property_comp" },
  { label: "Мэдээллийн санд өөрчлөлт орсон эсхүл устгагдсан эсэх", sortKey: "db_changed" },
  { label: "Өөрчлөгдсөн нэгж талбарын дугаар", sortKey: "changed_parcel_id" },
  { label: "Талбайн хэмжээ" },
];

const REPORT_TABLE_COLUMN_COUNT = 18;

// Хяналтын самбарын "НЭГЖ ТАЛБАРЫН МЭДЭЭЛЭЛ" хэсэгтэй ижил хэвтээ баарын элемент.
function HBar({
  label,
  value,
  maxVal,
  color,
}: {
  label: string;
  value: number;
  maxVal: number;
  color: string;
}) {
  const pct = Math.max(3, (value / Math.max(maxVal, 1)) * 100);
  return (
    <div className="flex items-center gap-2" title={label}>
      <span
        className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 text-right leading-tight whitespace-normal break-words"
        style={{ width: 86 }}
      >
        {label}
      </span>
      <div className="flex-1 h-[14px] rounded-sm overflow-hidden bg-slate-100 dark:bg-white/[0.05]">
        <div
          className="h-full rounded-sm transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0 text-right"
        style={{ width: 36 }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

const PAGE_SIZE = 20;

const CURRENT_YEAR = new Date().getFullYear();
// Оны сонголт — БҮХ дэлгэцэд нэг ижил муж (2010-оос хойш).
const YEAR_OPTIONS: number[] = SHARED_YEAR_OPTIONS;

const COMP_TYPE_LABELS: Record<string, string> = {
  "": "Нөхөн төлбөр (бүгд)",
  cash: "Мөнгөн",
  land_grant: "Газраар",
};

function formatMoney(value: number): string {
  return value > 0 ? value.toLocaleString("mn-MN") : "—";
}

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

// ── Searchable acquisition select ─────────────────────────────────────────────
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

// ── Searchable plan select ────────────────────────────────────────────────────
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { plans } = useAcquisitionPlanOptions();

  const filtered = query.trim()
    ? plans.filter(
        (p) =>
          p.plan_code.toLowerCase().includes(query.trim().toLowerCase()) ||
          p.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : plans;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  function select(p: { plan_code: string; name: string }) {
    setQuery(p.plan_code);
    onChange(p.plan_code);
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setQuery("");
    onChange("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <div
        className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 cursor-text focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all"
        onClick={() => setOpen(true)}
      >
        <input
          type="text"
          placeholder="Төлөвлөгөөний дугаар"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="flex-1 min-w-0 text-[13px] text-slate-800 dark:text-slate-200 bg-transparent outline-none"
        />
        {query ? (
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
        <div className="absolute z-50 mt-1 w-80 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-slate-400 dark:text-slate-500">
                Олдсонгүй
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.plan_code}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(p);
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors border-b border-slate-50 dark:border-[#252630] last:border-0"
                >
                  <span className="text-[13px] text-slate-700 dark:text-slate-200">
                    <Highlight text={p.plan_code} query={query} />
                  </span>
                  {p.name && (
                    <>
                      <span className="text-[12px] text-slate-300 dark:text-slate-600 mx-1.5">
                        |
                      </span>
                      <span className="text-[12px] text-slate-500 dark:text-slate-400">
                        <Highlight text={p.name} query={query} />
                      </span>
                    </>
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

// ── Year multi-select ──────────────────────────────────────────────────────────
function YearMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (years: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (y: string) =>
    onChange(
      value.includes(y)
        ? value.filter((v) => v !== y)
        : [...value, y].sort((a, b) => Number(b) - Number(a)),
    );

  const label = value.length === 0 ? null : value.join(" ");

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center h-9 gap-1.5 rounded-lg border px-3 text-[13px] min-w-[150px] transition-all",
          open
            ? "border-[#02c0ce] ring-2 ring-[#02c0ce]/15"
            : "border-slate-200 dark:border-white/[0.08]",
          "bg-white dark:bg-[#1e1f27]",
        )}
      >
        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span
          className={cn(
            "flex-1 text-left truncate",
            value.length === 0
              ? "text-slate-400"
              : "text-slate-700 dark:text-white",
          )}
        >
          {label ?? "Он..."}
        </span>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="shrink-0"
          >
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
          </button>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <ul className="absolute z-50 mt-1 w-36 max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#252630] shadow-lg py-1">
          {YEAR_OPTIONS.map((year) => {
            const y = String(year);
            const checked = value.includes(y);
            return (
              <li
                key={y}
                onClick={() => toggle(y)}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1e1f27] select-none text-[13px]"
              >
                <div
                  className={cn(
                    "h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors",
                    checked
                      ? "bg-[#02c0ce] border-[#02c0ce]"
                      : "border-slate-300 dark:border-white/[0.2]",
                  )}
                >
                  {checked && (
                    <svg viewBox="0 0 10 8" fill="none" className="h-2 w-2">
                      <path
                        d="M1 4l3 3 5-6"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className={
                    checked
                      ? "text-slate-800 dark:text-white font-medium"
                      : "text-slate-600 dark:text-slate-300"
                  }
                >
                  {y}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Progress modal ─────────────────────────────────────────────────────────────
function ProgressModal({
  open,
  progress,
  total,
  status,
  onClose,
}: {
  open: boolean;
  progress: number;
  total: number;
  status: "idle" | "fetching" | "generating" | "done" | "error";
  onClose: () => void;
}) {
  if (!open) return null;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1f27] rounded-2xl shadow-2xl w-[420px] p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#02c0ce]/10">
            <FileSpreadsheet className="h-5 w-5 text-[#02c0ce]" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-slate-800 dark:text-white">
              Тайлан үүсгэж байна
            </p>
            <p className="text-[12px] text-slate-400">
              {status === "fetching" &&
                `Мэдээлэл татаж байна... ${progress}/${total}`}
              {status === "generating" && "Excel файл үүсгэж байна..."}
              {status === "done" && "Татаж авлаа!"}
              {status === "error" && "Алдаа гарлаа"}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[12px] text-slate-500">
            <span>
              {status === "generating"
                ? "Excel боловсруулж байна..."
                : `${progress} / ${total} чөлөөлөлт`}
            </span>
            <span className="font-medium text-[#02c0ce]">
              {status === "generating" ? "" : `${pct}%`}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                status === "error" ? "bg-red-500" : "bg-[#02c0ce]",
                status === "generating" && "animate-pulse w-full",
              )}
              style={{ width: status === "generating" ? "100%" : `${pct}%` }}
            />
          </div>
        </div>

        {(status === "done" || status === "error") && (
          <button
            onClick={onClose}
            className="self-end px-4 py-2 rounded-lg bg-[#02c0ce] text-white text-[13px] font-medium hover:bg-[#00a8b5] transition-colors"
          >
            Хаах
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReportPage() {
  // Төлөвийн өнгө нь `parcel_status` БҮРТГЭЛЭЭС (хатуу хүснэгтэд шинэ төлөв байхгүй).
  const statusStyle = useParcelStatusStyle();

  // Input state — хэрэглэгч бичиж буй утга
  const [inPlanCode, setInPlanCode] = useState("");
  const [inAcqId, setInAcqId] = useState("");
  const [inAcqName, setInAcqName] = useState("");
  const [inAcqYears, setInAcqYears] = useState<string[]>([]);
  const [inAu3Code, setInAu3Code] = useState("");
  const [inRightType, setInRightType] = useState(0);
  const [inLanduse, setInLanduse] = useState("");
  const [inCompType, setInCompType] = useState("");
  const [inGenCatId, setInGenCatId] = useState(0);
  const [inSubCatId, setInSubCatId] = useState(0);

  // Query state — "Хайх" дарахад л шинэчлэгдэнэ, API руу илгээнэ
  const [page, setPage] = useState(1);
  // Эрэмбэ нь зөвхөн жагсаалтад — summary/Excel-ийн filter-т оруулахгүй
  // (эс бөгөөс багана дарах бүрт статистик дахин татагдана).
  const [sort, setSort] = useState<SortState | null>(null);

  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }
  const [planCode, setPlanCode] = useState("");
  const [acqId, setAcqId] = useState("");
  const [acqName, setAcqName] = useState("");
  const [acqYears, setAcqYears] = useState<string[]>([]);
  const [au3Code, setAu3Code] = useState("");
  const [rightType, setRightType] = useState(0);
  const [landuse, setLanduse] = useState("");
  const [compType, setCompType] = useState("");
  const [genCatId, setGenCatId] = useState(0);
  const [subCatId, setSubCatId] = useState(0);

  const [dlOpen, setDlOpen] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  const [dlTotal, setDlTotal] = useState(0);
  const [dlStatus, setDlStatus] = useState<
    "idle" | "fetching" | "generating" | "done" | "error"
  >("idle");

  const { data: reportGenCats = [] } = useQuery({
    queryKey: ["acquisition-categories"],
    queryFn: () => landApi.listCategories(),
    staleTime: Infinity,
  });
  const { data: reportSubCats = [] } = useQuery({
    queryKey: ["acquisition-categories", inGenCatId],
    queryFn: () => landApi.listCategories(inGenCatId),
    enabled: !!inGenCatId,
    staleTime: Infinity,
  });

  const hasActiveFilter = !!(
    planCode ||
    acqId ||
    acqName ||
    acqYears.length ||
    au3Code ||
    rightType ||
    landuse ||
    compType ||
    genCatId ||
    subCatId
  );
  const filter = {
    plan_code: planCode || undefined,
    acquisition_id: acqId || undefined,
    acquisition_name: acqId ? undefined : acqName || undefined,
    au3_code: au3Code || undefined,
    right_type: rightType || undefined,
    landuse: landuse || undefined,
    years: acqYears.length > 0 ? acqYears.map(Number) : undefined,
    compensation_type: compType || undefined,
    general_category_id: genCatId || undefined,
    sub_category_id: subCatId || undefined,
    page,
    page_size: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["report-parcel-list", filter, sort],
    queryFn: () => reportApi.list({ ...filter, sort: sort?.by, order: sort?.dir }),
  });

  const parcels: ReportParcelRow[] = data?.data ?? [];
  const totalPages = data?.total_pages ?? 1;
  const total = data?.total ?? 0;

  // Дээд хэсгийн статистикийн картуудад одоогийн хайлтын БҮХ (хуудаслаагүй) үр
  // дүнгээр тооцох шаардлагатай — backend дээр нэг л дуудлагаар нэгтгэж тооцоолно
  // (өмнө нь бүх хуудсыг client талд дараалан татдаг байсан нь report/download-ыг
  // 10+ дахин дуудуулж байсан тул /report/summary болгож зассан).
  const { page: _summaryPage, page_size: _summaryPageSize, ...summaryFilter } = filter;

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["report-summary", summaryFilter],
    queryFn: () => reportApi.summary(summaryFilter),
  });

  const stats = useMemo(
    () => ({
      acquisitionCount: summary?.acquisition_count ?? 0,
      parcelCount: summary?.parcel_count ?? 0,
      totalArea: summary?.total_area_m2 ?? 0,
      totalParcelArea: summary?.total_parcel_area_m2 ?? 0,
      totalComp: summary?.total_compensation ?? 0,
      landComp: summary?.land_compensation ?? 0,
      realStateComp: summary?.real_state_compensation ?? 0,
      propertyComp: summary?.property_compensation ?? 0,
      otherComp: summary?.other_compensation ?? 0,
      years: (summary?.year_breakdown ?? []).map((y) => ({ year: y.year, count: y.count })),
      statuses: (summary?.status_breakdown ?? []).map((s) => ({
        status: s.status,
        name: s.status_name,
        count: s.count,
      })),
    }),
    [summary],
  );

  const filtered = parcels;

  const handleSearch = () => {
    setPlanCode(inPlanCode);
    setAcqId(inAcqId);
    setAcqName(inAcqName);
    setAcqYears(inAcqYears);
    setAu3Code(inAu3Code);
    setRightType(inRightType);
    setLanduse(inLanduse);
    setCompType(inCompType);
    setGenCatId(inGenCatId);
    setSubCatId(inSubCatId);
    setPage(1);
  };

  const handleReset = () => {
    setInPlanCode("");
    setInAcqId("");
    setInAcqName("");
    setInAcqYears([]);
    setInAu3Code("");
    setInRightType(0);
    setInLanduse("");
    setInCompType("");
    setInGenCatId(0);
    setInSubCatId(0);
    setPlanCode("");
    setAcqId("");
    setAcqName("");
    setAcqYears([]);
    setAu3Code("");
    setRightType(0);
    setLanduse("");
    setCompType("");
    setGenCatId(0);
    setSubCatId(0);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // ── Download — query state ашиглана ───────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setDlOpen(true);
    setDlStatus("fetching");
    setDlProgress(0);
    setDlTotal(0);

    const token = authStorage.getAccessToken() ?? "";
    const params = new URLSearchParams();
    if (planCode) params.set("plan_code", planCode);
    if (acqId) params.set("acquisition_id", acqId);
    if (acqName) params.set("acquisition_name", acqName);
    acqYears.forEach((y) => params.append("year", y));
    if (au3Code) params.set("au3_code", au3Code);
    if (rightType) params.set("right_type", String(rightType));
    if (landuse) params.set("landuse", landuse);
    if (compType) params.set("compensation_type", compType);
    if (genCatId) params.set("general_category_id", String(genCatId));
    if (subCatId) params.set("sub_category_id", String(subCatId));

    // Нэг SSE мессежийг боловсруулна. Дуусахад true буцаана (унших давталтыг зогсооно).
    const handleMsg = (msg: { type: string; total?: number; current?: number; base64?: string; filename?: string; message?: string }): boolean => {
      if (msg.type === "total") {
        setDlTotal(msg.total ?? 0);
      } else if (msg.type === "progress") {
        setDlProgress(msg.current ?? 0);
      } else if (msg.type === "generating") {
        setDlStatus("generating");
      } else if (msg.type === "done") {
        setDlStatus("done");
        const bytes = Uint8Array.from(atob(msg.base64 ?? ""), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = msg.filename ?? "тайлан.xlsx";
        a.click();
        URL.revokeObjectURL(url);
        return true;
      } else if (msg.type === "error") {
        setDlStatus("error");
        toast.error(msg.message ?? "Тайлан үүсгэхэд алдаа гарлаа");
        return true;
      }
      return false;
    };

    try {
      // ЯАГААД EventSource БИШ fetch: EventSource нь Authorization header дэмждэггүй
      // тул өмнө нь токеныг URL query-д (`?token=`) дамжуулдаг байсан — тэр нь
      // browser history, referrer, proxy/container логд алдагддаг аюултай.
      // fetch нь header дэмждэг тул токен зөвхөн header-т явж, URL-д орохгүй.
      const res = await fetch(`/api/report/download?${params.toString()}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token.replace(/^Bearer\s+/i, "")}` } : {},
      });
      if (!res.ok || !res.body) {
        setDlStatus("error");
        toast.error("Холболт тасарлаа");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frame бүр `\n\n`-ээр тусгаарлагдана.
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = frame.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          if (handleMsg(JSON.parse(line))) {
            finished = true;
            break;
          }
        }
      }
      reader.cancel().catch(() => {});
    } catch (err) {
      logger.error("report download stream setup failed", { error: String(err) });
      setDlStatus("error");
    }
  }, [
    planCode,
    acqId,
    acqName,
    acqYears,
    au3Code,
    rightType,
    landuse,
    compType,
    genCatId,
    subCatId,
  ]);

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">
            Тайлан
          </h1>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            Бүх чөлөөлөлтийн нэгж талбаруудын мэдээлэл
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded-xl bg-[#02c0ce] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#02a3af] transition-colors"
        >
          <Download className="h-4 w-4" />
          Тайлан татах
        </button>
      </div>

      {/* Хайлтын үр дүнгийн статистик картууд */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="ap-card relative overflow-hidden p-5 flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#02c0ce" }} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Нийт чөлөөлөлт
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#02c0ce]/10">
              <FileText className="h-[18px] w-[18px] text-[#02c0ce]" />
            </div>
          </div>
          <div className="flex-1 flex items-center justify-between gap-3">
            <span className="text-[30px] font-black tabular-nums leading-none text-slate-800 dark:text-white">
              {summaryLoading ? "…" : stats.acquisitionCount.toLocaleString()}
            </span>
            <div className="text-right">
              <p className="text-[17px] text-slate-400 dark:text-slate-500">Талбай</p>
              <p className="text-[21px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {summaryLoading
                  ? "…"
                  : `${(stats.totalParcelArea / 10000).toLocaleString("mn-MN", { maximumFractionDigits: 1 })} га`}
              </p>
            </div>
          </div>
          {stats.years.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-[#37394d]">
              {stats.years.slice(0, 5).map((y) => (
                <span
                  key={y.year}
                  className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[#02c0ce]/10 text-[#02c0ce]"
                >
                  {y.year}: {y.count}
                </span>
              ))}
              {stats.years.length > 5 && (
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  …
                </span>
              )}
            </div>
          )}
        </div>

        <div className="ap-card relative overflow-hidden p-5 flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#a855f7" }} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Нэгж талбар (статусаар)
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]/10">
              <ListChecks className="h-[18px] w-[18px] text-[#a855f7]" />
            </div>
          </div>
          <div className="flex-1 flex items-center gap-4 mt-2.5">
            <span className="text-[30px] font-black tabular-nums leading-none text-slate-800 dark:text-white shrink-0">
              {summaryLoading ? "…" : stats.parcelCount.toLocaleString()}
            </span>
            {stats.statuses.length > 0 && (
              <div className="flex-1 min-w-0 space-y-1.5">
                {stats.statuses.map((s) => (
                  <HBar
                    key={s.status}
                    label={s.name || "—"}
                    value={s.count}
                    maxVal={Math.max(...stats.statuses.map((x) => x.count))}
                    color={statusStyle(s.status).color}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ap-card relative overflow-hidden p-5 flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#f9bc0b" }} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Нөлөөлөлд өртсөн талбай
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9bc0b]/10">
              <MapPinned className="h-[18px] w-[18px] text-[#f9bc0b]" />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <span className="text-[30px] font-black tabular-nums leading-none text-slate-800 dark:text-white block">
              {summaryLoading ? "…" : (stats.totalArea / 10000).toLocaleString("mn-MN", { maximumFractionDigits: 1 })} га
            </span>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
              {summaryLoading ? "…" : stats.totalArea.toLocaleString("mn-MN", { maximumFractionDigits: 0 })} м²
            </p>
          </div>
        </div>

        <div className="ap-card relative overflow-hidden p-5 flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: "#0acf97" }} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Нийт нөхөх олговор
            </p>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0acf97]/10">
              <Banknote className="h-[18px] w-[18px] text-[#0acf97]" />
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <span className="text-[24px] font-black tabular-nums leading-none text-slate-800 dark:text-white block">
              {summaryLoading ? "…" : (stats.totalComp / 1_000_000_000).toLocaleString("mn-MN", { maximumFractionDigits: 3 })} тэрбум ₮
              {!summaryLoading && <AmountHint value={stats.totalComp} className="ml-1" />}
            </span>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
              {summaryLoading ? "…" : `${formatMoney(stats.totalComp)} ₮`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-x-2 mt-3 pt-3 border-t border-slate-100 dark:border-[#37394d]">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-normal break-words">Газар</p>
              <p className="text-[13px] font-bold tabular-nums text-slate-700 dark:text-slate-200 break-words">
                {summaryLoading ? (
                  "…"
                ) : (
                  <AbbrevAmount value={stats.landComp} className="flex-wrap">
                    {(stats.landComp / 1_000_000_000).toLocaleString("mn-MN", { maximumFractionDigits: 2 })}
                  </AbbrevAmount>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-normal break-words">Үл хөдлөх</p>
              <p className="text-[13px] font-bold tabular-nums text-slate-700 dark:text-slate-200 break-words">
                {summaryLoading ? (
                  "…"
                ) : (
                  <AbbrevAmount value={stats.realStateComp} className="flex-wrap">
                    {(stats.realStateComp / 1_000_000_000).toLocaleString("mn-MN", { maximumFractionDigits: 2 })}
                  </AbbrevAmount>
                )}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-normal break-words">Эд хөрөнгө</p>
              <p className="text-[13px] font-bold tabular-nums text-slate-700 dark:text-slate-200 break-words">
                {summaryLoading ? (
                  "…"
                ) : (
                  <AbbrevAmount value={stats.propertyComp} className="flex-wrap">
                    {(stats.propertyComp / 1_000_000_000).toLocaleString("mn-MN", { maximumFractionDigits: 2 })}
                  </AbbrevAmount>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="ap-card overflow-hidden">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-[#37394d]" {...searchOnEnter(handleSearch)}>
          <PlanSelect
            value={inPlanCode}
            onChange={setInPlanCode}
            className="w-52"
          />

          <AcquisitionSelect
            selectedId={inAcqId}
            onSelect={(id, label) => {
              setInAcqId(id);
              setInAcqName(label);
            }}
            onClear={() => {
              setInAcqId("");
              setInAcqName("");
            }}
            className="w-56"
          />

          <YearMultiSelect value={inAcqYears} onChange={setInAcqYears} />

          <select
            value={inRightType}
            onChange={(e) =>
              setInRightType(e.target.value ? Number(e.target.value) : 0)
            }
            className="h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-700 dark:text-white outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all w-36"
          >
            <option value={0}>Эрхийн төрөл</option>
            <option value={1}>Ашиглах</option>
            <option value={2}>Эзэмших</option>
            <option value={3}>Өмчлөх</option>
          </select>

          <div className="flex items-center h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 gap-1.5 focus-within:border-[#02c0ce] focus-within:ring-2 focus-within:ring-[#02c0ce]/15 transition-all w-40">
            <input
              type="text"
              className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-700 dark:text-white placeholder:text-slate-400 outline-none"
              placeholder="Газрын зориулалт"
              value={inLanduse}
              onChange={(e) => setInLanduse(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {inLanduse && (
              <button onClick={() => setInLanduse("")} className="shrink-0">
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>

          <div className="relative">
            <select
              value={inCompType}
              onChange={(e) => setInCompType(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] pl-3 pr-8 text-[13px] text-slate-700 dark:text-white outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
            >
              {Object.entries(COMP_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          <div className="relative">
            <select
              value={inGenCatId}
              onChange={(e) => {
                setInGenCatId(Number(e.target.value));
                setInSubCatId(0);
              }}
              className="h-9 appearance-none rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] pl-3 pr-8 text-[13px] text-slate-700 dark:text-white outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
            >
              <option value={0}>Бүх ерөнхий ангилал</option>
              {reportGenCats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>

          {!!inGenCatId && (
            <div className="relative">
              <select
                value={inSubCatId}
                onChange={(e) => setInSubCatId(Number(e.target.value))}
                className="h-9 appearance-none rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] pl-3 pr-8 text-[13px] text-slate-700 dark:text-white outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
              >
                <option value={0}>Бүх дэд ангилал</option>
                {reportSubCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          )}

          <SearchButton onClick={handleSearch} />
          <RefreshButton />

          {/* Boolean() — эс бөгөөс `inGenCatId === 0` үед товчны оронд "0" зурагддаг. */}
          {Boolean(
            hasActiveFilter ||
              inPlanCode ||
              inAcqId ||
              inAcqName ||
              inAcqYears.length ||
              inAu3Code ||
              inRightType ||
              inLanduse ||
              inCompType ||
              inGenCatId,
          ) && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-white/[0.08] text-[13px] text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Цэвэрлэх
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-[#1a1d20]">
                {REPORT_TABLE_GROUP_HEADERS.map((h) => (
                  <th
                    key={h.label}
                    rowSpan={h.rowSpan}
                    colSpan={h.colSpan}
                    aria-sort={h.sortKey ? ariaSort(sort, h.sortKey) : undefined}
                    className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 align-bottom border border-slate-200 dark:border-[#37394d]"
                  >
                    {h.sortKey ? (
                      <SortButton label={h.label} sortKey={h.sortKey} sort={sort} onSort={applySort} className="text-center" />
                    ) : (
                      h.label
                    )}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-50/50 dark:bg-[#1a1d20]">
                {REPORT_TABLE_SUB_HEADERS.map((h) => (
                  <th
                    key={h.label}
                    aria-sort={h.sortKey ? ariaSort(sort, h.sortKey) : undefined}
                    className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#37394d]"
                  >
                    {h.sortKey ? (
                      <SortButton label={h.label} sortKey={h.sortKey} sort={sort} onSort={applySort} className="text-center" />
                    ) : (
                      h.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: REPORT_TABLE_COLUMN_COUNT }).map((__, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-4 bg-slate-100 dark:bg-white/[0.06] rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={REPORT_TABLE_COLUMN_COUNT}
                    className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500"
                  >
                    Мэдээлэл олдсонгүй
                  </td>
                </tr>
              ) : (
                filtered.map((p, idx) => {
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                  const constructionType = [p.general_category_name, p.sub_category_name]
                    .filter(Boolean)
                    .join(" / ");
                  const decreeText = [formatDate(p.decree_date), p.decree_number]
                    .filter((v) => v && v !== "—")
                    .join(" / ");
                  const holderFull = [
                    [p.holder_last_name, p.holder_name].filter(Boolean).join(" "),
                    p.holder_register_no,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <tr
                      key={`${p.acquisition_id}-${p.parcel_id}-${idx}`}
                      className="hover:bg-slate-50/60 dark:hover:bg-[#252630] transition-colors"
                    >
                      <td className="px-3 py-3.5 text-slate-400 tabular-nums">
                        {rowNum}
                      </td>
                      <td className="px-3 py-3.5 text-[12px] text-slate-600 dark:text-slate-300 min-w-[140px]">
                        <span className="block whitespace-normal break-words">{constructionType || "—"}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="text-slate-700 dark:text-slate-200 min-w-[180px] whitespace-normal break-words">
                          {p.acquisition_name}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-[12px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {decreeText || "—"}
                      </td>
                      <td className="px-3 py-3.5">
                        <p
                          className="text-slate-700 dark:text-slate-200 min-w-[180px] whitespace-normal break-words"
                        >
                          {holderFull || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 text-[12px] text-slate-600 dark:text-slate-300">
                        <span className="block min-w-[160px] max-w-[260px] whitespace-normal break-words leading-snug">
                          {p.address || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-[12px] text-slate-700 dark:text-slate-200">
                        {p.parcel_id}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {p.area_m2?.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">
                        {RIGHT_TYPE_LABELS[p.right_type] ?? "—"}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {p.acquisition_area_m2?.toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(p.land_comp)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(p.real_state_comp)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatMoney(p.property_comp)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums font-semibold text-slate-800 dark:text-white">
                        {formatMoney(p.total_comp)}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {p.remaining_area_m2 > 0 ? p.remaining_area_m2.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">
                        {p.db_changed || "—"}
                      </td>
                      <td className="px-3 py-3.5 font-mono text-[12px] text-slate-600 dark:text-slate-300">
                        {p.changed_parcel_id || "—"}
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {p.remaining_area_m2 > 0 ? p.remaining_area_m2.toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-[#37394d]">
          <p className="text-[12px] text-slate-400 dark:text-slate-500">
            Нийт{" "}
            <span className="font-semibold text-slate-600 dark:text-white">
              {total}
            </span>{" "}
            нэгж талбар
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 text-[13px] text-slate-600 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <ProgressModal
        open={dlOpen}
        progress={dlProgress}
        total={dlTotal}
        status={dlStatus}
        onClose={() => {
          setDlOpen(false);
          setDlStatus("idle");
        }}
      />
    </div>
  );
}
