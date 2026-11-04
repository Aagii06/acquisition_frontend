"use client";

// «Мэдээлэл дуудах» — нэгж талбарын мэдээллийг ГУС/ХУР-аас алхам алхмаар
// татах баталгаажуулах цонх ба явцын цонх. Нэгж талбарын дэлгэрэнгүй
// (Ерөнхий мэдээлэл таб) болон нэгж талбарын жагсаалт хоёулаа ЭНИЙГ ашиглана.

import React, { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Database,
  BarChart2,
  Activity,
  Paperclip,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { landApi } from "@/lib/api";
import { getApiError } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type {
  ParcelDocumentSyncResult,
  ParcelHolderSyncResult,
  ParcelBasePrice,
  ParcelInvoiceSyncResult,
  ParcelFeeSyncResult,
  ParcelSyncCountResult,
} from "@/types";

// ГУС-ийн баримтын ҮҮРГИЙН код. Манай document_type.id-тай ХОЛИХГҮЙ —
// дугаарлалт нь огт өөр (ж: ГУС 11 = Кадастрын зураг, манай 11 = Нас барсны
// гэрчилгээ). Тиймээс татсан файлд document_type_id тавихгүй, ГУС-ийн нэрийг
// шууд хадгална.
const DOC = {
  application: "1",
  idCard: "2",
  cadastralMap: "11",
  pledgeContract: "64",
  contract: "52",
  landRightCert: "8",
  settlementAct: "101",
  auditConclusion: "71",
  landQualityAudit: "12",
  orderedAudit: "516",
} as const;

const SYNC_STEPS = [
  {
    key: "cadastral",
    label: "Кадастрын мэдээлэл",
    Icon: Database,
    color: "#3b82f6",
    subSteps: [
      {
        label: "Нэгж талбарын дэлгэрэнгүй",
        detail: "Кадастрын системээс нэгж талбарын мэдээлэл татаж байна...",
      },
      {
        label: "Иргэн, хуулийн этгээдийн мэдээлэл",
        detail: "Эзэмшигчийн мэдээлэл татаж байна...",
      },
      { label: "Өргөдөл", detail: "Өргөдлийн хавсралт татаж байна..." },
      {
        label: "Иргэний үнэмлэх, ААН-ийн гэрчилгээ",
        detail: "Иргэний үнэмлэх, гэрчилгээ татаж байна...",
      },
      { label: "Кадастрын зураг", detail: "Кадастрын зураг татаж байна..." },
      { label: "Гэрээ", detail: "Гэрээ татаж байна..." },
      {
        label: "Газар эзэмших эрхийн гэрчилгээ",
        detail: "Эрхийн гэрчилгээ татаж байна...",
      },
    ],
  },
  {
    key: "valuation",
    label: "Газрын төлбөр үнэлгээний мэдээлэл",
    Icon: BarChart2,
    color: "#f59e0b",
    subSteps: [
      {
        label: "Газрын суурь үнийн мэдээлэл",
        detail: "Газрын суурь үнэ татаж байна...",
      },
      {
        label: "Төлбөрийн мэдээлэл",
        detail: "Газрын төлбөрийн мэдээлэл татаж байна...",
      },
      {
        label: "Газрын төлбөрийн бодолт",
        detail: "Газрын төлбөрийн бодолт татаж байна...",
      },
      {
        label: "Барьцааны мэдээлэл",
        detail: "Барьцааны бүртгэл татаж байна...",
      },
      {
        label: "Шүүхийн шийдвэрийн мэдээлэл",
        detail: "Шүүхийн шийдвэр татаж байна...",
      },
      {
        label: "Барьцааны гэрээний хавсралт",
        detail: "Барьцааны гэрээ татаж байна...",
      },
      {
        label: "Тооцоо нийлсэн акт",
        detail: "Тооцоо нийлсэн акт татаж байна...",
      },
    ],
  },
  {
    key: "monitoring",
    label: "Мониторингийн мэдээлэл",
    Icon: Activity,
    color: "#10b981",
    subSteps: [
      {
        label: "Хянан баталгааны мэдээлэл",
        detail: "Хянан баталгааны мэдээлэл татаж байна...",
      },
      {
        label: "Хянан баталгааны дүгнэлт хавсралт",
        detail: "Хянан баталгааны дүгнэлт хавсралт татаж байна...",
      },
      {
        label: "Газрын төлөв байдал, чанарын хянан баталгааны дүгнэлт хавсралт",
        detail: "Чанарын хянан баталгааны дүгнэлт хавсралт татаж байна...",
      },
      {
        label: "Захиалгат хянан баталгааны дүгнэлт хавсралт",
        detail: "Захиалгат хянан баталгааны дүгнэлт хавсралт татаж байна...",
      },
    ],
  },
  {
    key: "other",
    label: "Бусад мэдээлэл, хавсралт",
    Icon: Paperclip,
    color: "#8b5cf6",
    subSteps: [
      // УБЕГ-ийн өмчлөлийн бүртгэл нь ГУС-аас БИШ, ХУР (XYP) гарцаас татагдана.
      {
        label: "УБЕГ-ийн өмчлөлийн бүртгэл",
        detail: "УБЕГ-аас газар өмчлөлийн мэдээлэл татаж байна...",
      },
      // Кодгүй дуудна — үлдсэн БҮХ хавсралтыг хамарна. Дээрх алхмуудад
      // татагдсан нь source_doc_id-аар алгасагдах тул ЗААВАЛ хамгийн сүүлд.
      {
        label: "Үлдсэн хавсралтууд",
        detail: "Бусад хавсралтыг татаж байна...",
      },
    ],
  },
] as const;

/** Өмчлөлийн газар тул ГУС руу хандалгүй алгасагдсан алхмын sentinel. */
const OWNED_NO_PAYMENT = { owned_no_payment: true } as const;
const RIGHT_TYPE_OWNERSHIP = 3;

/**
 * Алхмын үр дүнг хүн уншихаар текст болгоно.
 *
 * Хавсралт татах алхам нь ParcelDocumentSyncResult буцаадаг — татах нь ЗӨВХӨН
 * НЭМЭХ үйлдэл тул дахин дарахад `saved: 0, skipped: N` болно.
 * Эзэмшигчийн алхам ParcelHolderSyncResult буцаана. Бусад нь тодорхойгүй.
 */
function describeSyncResult(result: unknown): string {
  const r = result as
    | Partial<
        ParcelDocumentSyncResult &
          ParcelHolderSyncResult &
          ParcelBasePrice &
          ParcelInvoiceSyncResult &
          ParcelFeeSyncResult &
          ParcelSyncCountResult &
          typeof OWNED_NO_PAYMENT
      >
    | undefined;
  if (!r) return "";
  if (r.owned_no_payment) return "Өмчлөлийн газар — төлбөр байхгүй";
  // Газрын суурь үнэ — тоо биш, дүнгээ шууд харуулна
  if (typeof r.base_price === "number") {
    if (r.base_price <= 0) return "Олдоогүй";
    const factors = r.factor_values?.length ?? 0;
    return factors > 0
      ? `${r.base_price.toLocaleString()}₮/га · ${factors} хүчин зүйл`
      : `${r.base_price.toLocaleString()}₮/га`;
  }
  // Газрын төлбөрийн бодолт — status=false бол ГУС бодож чадаагүй (алдаа биш)
  if (typeof r.total_payment === "number") {
    if (r.status === false) return r.msg || "Төлбөр бодогдсонгүй";
    return r.found
      ? `${r.found} бүс · ${r.total_payment.toLocaleString()}₮`
      : "Олдоогүй";
  }
  if (typeof r.found !== "number") return "";
  if (r.found === 0) return "Олдоогүй";
  if ((r.saved ?? 0) > 0) return `${r.saved} шинэ бичлэг татагдлаа`;
  if (Array.isArray(r.invoices)) return `${r.found} нэхэмжлэл`;
  return `${r.found} бичлэг — өмнө нь татагдсан`;
}

const SUB_STEP_MIN_MS = 400;

const TOTAL_SUB_STEPS = SYNC_STEPS.reduce(
  (s, step) => s + step.subSteps.length,
  0,
);

/**
 * Mount хийхэд баталгаажуулах цонх (10 сек тоолуур) нээгдэнэ; зөвшөөрвөл
 * татаж эхэлж, явцыг харуулна. `onClose(finished)` — `finished` нь татах
 * үйлдэл дуусч хаагдсан эсэх (цуцалсан бол false).
 */
export function ParcelSyncDialog({
  acqId,
  parcelUuid,
  parcelCode,
  rightType,
  onClose,
}: {
  acqId: string;
  /** parcel.id (UUID) */
  parcelUuid: string;
  /** Нэгж талбарын дугаар (parcel.parcel_id) */
  parcelCode: string;
  rightType?: number | null;
  onClose: (finished: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(true);
  const [confirmCountdown, setConfirmCountdown] = useState(10);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncCurrentStepIdx, setSyncCurrentStepIdx] = useState(-1);
  const [syncCurrentSubStepIdx, setSyncCurrentSubStepIdx] = useState(-1);
  const [syncDoneSubSteps, setSyncDoneSubSteps] = useState<string[]>([]);
  const [syncFailedSubSteps, setSyncFailedSubSteps] = useState<string[]>([]);
  // Алхам бүрийн серверийн алдааны мессеж (монголоор ирнэ) — subKey → текст
  const [syncFailMessages, setSyncFailMessages] = useState<
    Record<string, string>
  >({});
  // Амжилттай алхмын үр дүн (subKey → текст). Өмнө нь API-ийн хариуг хаядаг байсан.
  const [syncResults, setSyncResults] = useState<Record<string, string>>({});
  const [syncDoneSteps, setSyncDoneSteps] = useState<number[]>([]);
  const [syncDetail, setSyncDetail] = useState("");
  const [syncFinished, setSyncFinished] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const startSync = useCallback(async () => {
    if (!acqId || !parcelCode) return;
    setSyncOpen(true);
    setSyncRunning(true);
    setSyncCurrentStepIdx(0);
    setSyncCurrentSubStepIdx(0);
    setSyncDoneSubSteps([]);
    setSyncFailedSubSteps([]);
    setSyncFailMessages({});
    setSyncResults({});
    setSyncDoneSteps([]);
    setSyncDetail(SYNC_STEPS[0].subSteps[0].detail);
    setSyncFinished(false);
    setSyncError(null);

    // Дэд алхам 6-аас 15 болсон тул 1500ms үед хамгийн багадаа ~22 сек болно.
    const minDelay = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms));

    // API function for each sub-step [stepIdx][subStepIdx]
    // Бүх дуудалт silent — явцыг ЭНЭ цонх өөрөө харуулна. Дэлгэц блоклогч
    // "Уншиж байна..." loader асвал 15 хүсэлт дээр анивчиж, унших боломжгүй болно.
    const SILENT = { silent: true };
    const docs =
      (...roles: string[]) =>
      () =>
        landApi.syncParcelDocuments(acqId, parcelCode, roles, SILENT);
    const apiFns: (() => Promise<unknown>)[][] = [
      [
        () => landApi.syncParcel(acqId, parcelCode, SILENT),
        () => landApi.syncParcelHolders(acqId, parcelCode, SILENT),
        docs(DOC.application),
        docs(DOC.idCard),
        docs(DOC.cadastralMap),
        docs(DOC.contract),
        docs(DOC.landRightCert),
      ],
      [
        () => landApi.syncParcelBasePrice(acqId, parcelCode, SILENT),
        () => landApi.syncParcelInvoices(acqId, parcelCode, SILENT),
        // Өмчлөлийн газарт (right_type=3) төлбөр байдаггүй — ГУС руу огт
        // хандахгүй, алхмыг тайлбартай "амжилттай" гэж дүгнэнэ.
        () =>
          rightType === RIGHT_TYPE_OWNERSHIP
            ? Promise.resolve(OWNED_NO_PAYMENT)
            : landApi.syncParcelFee(acqId, parcelCode, SILENT),
        () => landApi.syncParcelMortgages(acqId, parcelCode, SILENT),
        () => landApi.syncParcelCourtDecisions(acqId, parcelCode, SILENT),
        docs(DOC.pledgeContract),
        docs(DOC.settlementAct),
      ],
      [
        () => landApi.syncParcelMonitorings(acqId, parcelCode, SILENT),
        docs(DOC.auditConclusion),
        docs(DOC.landQualityAudit),
        docs(DOC.orderedAudit),
      ],
      [
        // УБЕГ (ХУР/XYP) — нэгж талбарын дугаараар шууд, app_no шаардахгүй
        () => landApi.syncParcelOwnerships(acqId, parcelCode, SILENT),
        // Кодгүй — үлдсэн бүх хавсралт
        () => landApi.syncParcelDocuments(acqId, parcelCode, undefined, SILENT),
      ],
    ];

    let failCount = 0;
    for (let si = 0; si < SYNC_STEPS.length; si++) {
      const step = SYNC_STEPS[si];
      for (let ssi = 0; ssi < step.subSteps.length; ssi++) {
        setSyncCurrentStepIdx(si);
        setSyncCurrentSubStepIdx(ssi);
        setSyncDetail(step.subSteps[ssi].detail);
        const subKey = `${si}-${ssi}`;
        try {
          const [result] = await Promise.all([
            apiFns[si][ssi](),
            minDelay(SUB_STEP_MIN_MS),
          ]);
          setSyncDoneSubSteps((prev) => [...prev, subKey]);
          const text = describeSyncResult(result);
          if (text) setSyncResults((prev) => ({ ...prev, [subKey]: text }));
        } catch (err) {
          // Дуудсан axios хүсэлт interceptor-оороо аль хэдийн логлогдсон —
          // энд синхрончлолын алхмын context-ыг (аль алхам амжилтгүй болсон) нэмж логлоно.
          logger.error("parcel sync sub-step failed", {
            step: si,
            subStep: ssi,
            key: subKey,
            error: String(err),
          });
          failCount++;
          setSyncFailedSubSteps((prev) => [...prev, subKey]);
          // Серверийн мессеж монголоор ирдэг тул шууд харуулна. 422 = нэгж
          // талбарт app_no байхгүй — эхлээд ерөнхий мэдээллийг татах хэрэгтэй.
          const status = (err as { response?: { status?: number } })?.response
            ?.status;
          const message = getApiError(err, "Татаж чадсангүй");
          setSyncFailMessages((prev) => ({
            ...prev,
            [subKey]:
              status === 422
                ? `${message} — эхлээд "Нэгж талбарын ерөнхий мэдээлэл"-ийг амжилттай татна уу.`
                : message,
          }));
        }
      }
      setSyncDoneSteps((prev) => [...prev, si]);
    }

    setSyncRunning(false);
    setSyncFinished(true);
    setSyncDetail(
      failCount > 0
        ? `${failCount} мэдээлэл татаж авах амжилтгүй боллоо`
        : "Бүх мэдээлэл амжилттай татагдлаа!",
    );
    queryClient.invalidateQueries({
      queryKey: ["parcel-full", acqId, parcelUuid],
    });
    queryClient.invalidateQueries({ queryKey: ["land", acqId] });
    // Хавсралт татагдсан байж болзошгүй тул "Хавсралт" табын жагсаалтыг ч шинэчилнэ
    queryClient.invalidateQueries({
      queryKey: ["parcel-documents", parcelUuid],
    });
  }, [acqId, parcelCode, rightType, parcelUuid, queryClient]);

  const handleSyncClose = useCallback(() => {
    if (syncRunning) return;
    setSyncOpen(false);
    onClose(syncFinished);
  }, [syncRunning, syncFinished, onClose]);

  useEffect(() => {
    if (!confirmOpen) return;
    setConfirmCountdown(10);
    const interval = setInterval(() => {
      setConfirmCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [confirmOpen]);

  // Хугацаа дуусвал цуцлагдана.
  useEffect(() => {
    if (confirmOpen && confirmCountdown === 0) onClose(false);
  }, [confirmOpen, confirmCountdown, onClose]);

  return (
    <>
      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e1f27] shadow-2xl border border-slate-100 dark:border-white/[0.06] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Icon + title */}
            <div className="flex flex-col items-center px-6 pt-7 pb-5 text-center">
              <div className="relative mb-4">
                {/* Countdown ring */}
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 44 44">
                  <circle
                    cx="22"
                    cy="22"
                    r="19"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-slate-100 dark:text-[#2d2f3a]"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="19"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="text-[#0acf97] transition-all duration-1000 ease-linear"
                    strokeDasharray={`${2 * Math.PI * 19}`}
                    strokeDashoffset={`${2 * Math.PI * 19 * (1 - confirmCountdown / 10)}`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[18px] font-bold tabular-nums text-slate-700 dark:text-white leading-none">
                    {confirmCountdown}
                  </span>
                </div>
              </div>

              <p className="text-[15px] font-semibold text-slate-800 dark:text-white mb-1.5">
                Нэгж талбарын мэдээлэл дуудах уу?
              </p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Кадастрын системээс нэгж талбарын мэдээлэл шинэчлэн татаж авах
                болно. Одоогийн мэдээлэл шинэчлэгдэнэ.
              </p>
              <p className="mt-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {confirmCountdown} секундын дараа автоматаар цуцлагдана
              </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 dark:bg-[#37394d]" />

            {/* Buttons */}
            <div className="flex">
              <button
                onClick={() => onClose(false)}
                className="flex-1 py-3.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#252630] transition-colors border-r border-slate-100 dark:border-[#37394d]"
              >
                Болих
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  startSync();
                }}
                className="flex-1 py-3.5 text-[13px] font-semibold text-[#0acf97] hover:bg-[#0acf97]/5 transition-colors"
              >
                Тийм, дуудах
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync progress modal */}
      {syncOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          {/* Толгой ба хөл нь тогтмол, зөвхөн алхмуудын хэсэг гүйнэ —
              14 дэд алхамтай болсон тул цонх дэлгэцээс гарахгүй байх ёстой. */}
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#1e1f27] shadow-2xl border border-slate-100 dark:border-white/[0.06] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#37394d]">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-300 ${syncFinished ? "bg-emerald-500/15" : syncError ? "bg-red-500/10" : "bg-blue-500/10"}`}
                >
                  {syncFinished ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : syncError ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-white leading-tight">
                    Нэгж талбарын мэдээлэл дуудах
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                    {syncFinished
                      ? "Амжилттай дууслаа"
                      : syncError
                        ? "Алдаа гарлаа"
                        : "Боловсруулж байна..."}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSyncClose}
                disabled={syncRunning}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252630] hover:text-slate-600 dark:hover:text-slate-200 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="px-5 py-3 bg-slate-50/60 dark:bg-[#191b22] border-b border-slate-100 dark:border-[#37394d]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Нийт явц
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  {syncDoneSubSteps.length} / {TOTAL_SUB_STEPS}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#2d2f3a] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${syncError ? "bg-red-500" : syncFinished ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{
                    width: `${(syncDoneSubSteps.length / TOTAL_SUB_STEPS) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {SYNC_STEPS.map((step, si) => {
                const StepIcon = step.Icon;
                const isDone = syncDoneSteps.includes(si);
                const isRunning = !isDone && syncCurrentStepIdx === si;
                const isPending = syncCurrentStepIdx < si && !isDone;

                return (
                  <div key={step.key}>
                    {/* Main step row */}
                    <div className="flex items-center gap-3 mb-2.5">
                      <div
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-500 ${
                          isDone
                            ? "shadow-sm"
                            : isRunning
                              ? "shadow-md ring-2"
                              : "border-2 border-dashed border-slate-200 dark:border-[#37394d]"
                        }`}
                        style={
                          isDone
                            ? { background: step.color }
                            : isRunning
                              ? {
                                  background: step.color + "20",
                                  boxShadow: `0 0 0 2px ${step.color}50`,
                                }
                              : {}
                        }
                      >
                        {isDone ? (
                          <Check
                            className="h-3.5 w-3.5 text-white"
                            strokeWidth={3}
                          />
                        ) : isRunning ? (
                          <>
                            <StepIcon
                              className="h-3.5 w-3.5"
                              style={{ color: step.color }}
                            />
                            <span
                              className="absolute inset-0 rounded-xl animate-ping opacity-30"
                              style={{ background: step.color }}
                            />
                          </>
                        ) : (
                          <span className="text-[12px] font-bold text-slate-300 dark:text-slate-600">
                            {si + 1}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                        <span
                          className={`text-[13px] font-semibold transition-colors duration-300 truncate ${
                            isPending
                              ? "text-slate-300 dark:text-slate-600"
                              : "text-slate-700 dark:text-slate-200"
                          }`}
                          style={isRunning ? { color: step.color } : {}}
                        >
                          {step.label}
                        </span>
                        {isDone && (
                          <span
                            className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: step.color + "18",
                              color: step.color,
                            }}
                          >
                            Дууссан
                          </span>
                        )}
                        {isRunning && (
                          <span
                            className="shrink-0 text-[10px] font-medium animate-pulse"
                            style={{ color: step.color }}
                          >
                            Боловсруулж байна
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sub-steps */}
                    <div className="ml-4 pl-7 border-l-2 border-dashed border-slate-100 dark:border-[#2d2f3a] space-y-2">
                      {step.subSteps.map((subStep, ssi) => {
                        const subKey = `${si}-${ssi}`;
                        const subDone = syncDoneSubSteps.includes(subKey);
                        const subFailed = syncFailedSubSteps.includes(subKey);
                        const subRunning =
                          !subDone &&
                          !subFailed &&
                          syncCurrentStepIdx === si &&
                          syncCurrentSubStepIdx === ssi;

                        return (
                          <div key={ssi} className="flex items-center gap-2.5">
                            <div
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300"
                              style={
                                subDone
                                  ? { background: step.color }
                                  : subFailed
                                    ? { background: "#ef4444" }
                                    : subRunning
                                      ? { border: `2px solid ${step.color}60` }
                                      : { border: "1.5px dashed #cbd5e1" }
                              }
                            >
                              {subDone && (
                                <Check
                                  className="h-2.5 w-2.5 text-white"
                                  strokeWidth={3}
                                />
                              )}
                              {subFailed && (
                                <X
                                  className="h-2.5 w-2.5 text-white"
                                  strokeWidth={3}
                                />
                              )}
                              {subRunning && (
                                <span
                                  className="h-2 w-2 rounded-full animate-ping"
                                  style={{ background: step.color }}
                                />
                              )}
                            </div>
                            <span
                              className={`min-w-0 truncate text-[12px] transition-colors duration-300 ${
                                subDone
                                  ? "text-slate-600 dark:text-slate-300"
                                  : subFailed
                                    ? "text-red-400 dark:text-red-400"
                                    : subRunning
                                      ? "font-medium"
                                      : "text-slate-300 dark:text-slate-600"
                              }`}
                              style={subRunning ? { color: step.color } : {}}
                            >
                              {subStep.label}
                            </span>
                            {/* Үр дүн/алдааг ШИНЭ МӨРӨНД биш, мөрийн БАРУУН ТАЛД
                                нэг мөрөнд харуулна — цонх хэт өндөр болохгүйн тулд. */}
                            {subFailed && (
                              <span
                                className="ml-auto shrink-0 truncate text-right text-[10.5px] font-medium text-red-400 dark:text-red-400"
                                title={syncFailMessages[subKey]}
                              >
                                {syncFailMessages[subKey] || "Амжилтгүй"}
                              </span>
                            )}
                            {subDone && syncResults[subKey] && (
                              <span
                                className={`ml-auto shrink-0 truncate text-right text-[10.5px] font-medium ${
                                  syncResults[subKey] === "Олдоогүй"
                                    ? "text-slate-400 dark:text-slate-500"
                                    : "text-emerald-600 dark:text-emerald-400"
                                }`}
                                title={syncResults[subKey]}
                              >
                                {syncResults[subKey]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50/60 dark:bg-[#191b22] border-t border-slate-100 dark:border-[#37394d]">
              {syncError ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-red-500 min-w-0">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p className="text-[12px] truncate">{syncError}</p>
                  </div>
                  <button
                    onClick={handleSyncClose}
                    className="shrink-0 h-8 px-4 rounded-lg bg-slate-200 dark:bg-[#2d2f3a] text-slate-700 dark:text-slate-200 text-[12px] font-semibold hover:bg-slate-300 dark:hover:bg-[#383a47] transition-colors"
                  >
                    Хаах
                  </button>
                </div>
              ) : syncFinished ? (
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`flex items-center gap-2 min-w-0 ${syncFailedSubSteps.length > 0 ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}
                  >
                    {syncFailedSubSteps.length > 0 ? (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                    <p className="text-[12px] font-medium truncate">
                      {syncDetail}
                    </p>
                  </div>
                  <button
                    onClick={handleSyncClose}
                    className={`shrink-0 h-8 px-4 rounded-lg text-white text-[12px] font-semibold transition-colors ${syncFailedSubSteps.length > 0 ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"}`}
                  >
                    Дуусгах
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                      style={{
                        background:
                          syncCurrentStepIdx >= 0
                            ? SYNC_STEPS[syncCurrentStepIdx].color
                            : "#3b82f6",
                      }}
                    />
                    <span
                      className="relative inline-flex h-3 w-3 rounded-full"
                      style={{
                        background:
                          syncCurrentStepIdx >= 0
                            ? SYNC_STEPS[syncCurrentStepIdx].color
                            : "#3b82f6",
                      }}
                    />
                  </span>
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 truncate">
                    {syncDetail || "Бэлтгэж байна..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
