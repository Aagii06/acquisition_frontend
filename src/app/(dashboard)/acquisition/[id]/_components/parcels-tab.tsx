"use client";
import { useParcelStatusRules } from "@/lib/use-parcel-status-rules";
import { CompensationPaymentBadge } from "@/components/ui/compensation-payment-badge";
import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  SortableHeaderRow,
  nextSortState,
  type SortColumn,
  type SortState,
} from "@/components/ui/sortable-table-head";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Check, Download, Info, RefreshCw, X } from "lucide-react";
import { landApi, parcelStatusApi } from "@/lib/api";
import { profApi } from "@/lib/prof-api";
import { getApiError } from "@/lib/utils";
import { notifyNavStart } from "@/lib/blocking-loader-state";
import { runSequentialWithDelay } from "@/lib/sequential-runner";
import { canAccessParcel, getCurrentOrgId, isExternalSpecialRole, isFinanceSpecialist, isProfessionalOrg } from "@/lib/role-utils";
import { VALUATION_STATUS_LABELS, VALUATION_TYPE_LABELS } from "@/types";
import { StatusLabel } from "@/components/ui/status-label";
import type { ParcelDiscoveryResult, ParcelStatus, ValuationStatus, ValuationType } from "@/types";
import { ConfirmDialog, type PendingConfirm } from "@/components/ui/confirm-dialog";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { useParcelStatusStyle } from "@/lib/use-parcel-status-style";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import { ParcelSyncDialog } from "../../../parcel/_components/parcel_sync_dialog";

const RIGHT_TYPE_OPTIONS = [
  { value: 1, label: "Ашиглах" },
  { value: 2, label: "Эзэмших" },
  { value: 3, label: "Өмчлөх" },
];

type ParcelFilter = {
  parcel_id: string;
  au1_code: string;
  au2_code: string;
  au3_code: string;
  right_type: number;
  landuse: string;
  status_id: number;
  /** "" = бүгд, "1" = зөвхөн давхардалтай, "0" = зөвхөн давхардалгүй */
  has_overlap: string;
};

const PAGE_SIZE = 20;

// ── Нэгж талбар татах (2 алхамт) ───────────────────────────────────────────
// 1-р алхам: чөлөөлөх ХИЛЭЭР ГУС-аас нэгж талбарын ДУГААРУУДЫГ авч бүртгэнэ
//            (backend → дундын сервисийн /parcels/by/acquisition, нэг хүсэлт).
//            Дугаараар хайж, аль хэдийн бүртгэгдсэнийг давхардуулахгүй.
// 2-р алхам: 1-р алхмаас ирсэн дугаар тус бүрээр дэлгэрэнгүйг (дундын
//            сервисийн /parcel/info/:parcel) ДАРААЛАН татна. Хүсэлт хооронд
//            1 секунд зайлуулна — зэрэг олон хүсэлтээр дундын сервисийг
//            дүүргэхгүйн тулд.
const BULK_SYNC_DELAY_MS = 1000;

type BulkSyncFailure = { parcelId: string; message: string };

/** Татах явцын нэг алхмын төлөв */
type StepState = "pending" | "running" | "done" | "error" | "cancelled";

const STEP_BOX: Record<StepState, string> = {
  pending: "border-slate-200 dark:border-[#37394d] bg-white dark:bg-[#1e1f27]",
  running: "border-blue-300 dark:border-blue-500/40 bg-blue-50/60 dark:bg-blue-500/[0.07]",
  done: "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/[0.08]",
  error: "border-red-300 dark:border-red-500/40 bg-red-50/70 dark:bg-red-500/[0.08]",
  cancelled: "border-slate-200 dark:border-[#37394d] bg-slate-50 dark:bg-[#252630]",
};

const STEP_ICON_BG: Record<StepState, string> = {
  pending: "bg-slate-100 dark:bg-[#2d2f3a]",
  running: "bg-blue-500/15",
  done: "bg-emerald-500/15",
  error: "bg-red-500/15",
  cancelled: "bg-slate-500/10",
};

function StepIcon({ state, index }: { state: StepState; index: number }) {
  if (state === "error") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (state === "done") return <Check className="h-4 w-4 text-emerald-500" />;
  if (state === "running") return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
  if (state === "cancelled") return <X className="h-4 w-4 text-slate-400" />;
  return (
    <span className="text-[12px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
      {index}
    </span>
  );
}

// Нөхөх олговрын үнэлгээний төлөвийн чипийн өнгө
const VAL_STATUS_CHIP: Record<ValuationStatus, string> = {
  draft: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  returned: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  rejected: "bg-red-100 text-red-500 dark:bg-red-500/15 dark:text-red-400",
};

const EMPTY_FILTER: ParcelFilter = {
  parcel_id: "",
  au1_code: "",
  au2_code: "",
  au3_code: "",
  right_type: 0,
  landuse: "",
  status_id: 0,
  has_overlap: "",
};

// Хүснэгтийн баганууд. `key` нь backend-ийн зөвшөөрөгдсөн эрэмбийн түлхүүр —
// жагсаалт хуудаслагддаг тул эрэмбэ СЕРВЕР дээр хийгдэж бүх хуудсыг хамарна.
const COLUMNS: SortColumn[] = [
  { label: "" },
  { label: "Дугаар", key: "parcel_id" },
  { label: "Өмчлөгч, эзэмшигч", key: "holder" },
  { label: "Хаяг", key: "au3_code" },
  { label: "Эрхийн төрөл", key: "right_type" },
  { label: "Газрын зориулалт", key: "landuse" },
  // Нөлөөлөлд өртсөн (давхцал) ба үндсэн талбай НЭГ баганад: «120/100».
  { label: "Талбай", sublabel: "Нөлөөлөлд өртсөн/Үндсэн", key: "area_m2" },
  // Олговрын дүн ба төлбөр олголтын хувь НЭГ баганад (дээр дүн, доор олголт).
  { label: "Нөхөн төлбөр", sublabel: "Төлбөр олголт", key: "compensation" },
  { label: "Төлөв", key: "status_id" },
  { label: "Мэдээлэл" },
  { label: "" },
];

/** Талбайн тоо (м² нэгжгүй) — «Талбай» баганын «нөлөөлөлд өртсөн/үндсэн». */
function areaNumber(m2?: number | null): string {
  return m2 == null ? "—" : m2.toLocaleString("mn-MN", { maximumFractionDigits: 2 });
}

function parcelListParams(
  filter: ParcelFilter,
  page: number,
  sort: SortState | null,
) {
  return {
    page,
    page_size: PAGE_SIZE,
    ...(filter.parcel_id.trim() ? { parcel_id: filter.parcel_id.trim() } : {}),
    ...(filter.au1_code.trim() ? { au1_code: filter.au1_code.trim() } : {}),
    ...(filter.au2_code.trim() ? { au2_code: filter.au2_code.trim() } : {}),
    ...(filter.au3_code.trim() ? { au3_code: filter.au3_code.trim() } : {}),
    ...(filter.right_type ? { right_type: filter.right_type } : {}),
    ...(filter.landuse.trim() ? { landuse: filter.landuse.trim() } : {}),
    ...(filter.status_id ? { status_id: filter.status_id } : {}),
    ...(filter.has_overlap ? { has_overlap: filter.has_overlap } : {}),
    ...(sort ? { sort: sort.by, order: sort.dir } : {}),
  };
}

export function ParcelsTab({
  id,
  acquisitionProfOrgId,
  isAcqLocked = false,
  isBeforeFieldStage = false,
}: {
  id: string;
  acquisitionProfOrgId?: string | null;
  isAcqLocked?: boolean;
  /**
   * Чөлөөлөлт "Хээрийн судалгаа"-аас ӨМНӨХ ("Шинэ") төлөвт байна.
   *
   * Тэр төлөвт нэгж талбартай АЖИЛЛАХ (үнэлгээ, олговор, төлөв) боломжгүй —
   * backend 423 буцаана. Нэгж талбар ТАТАХ нь харин яг энэ төлөвийн ажил тул
   * хаагдахгүй.
   */
  isBeforeFieldStage?: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  // Төлөвийн өнгө нь `parcel_status` БҮРТГЭЛЭЭС (хатуу хүснэгтэд шинэ төлөв байхгүй).
  const statusStyle = useParcelStatusStyle();
  // «Үнэлгээний шат» — төлөвийн ТОХИРГООНООС (гадаад байгууллагын харагдах мөр).
  const statusRules = useParcelStatusRules();

  const isExternal = isExternalSpecialRole();
  const isProfOrg = isProfessionalOrg();
  const isFinance = isFinanceSpecialist();
  // Үндсэн гүйцэтгэгч эсэхийг хэрэглэгчийн биш БАЙГУУЛЛАГЫН харьяалалаар
  // тогтооно — нэг байгууллагын аль ч ажилтан ижил эрхтэй.
  const currentOrgId = getCurrentOrgId();
  const isMainProfOrg = isExternal && !!currentOrgId && acquisitionProfOrgId === currentOrgId;
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  // «Мэдээлэл дуудах» — нэгж талбарын дэлгэрэнгүйн товчтой ИЖИЛ цонх. Мөр
  // дарахад дэлгэрэнгүй рүү шилждэг тул цонхыг хүснэгтийн ГАДНА зурна.
  const [syncTarget, setSyncTarget] = useState<{
    parcelUuid: string;
    parcelCode: string;
    rightType: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);
  const [filterForm, setFilterForm] = useState<ParcelFilter>(EMPTY_FILTER);

  // Шүүлт хэрэглэх — товч болон ENTER хоёулаа үүнийг дуудна.
  function applySearch() {
    setFilter({ ...filterForm });
    setPage(1);
  }
  const [filter, setFilter] = useState<ParcelFilter>(EMPTY_FILTER);
  const [expandedParcel, setExpandedParcel] = useState<string | null>(null);
  const [expandedGrant, setExpandedGrant] = useState<string | null>(null);

  // Нэгж талбар татах явц (2 алхам)
  const [importOpen, setImportOpen] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importCancelled, setImportCancelled] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [step1, setStep1] = useState<StepState>("pending");
  const [step2, setStep2] = useState<StepState>("pending");
  const [discovery, setDiscovery] = useState<ParcelDiscoveryResult | null>(null);
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncDone, setSyncDone] = useState(0);
  const [syncOk, setSyncOk] = useState(0);
  const [syncCurrent, setSyncCurrent] = useState("");
  const [syncFailed, setSyncFailed] = useState<BulkSyncFailure[]>([]);
  // "Цуцлах" дарсныг болон алдаа гарсныг гогцоо ШУУД харах ёстой тул state биш ref
  const cancelRef = useRef(false);
  const failedRef = useRef(false);

  const { data: parcelStatuses = [] } = useQuery<ParcelStatus[]>({
    queryKey: ["parcel-statuses"],
    queryFn: () => parcelStatusApi.list(),
  });

  const { data: parcels, isLoading: parcelsLoading } = useQuery({
    queryKey: ["land-parcels", id, filter, page, sort],
    queryFn: () =>
      isProfOrg
        ? profApi.profListParcels(id, parcelListParams(filter, page, sort))
        : landApi.getParcels(id, parcelListParams(filter, page, sort)),
  });

  // Эрэмбэ солигдоход эхний хуудас руу буцна.
  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }

  // Бөөн дуудалт ШҮҮЛТҮҮРЭЭС хамааралгүй бүх талбарыг хамардаг тул
  // баталгаажуулах цонхонд шүүгдээгүй нийт тоог (1 мөрийн хүсэлтээр) харуулна.
  const { data: allParcelCount } = useQuery({
    queryKey: ["land-parcels-total", id],
    queryFn: () => landApi.getParcels(id, { page: 1, page_size: 1 }).then((res) => res.total),
    enabled: !isExternal && !isAcqLocked,
  });

  // Нэгж талбар татах — 1) хилээр дугаар тодорхойлох, 2) дэлгэрэнгүйг дараалан
  // татах. Алхам бүр дэлгэц дээр тусдаа мөр болж харагдана; алдаа гармагц
  // процесс ЗОГСОНО (дараагийн алхам руу орохгүй, үлдсэн дугаарыг татахгүй).
  async function runParcelImport() {
    cancelRef.current = false;
    failedRef.current = false;
    setImportOpen(true);
    setImportRunning(true);
    setImportCancelled(false);
    setCancelRequested(false);
    setImportError(null);
    setStep1("running");
    setStep2("pending");
    setDiscovery(null);
    setSyncTotal(0);
    setSyncDone(0);
    setSyncOk(0);
    setSyncCurrent("");
    setSyncFailed([]);

    // ── 1-р алхам: чөлөөлөх хилээр нэгж талбарыг тодорхойлж бүртгэх ──────────
    let found: ParcelDiscoveryResult;
    try {
      // Бүх хүсэлт silent — явцыг ЭНЭ цонх өөрөө харуулна. Дэлгэц блоклогч
      // loader асвал хүсэлт бүр дээр анивчиж, унших боломжгүй болно.
      found = await landApi.discoverParcels(id, { silent: true });
    } catch (err) {
      setStep1("error");
      setImportError(getApiError(err, "Нэгж талбарыг тодорхойлж чадсангүй"));
      setImportRunning(false);
      toast.error("Нэгж талбар татахад алдаа гарлаа");
      return;
    }
    setDiscovery(found);
    setStep1("done");
    // Шинэ нэгж талбар 1-Р ХУУДСАНД, шүүлтгүй үед л харагдана. Хэрэглэгч
    // шүүлттэй/2-р хуудсан дээр байвал invalidate хийсэн ч "шинэчлэгдээгүй"
    // мэт харагдана — тиймээс жагсаалтыг эхэнд нь буцаана.
    setFilterForm(EMPTY_FILTER);
    setFilter(EMPTY_FILTER);
    setPage(1);
    // refetchType: "all" — идэвхгүй (сонгогдоогүй хуудас/шүүлтийн) кэшийг ч
    // хуучирсанд тооцно, эс бөгөөс буцаж очиход хуучин жагсаалт харагдана.
    await queryClient.invalidateQueries({ queryKey: ["land-parcels", id], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: ["land-parcels-total", id], refetchType: "all" });

    if (cancelRef.current) {
      setImportCancelled(true);
      setStep2("cancelled");
      setImportRunning(false);
      return;
    }

    // ТҮР ХААСАН: 2-р алхам (дэлгэрэнгүй мэдээлэл татах) идэвхгүй байна.
    // Одоогоор татах үйлдэл нь ЗӨВХӨН нэгж талбарыг тодорхойлж бүртгэнэ.
    setImportRunning(false);
    if (found.total === 0) {
      toast.error("Чөлөөлөх хилтэй давхцах нэгж талбар олдсонгүй");
    } else {
      toast.success(`${found.created} нэгж талбар шинээр бүртгэгдлээ`);
    }
    return;

    /* ── 2-р алхам: дугаар тус бүрээр дэлгэрэнгүйг татах ─────────────────────
    // ЗӨВХӨН 1-р алхмаас ирсэн жагсаалтаар давтана — чөлөөлөлтөд өмнө нь өөр
    // замаар нэмэгдсэн, энэ удаагийн хилээр олдоогүй нэгж талбарыг хөндөхгүй.
    setStep2("running");
    const codes = Array.from(new Set((found.parcel_ids ?? []).filter(Boolean)));
    setSyncTotal(codes.length);

    const outcome = await runSequentialWithDelay(codes, (code) => landApi.syncParcel(id, code, { silent: true }), {
      delayMs: BULK_SYNC_DELAY_MS,
      // Цуцлах дарсан ЭСВЭЛ нэг ч дугаар унасан бол гогцоог тэр даруй тасална.
      shouldStop: () => cancelRef.current || failedRef.current,
      onStart: (code) => setSyncCurrent(code),
      onSettled: ({ done, ok, failed }) => {
        setSyncDone(done);
        setSyncOk(ok);
        setSyncFailed(failed.map((item) => ({ parcelId: item.item, message: item.message })));
        if (failed.length > 0) failedRef.current = true;
      },
      toMessage: (err) => getApiError(err, "Татаж чадсангүй"),
    });

    setSyncCurrent("");
    setImportRunning(false);
    queryClient.invalidateQueries({ queryKey: ["land-parcels", id] });

    if (outcome.failed.length > 0) {
      const first = outcome.failed[0];
      setStep2("error");
      setImportError(`${first.item} — ${first.message}`);
      toast.error("Дэлгэрэнгүй мэдээлэл татахад алдаа гарлаа");
      return;
    }
    if (outcome.stopped) {
      setImportCancelled(true);
      setStep2("cancelled");
      toast.success(`Цуцлах үед ${outcome.ok} нэгж талбар шинэчлэгдсэн байлаа`);
      return;
    }
    setStep2("done");
    if (outcome.total === 0) {
      toast.error("Татах нэгж талбар олдсонгүй");
    } else {
      toast.success(`${outcome.ok} нэгж талбарын мэдээлэл шинэчлэгдлээ`);
    }
    ── 2-р алхам төгсгөл ── */
  }

  const compensationMutation = useMutation({
    mutationFn: ({ parcelId, paid }: { parcelId: string; paid: boolean }) =>
      landApi.setParcelCompensation(id, parcelId, paid),
    onSuccess: () => {
      toast.success("Нөхөн төлбөрийн төлөв шинэчлэгдлээ");
      queryClient.invalidateQueries({ queryKey: ["land-parcels", id] });
    },
    onError: (err) => toast.error(getApiError(err, "Нөхөн төлбөр шинэчлэхэд алдаа гарлаа")),
  });

  // ТҮР: 2-р алхам хаагдсан тул 1-р алхам дуусмагц "амжилттай" гэж үзнэ.
  // (2-р алхам эргэж идэвхжихэд `&& step2 === "done"`-ыг буцааж нэмнэ.)
  const importSucceeded = step1 === "done" && !importError && !importCancelled;

  const inp =
    "h-8 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[12px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";
  const hasFilter = !!(
    filter.parcel_id ||
    filter.au1_code ||
    filter.au2_code ||
    filter.au3_code ||
    filter.right_type !== 0 ||
    filter.landuse ||
    filter.status_id !== 0 ||
    filter.has_overlap !== ""
  );
  const visibleParcels = (parcels?.data ?? []).filter((parcel) => {
    if (
      !canAccessParcel(
        parcel.status_name,
        acquisitionProfOrgId,
        parcel.independent_org_id,
        statusRules(parcel.status_id ?? parcel.status).is_valuation_stage,
      )
    )
      return false;
    // Санхүү илгээсэн үнэлгээг хянана, баталгаажсан үнэлгээг цуцалж болно.
    if (isFinance) {
      return Object.values(parcel.valuation_statuses ?? {}).some(
        (status) => status === "submitted" || status === "approved",
      );
    }
    return true;
  });

  return (
    <>
      <div className="ap-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#37394d]">
          {/* Жагсаалтын толгой.
              Товч нь ГАРЧГИЙН МӨРӨНД өөрт нь байрлана — доорх тоо/анхааруулга
              нь тусдаа мөр. Ингэснээр "Шинэ" төлөвийн анхааруулга гарч ирэхэд
              зүүн багана өндөрсөж, товч түүний голд хөвөн далийхгүй. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13px] font-semibold text-slate-700 dark:text-white">
              Нэгж талбарууд
            </p>
            {/* Гадаад ролиуд болон хаалттай чөлөөлөлт дээр дуудалт хийгдэхгүй
                (backend нь land:create + хаалттай биш байхыг шаардана) */}
            {!isExternal && !isAcqLocked && (
              <button
                onClick={() =>
                  setPendingConfirm({
                    title: "Нэгж талбар татах",
                    description: `Чөлөөлөх хилээр ГУС-аас нэгж талбарыг тодорхойлж, дараа нь дугаар тус бүрийн дэлгэрэнгүйг нэг нэгээр татна. Хүсэлт хооронд 1 секунд зайтай тул ${allParcelCount ? `ойролцоогоор ${Math.max(1, Math.ceil((allParcelCount * (BULK_SYNC_DELAY_MS + 500)) / 60000))} минут` : "хэдэн минут"} шаардана.`,
                    confirmLabel: "Татах",
                    confirmColor: "#02c0ce",
                    onConfirm: () => {
                      setPendingConfirm(null);
                      void runParcelImport();
                    },
                  })
                }
                disabled={importRunning}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#0acf97]/10 px-3 text-[12px] font-semibold text-[#0acf97] hover:bg-[#0acf97]/20 disabled:opacity-50 transition-colors"
              >
                {importRunning ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Нэгж талбар татах
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {parcels?.total ?? 0} нэгж талбар
          </p>
          {/* "Шинэ" төлөв = БҮРДЭЛийн шат. Нэгж талбартай ажиллах
              (үнэлгээ, олговор, төлөв) нь "Хээрийн судалгаа"-аас эхэлнэ. */}
          {isBeforeFieldStage && (
            <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              <Info className="mt-[1px] h-3 w-3 shrink-0" />
              <span>
                Одоо <strong>&quot;Шинэ&quot;</strong> төлөвт байна — нэгж
                талбарыг <strong>татах, давхардлыг арилгах</strong> шат.
                Үнэлгээ, нөхөх олговор, төлөв оруулах нь{" "}
                <strong>&quot;Хээрийн судалгаа&quot;</strong> төлөвөөс эхэлнэ.
              </span>
            </p>
          )}

          <div className="mt-3 flex w-full items-center gap-2" {...searchOnEnter(applySearch)}>
            <input
              type="text"
              placeholder="Дугаараар хайх"
              value={filterForm.parcel_id}
              onChange={(e) =>
                setFilterForm((f) => ({ ...f, parcel_id: e.target.value }))
              }
              className={`${inp} flex-[1.4] min-w-0`}
            />
            <input
              type="text"
              placeholder="Аймаг/Нийслэл"
              value={filterForm.au1_code}
              onChange={(e) =>
                setFilterForm((f) => ({ ...f, au1_code: e.target.value }))
              }
              className={`${inp} flex-1 min-w-0`}
            />
            <input
              type="text"
              placeholder="Сум/Дүүрэг"
              value={filterForm.au2_code}
              onChange={(e) =>
                setFilterForm((f) => ({ ...f, au2_code: e.target.value }))
              }
              className={`${inp} flex-1 min-w-0`}
            />
            <input
              type="text"
              placeholder="Баг/Хороо"
              value={filterForm.au3_code}
              onChange={(e) =>
                setFilterForm((f) => ({ ...f, au3_code: e.target.value }))
              }
              className={`${inp} flex-1 min-w-0`}
            />
            <select
              value={filterForm.right_type}
              onChange={(e) =>
                setFilterForm((f) => ({
                  ...f,
                  right_type: e.target.value ? Number(e.target.value) : 0,
                }))
              }
              className={`${inp} flex-[1.2] min-w-0`}
            >
              <option value="">Эрхийн төрөл</option>
              {RIGHT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Газрын зориулалт"
              value={filterForm.landuse}
              onChange={(e) =>
                setFilterForm((f) => ({ ...f, landuse: e.target.value }))
              }
              className={`${inp} flex-[1.4] min-w-0`}
            />
            {/* БАЙРШЛЫН давхардал — давхардалтай талбаруудыг шүүж олно.
                Давхардал арилтал чөлөөлөлт "Хээрийн судалгаа" төлөв рүү
                шилжихгүй тул эдгээрийг эрт олох нь чухал. */}
            <select
              value={filterForm.has_overlap}
              onChange={(e) =>
                setFilterForm((f) => ({ ...f, has_overlap: e.target.value }))
              }
              className={`${inp} flex-[1.2] min-w-0`}
            >
              <option value="">Давхардал (бүгд)</option>
              <option value="1">Зөвхөн давхардалтай</option>
              <option value="0">Зөвхөн давхардалгүй</option>
            </select>
            <select
              value={filterForm.status_id}
              onChange={(e) =>
                setFilterForm((f) => ({
                  ...f,
                  status_id: e.target.value ? Number(e.target.value) : 0,
                }))
              }
              className={`${inp} flex-[1.2] min-w-0`}
            >
              <option value="">Төлөв</option>
              {parcelStatuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <SearchButton onClick={applySearch} className="h-8 px-3" />
            <RefreshButton className="h-8 w-8" />
            {hasFilter && (
              <button
                onClick={() => {
                  setFilterForm(EMPTY_FILTER);
                  setFilter(EMPTY_FILTER);
                  setPage(1);
                }}
                className="h-8 shrink-0 px-3 rounded-lg text-[12px] font-medium text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252630] border border-slate-200 dark:border-white/[0.08] transition-colors"
              >
                Цэвэрлэх
              </button>
            )}
          </div>
        </div>

        {parcelsLoading ? (
          <div className="p-5 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-10 rounded bg-slate-100 dark:bg-[#252630]"
              />
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0">
                <SortableHeaderRow
                  columns={COLUMNS}
                  sort={sort}
                  onSort={applySort}
                  className="border-b border-slate-100 dark:border-[#37394d] bg-slate-50/80 dark:bg-[#1a1d20]"
                />
              </thead>
              <tbody>
                {visibleParcels.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500"
                    >
                      Нэгж талбар олдсонгүй
                    </td>
                  </tr>
                ) : visibleParcels.map((p) => {
                  const isOpen = expandedParcel === p.id;
                  const cashAmt = Number(p.cash_amount) || 0;
                  const landGrantAmt = Number(p.land_grant_amount) || 0;
                  const landGrantCount = Number(p.land_grant_count) || 0;
                  const locked = isMainProfOrg && isAcqLocked;
                  const detailHref = `/parcel/${p.id}?acq=${id}`;

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        onClick={(e) => {
                          if (locked) return;
                          // Дотор нь байгаа холбоос/товч өөрөө ажиллана; текст сонгож байвал шилжихгүй.
                          if ((e.target as HTMLElement).closest("a, button")) return;
                          if (window.getSelection()?.toString()) return;
                          if (e.metaKey || e.ctrlKey) {
                            window.open(detailHref, "_blank");
                            return;
                          }
                          notifyNavStart(undefined, detailHref);
                          router.push(detailHref);
                        }}
                        className={`border-b transition-colors ${locked ? "" : "cursor-pointer "}${
                          p.has_overlap
                            // БАЙРШЛЫН ДАВХАРДАЛ — мөр бүхэлдээ улаанаар
                            // тодрох ёстой: давхардалтай хэвээр "Хээрийн
                            // судалгаа" төлөв рүү шилжихгүй тул хэрэглэгч
                            // үүнийг АНЗААРАХ шаардлагатай.
                            ? "border-red-200 bg-red-50/70 hover:bg-red-50 dark:border-red-500/25 dark:bg-red-500/[0.07] dark:hover:bg-red-500/[0.12]"
                            : isOpen
                              ? "border-slate-100 bg-slate-50/80 dark:border-[#37394d] dark:bg-[#1a1d20]"
                              : "border-slate-100 hover:bg-slate-50/60 dark:border-[#37394d] dark:hover:bg-[#252630]"
                        }`}
                      >
                        <td className="pl-3 pr-1 py-2.5 w-8" />
                        <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-1.5">
                            {p.parcel_id}
                            {p.has_overlap && (
                              <span
                                title={`Байршлаар ${p.overlap_count ?? 1} нэгж талбартай давхцаж байна. Давхардлыг арилгах хүртэл "Хээрийн судалгаа" төлөвт шилжих боломжгүй.`}
                                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9.5px] font-bold text-red-600 dark:bg-red-500/20 dark:text-red-400"
                              >
                                <AlertCircle className="h-2.5 w-2.5" />
                                Давхардал{(p.overlap_count ?? 0) > 1 ? ` ${p.overlap_count}` : ""}
                              </span>
                            )}
                          </span>
                        </td>
                        {/* Өмчлөгч/эзэмшигч — ҮНДСЭН хүсэлт гаргагч. Нэг нэгж
                            талбар дээр олон эзэмшигч байж болох тул үлдсэнийг
                            "+N" гэж заана; урт нэр мөр дамжин бүтнээрээ харагдана. */}
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {p.holder_name ? (
                            <span className="flex items-start gap-1.5">
                              <span className="min-w-[120px] max-w-[220px] whitespace-normal break-words leading-snug">
                                {p.holder_name}
                              </span>
                              {(p.holder_count ?? 0) > 1 && (
                                <span
                                  title={`Нийт ${p.holder_count} эзэмшигч`}
                                  className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500 dark:bg-[#37394d] dark:text-slate-300"
                                >
                                  +{(p.holder_count ?? 1) - 1}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span
                              className="text-slate-300 dark:text-slate-600"
                              title="Эзэмшигчийн мэдээлэл ГУС-аас татагдаагүй"
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                          {/* Хаяг — аймаг/хот, сум/дүүрэг, баг/хорооны НЭР (au1/au2/au3.name),
                              дараа нь гудамж, хашаа. КОДЫГ харуулахгүй — хоосон хэсэг алгасагдана. */}
                          <span className="block min-w-[140px] max-w-[240px] break-words leading-snug">
                            {[p.au1_name, p.au2_name, p.au3_name, p.address_streetname, p.address_khashaa]
                              .map((v) => v?.trim())
                              .filter(Boolean)
                              .join(", ") || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {RIGHT_TYPE_OPTIONS.find(
                            (o) => o.value === p.right_type,
                          )?.label || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {/* Зориулалт — код | нэр (landuse_name). */}
                          {[p.landuse, p.landuse_name].map((v) => v?.trim()).filter(Boolean).join(" | ") || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">
                          <span className="font-semibold text-amber-500 dark:text-amber-400">
                            {areaNumber(p.acquisition_area_m2)}
                          </span>
                          /{areaNumber(p.area_m2)}
                          <span className="ml-0.5 text-slate-400 dark:text-slate-500">м²</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-1">
                            {cashAmt > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400 tabular-nums w-fit">
                                Мөнгөн&nbsp;{cashAmt.toLocaleString()}₮
                              </span>
                            )}
                            {landGrantCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400 w-fit">
                                Газраар{landGrantAmt > 0 ? <>&nbsp;{landGrantAmt.toLocaleString()}₮</> : <>&nbsp;{landGrantCount}</>}
                              </span>
                            )}
                            {cashAmt === 0 && landGrantCount === 0 && (
                              <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </div>
                          <div className="mt-1.5 border-t border-slate-100 pt-1.5 dark:border-white/[0.06]">
                            <CompensationPaymentBadge info={p} />
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {p.status_name ? (
                            <StatusLabel color={statusStyle(p.status_id ?? p.status).color} name={p.status_name} />
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                          {/* Мэрг. байгууллагад нөхөх олговрын үнэлгээний төлөвийг урсгал бүрээр харуулна */}
                          {isProfOrg && p.valuation_statuses && Object.keys(p.valuation_statuses).length > 0 && (
                            <div className="mt-1 flex flex-col gap-0.5">
                              {(Object.entries(p.valuation_statuses) as [ValuationType, ValuationStatus][]).map(([vt, vs]) => (
                                <span
                                  key={vt}
                                  className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${VAL_STATUS_CHIP[vs] ?? "bg-slate-100 text-slate-500"}`}
                                >
                                  {VALUATION_TYPE_LABELS[vt] ?? vt}: {VALUATION_STATUS_LABELS[vs] ?? vs}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {/* Дэлгэрэнгүй хуудастай ижил дүрэм: гадаад рольд харагдахгүй;
                              баталгаажсан чөлөөлөлт, эцсийн төлөвт идэвхгүй. */}
                          {!isExternal ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSyncTarget({ parcelUuid: p.id, parcelCode: p.parcel_id, rightType: p.right_type })
                              }
                              disabled={
                                syncTarget !== null || isAcqLocked || statusRules(p.status_id ?? p.status).is_final
                              }
                              title={
                                isAcqLocked
                                  ? "Чөлөөлөлт баталгаажсан тул мэдээлэл дуудах боломжгүй"
                                  : statusRules(p.status_id ?? p.status).is_final
                                    ? "Нэгж талбар эцсийн төлөвтэй тул мэдээлэл дуудах боломжгүй"
                                    : "Мэдээлэл дуудах"
                              }
                              aria-label="Мэдээлэл дуудах"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0acf97]/10 text-[#0acf97] transition-colors hover:bg-[#0acf97]/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#0acf97]/10"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {locked ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 px-2.5 py-1 text-[11px] font-medium cursor-not-allowed select-none">
                                🔒 Хаалттай
                              </span>
                            ) : (
                              <Link
                                prefetch={false}
                                href={detailHref}
                                onClick={notifyNavStart}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#02c0ce]/10 text-[#02c0ce] hover:bg-[#02c0ce]/20 px-2.5 py-1 text-[11px] font-medium transition-colors"
                              >
                                <Info className="h-3 w-3" /> Дэлгэрэнгүй
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {parcels && parcels.total_pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 dark:border-[#37394d]">
            <p className="text-[12px] text-slate-400 dark:text-slate-500">
              {(parcels.page - 1) * parcels.page_size + 1}–
              {Math.min(parcels.page * parcels.page_size, parcels.total)} / {parcels.total}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-slate-500 border border-slate-200 dark:border-[#37394d] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors"
              >
                Өмнөх
              </button>
              <span className="text-[12px] text-slate-500 px-2">
                {parcels.page} / {parcels.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(parcels.total_pages, p + 1))}
                disabled={page >= parcels.total_pages}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-slate-500 border border-slate-200 dark:border-[#37394d] disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors"
              >
                Дараах
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Нэгж талбар татах явцын цонх — 2 алхам тус тусдаа харагдана */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1f27] shadow-2xl border border-slate-100 dark:border-white/[0.06] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#37394d]">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    importError
                      ? "bg-red-500/10"
                      : importSucceeded
                        ? "bg-emerald-500/15"
                        : importCancelled
                          ? "bg-slate-500/10"
                          : "bg-blue-500/10"
                  }`}
                >
                  {importError ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : importSucceeded ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : importCancelled ? (
                    <X className="h-4 w-4 text-slate-400" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white leading-tight">
                    Нэгж талбар татах
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                    {importError
                      ? "Алдаа гарлаа — процесс зогслоо"
                      : importSucceeded
                        ? "Амжилттай дууслаа"
                        : importCancelled
                          ? "Цуцлагдлаа"
                          : "Татаж байна..."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setImportOpen(false)}
                disabled={importRunning}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252630] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-2.5 bg-slate-50/60 dark:bg-[#191b22] border-b border-slate-100 dark:border-[#37394d]">
              {/* 1-р алхам — нэгж талбарыг хилээр тодорхойлж бүртгэх */}
              <div className={`rounded-xl border p-3 transition-colors ${STEP_BOX[step1]}`}>
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${STEP_ICON_BG[step1]}`}
                  >
                    <StepIcon state={step1} index={1} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">
                      Нэгж талбарыг тодорхойлох
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      {step1 === "running"
                        ? "Чөлөөлөх хилээр ГУС-аас хайж байна..."
                        : step1 === "done" && discovery
                          ? `${discovery.total} нэгж талбар олдлоо · ${discovery.created} шинээр бүртгэгдлээ, ${discovery.existing} өмнө нь бүртгэгдсэн${discovery.skipped > 0 ? `, ${discovery.skipped} өөр чөлөөлөлтөд бүртгэлтэй` : ""}`
                          : step1 === "error"
                            ? "Тодорхойлж чадсангүй"
                            : "Хүлээгдэж байна"}
                    </p>
                  </div>
                </div>
              </div>

              {/* ТҮР ХААСАН: 2-р алхам (дэлгэрэнгүй мэдээлэл татах) идэвхгүй.
                  Эргэж идэвхжихэд доорх коммент хаалтыг авна. */}
              {/*
              <div className={`rounded-xl border p-3 transition-colors ${STEP_BOX[step2]}`}>
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${STEP_ICON_BG[step2]}`}
                  >
                    <StepIcon state={step2} index={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">
                      Дэлгэрэнгүй мэдээлэл татах
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      {step2 === "pending"
                        ? "Хүлээгдэж байна"
                        : step2 === "done"
                          ? `${syncOk} нэгж талбарын мэдээлэл шинэчлэгдлээ`
                          : step2 === "error"
                            ? "Татаж чадсангүй — процесс зогслоо"
                            : step2 === "cancelled"
                              ? `Цуцлагдлаа — ${syncOk} нэгж талбар шинэчлэгдсэн`
                              : syncTotal === 0
                                ? "Жагсаалт бэлдэж байна..."
                                : `${syncCurrent || "—"} дуудаж байна...`}
                    </p>
                  </div>
                </div>

                {step2 !== "pending" && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Явц
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                        {syncDone} / {syncTotal}
                        {syncTotal > 0 && ` · ${Math.round((syncDone / syncTotal) * 100)}%`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#2d2f3a] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          step2 === "error"
                            ? "bg-red-500"
                            : step2 === "done"
                              ? "bg-emerald-500"
                              : step2 === "cancelled"
                                ? "bg-slate-400"
                                : "bg-blue-500"
                        }`}
                        style={{ width: syncTotal > 0 ? `${(syncDone / syncTotal) * 100}%` : "0%" }}
                      />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[11px]">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                        Амжилттай: {syncOk}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                        Алдаатай: {syncFailed.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              */}
            </div>

            {importSucceeded && (
              <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50/70 dark:bg-emerald-500/[0.08]">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Нэгж талбар амжилттай бүртгэгдлээ
                </p>
              </div>
            )}

            {importError && (
              <div className="px-5 py-3 max-h-40 overflow-auto">
                <p className="text-[12px] text-red-500 break-all">{importError}</p>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Алдаа гарсан тул татах үйлдэл зогслоо.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-[#37394d]">
              {importRunning ? (
                <button
                  onClick={() => {
                    cancelRef.current = true;
                    setCancelRequested(true);
                  }}
                  disabled={cancelRequested}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium text-slate-500 border border-slate-200 dark:border-[#37394d] hover:bg-slate-50 dark:hover:bg-[#252630] disabled:opacity-50 transition-colors"
                >
                  {cancelRequested ? "Цуцалж байна..." : "Цуцлах"}
                </button>
              ) : (
                <button
                  onClick={() => setImportOpen(false)}
                  className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white bg-[#02c0ce] hover:bg-[#02aebb] transition-colors"
                >
                  Хаах
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {syncTarget && (
        <ParcelSyncDialog
          acqId={id}
          {...syncTarget}
          onClose={(finished) => {
            setSyncTarget(null);
            if (finished) queryClient.invalidateQueries({ queryKey: ["land-parcels", id] });
          }}
        />
      )}
      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        confirmColor={pendingConfirm?.confirmColor}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onClose={() => setPendingConfirm(null)}
      />
    </>
  );
}
