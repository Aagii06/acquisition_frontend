"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { landApi } from "@/lib/api";
import { profApi } from "@/lib/prof-api";
import {
  RIGHT_TYPE_LABELS,
  type AU,
  type LandValuation,
} from "@/types";
import { formatDate, formatArea, getApiError } from "@/lib/utils";
import {
  RefreshCw,
  Calculator,
  Activity,
  AlertCircle,
  MapPin,
  History,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import {
  canPrintParcelTrace,
  isExternalSpecialRole,
  shouldUseProfessionalOrgApi,
} from "@/lib/role-utils";
import { layerTextToWkt } from "@/lib/geometry-utils";
import { Switch } from "@/components/ui/switch";
import { EstimatedValueDialog } from "./estimated_value_dialog";
import { EstimatedValueHistoryDialog } from "./estimated_value_history_dialog";
import { ParcelSyncDialog } from "../../_components/parcel_sync_dialog";

const ParcelMap = dynamic(
  () => import("@/components/map/parcel-map").then((m) => m.ParcelMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] rounded-xl bg-slate-100 dark:bg-[#252630] animate-pulse" />
    ),
  },
);

// Трас зураг — canvas/pdf-lib ашигладаг тул зөвхөн нээхэд ачаална.
const TracePrintDialog = dynamic(
  () => import("@/components/map/trace-print-dialog"),
  {
    ssr: false,
  },
);

function findAdminUnit(
  aus: AU[] | null | undefined,
  au1Code: string,
  au2Code: string,
  au3Code: string,
) {
  return aus?.find(
    (au) =>
      au.au1_code === au1Code &&
      au.au2_code === au2Code &&
      au.au3_code === au3Code,
  );
}

function formatAdminUnit(name: string | undefined, code: string) {
  return name ? `${name} (${code})` : code;
}

function highlightArea(value: string) {
  return (
    <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
      {value}
    </span>
  );
}

export function GeneralTab({
  acqId,
  parcelId,
  isLocked = false,
}: {
  acqId: string;
  parcelId: string;
  isLocked?: boolean;
}) {
  const queryClient = useQueryClient();
  const isExternal = isExternalSpecialRole();
  const useProfApi = shouldUseProfessionalOrgApi();
  // Мэргэжлийн байгууллага бол /prof маршрутаар уншина
  const { data, isLoading } = useQuery({
    queryKey: ["parcel-full", acqId, parcelId],
    queryFn: () =>
      useProfApi
        ? profApi.profGetParcel(acqId, parcelId)
        : landApi.getParcel(acqId, parcelId),
    enabled: !!acqId,
  });
  const { data: acquisition } = useQuery({
    queryKey: ["land", acqId],
    queryFn: () =>
      useProfApi ? profApi.profGetAcquisition(acqId) : landApi.getById(acqId),
    enabled: !!acqId,
  });
  // Өмчлөх эрхийн гэрчилгээ — нөхөх олговрын хэсэгт (real_estate_tab) харуулдаг
  // land_valuation.ownership_cert_no-г ерөнхий мэдээлэл дээр ч давхар харуулна.
  // Тэндхийг өөрчлөхгүй — ижил query түлхүүр тул нэмэлт хүсэлт үүсэхгүй.
  const parcelCode = data?.parcel_id ?? "";
  const valuationType = data?.selected_valuation_type ?? "asset";
  const { data: landValuation } = useQuery<LandValuation | null>({
    queryKey: ["land-valuation", acqId, parcelCode, valuationType],
    queryFn: () =>
      useProfApi
        ? profApi.profGetLandValuation(acqId, parcelCode, valuationType)
        : landApi.getLandValuation(acqId, parcelCode, valuationType),
    enabled: !!acqId && !!parcelCode,
  });
  const [editingMeta, setEditingMeta] = useState(false);
  const [dbChanged, setDbChanged] = useState("");
  const [changedParcelId, setChangedParcelId] = useState("");
  const [acquisitionAreaM2, setAcquisitionAreaM2] = useState<string>("");
  const [acquisitionGeomWkt, setAcquisitionGeomWkt] = useState("");
  const [areaAutoCalc, setAreaAutoCalc] = useState(false);

  useEffect(() => {
    if (data) {
      setDbChanged(data.db_changed ?? "");
      setChangedParcelId(data.changed_parcel_id ?? "");
      setAcquisitionAreaM2(String(data.acquisition_area_m2 ?? ""));
      setAcquisitionGeomWkt(data.acquisition_geom_wkt ?? "");
      setAreaAutoCalc(false);
    }
  }, [data]);

  // Талбайг СЕРВЕР бодно (ГУС-тай ижил UTM арга). Browser дээр тооцвол нэгж
  // талбар татахад бичигдсэн тооноос зөрнө — тэр нь өмнөх алдааны эх үүсвэр.
  const [areaCalcBusy, setAreaCalcBusy] = useState(false);
  const calcArea = useCallback(async (wkt: string): Promise<number | null> => {
    try {
      return await landApi.computeGeometryArea(wkt);
    } catch {
      return null;
    }
  }, []);

  const handleAutoCalcArea = useCallback(async () => {
    if (!acquisitionGeomWkt.trim() || areaCalcBusy) return;
    setAreaCalcBusy(true);
    try {
      const calc = await calcArea(acquisitionGeomWkt);
      if (calc != null) {
        setAcquisitionAreaM2(String(calc));
        setAreaAutoCalc(true);
        toast.success("Талбай тооцоологдлоо");
      } else {
        toast.error("Геометриас талбай тооцоолох боломжгүй");
      }
    } finally {
      setAreaCalcBusy(false);
    }
  }, [acquisitionGeomWkt, areaCalcBusy, calcArea]);

  const handleBoundaryLayerFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const wkt = layerTextToWkt(text);
      if (!wkt) {
        toast.error("WKT эсвэл GeoJSON polygon файл оруулна уу");
        return;
      }

      setAcquisitionGeomWkt(wkt);
      const calc = await calcArea(wkt);
      if (calc != null) {
        setAcquisitionAreaM2(String(calc));
        setAreaAutoCalc(true);
        toast.success("Давхардсан хил оруулж, талбай тооцоологдлоо");
      } else {
        setAreaAutoCalc(false);
        toast.success("Давхардсан хил орууллаа");
      }
    },
    [calcArea],
  );

  // ── ТӨСӨӨЛЛИЙН ҮНЭЛГЭЭ ────────────────────────────────────────────────
  // Итгэлцүүрийг өөрчилж тооцно; мэргэжлийн байгууллагад зөвхөн харагдана
  // (backend-ийн PATCH маршрут нь land:update шаарддаг).
  const [estOpen, setEstOpen] = useState(false);
  // Өөрчлөлтийн түүх — "Дэлгэрэнгүй" товчоор нээгдэнэ (дуудлага зөвхөн тэр үед).
  const [estHistoryOpen, setEstHistoryOpen] = useState(false);

  // confidencePercent: тоо = итгэлцүүртэй, undefined = итгэлцүүргүй (өмчлөх
  // эрхийн газар), null = үнэлгээг АРИЛГАХ. "Итгэлцүүргүй" ба "арилгах" хоёрыг
  // хольж болохгүй — тиймээс null-ыг тусад нь шалгана (== биш ===).
  const estimatedMutation = useMutation({
    mutationFn: ({
      confidencePercent,
      baseFeePerM2,
      file,
    }: {
      confidencePercent: number | null | undefined;
      baseFeePerM2?: number;
      file?: File | null;
    }) =>
      confidencePercent === null
        ? landApi.setParcelEstimatedValue(acqId, parcelId, null)
        : landApi.calculateParcelEstimatedValue(
            acqId,
            parcelId,
            confidencePercent,
            baseFeePerM2,
            file,
          ),
    onSuccess: (_r, { confidencePercent }) => {
      toast.success(
        confidencePercent === null
          ? "Төсөөллийн үнэлгээ арилгагдлаа"
          : "Төсөөллийн үнэлгээ хадгалагдлаа",
      );
      queryClient.invalidateQueries({
        queryKey: ["parcel-full", acqId, parcelId],
      });
      queryClient.invalidateQueries({
        queryKey: ["parcel-estimated-value-history", acqId, parcelId],
      });
      setEstOpen(false);
    },
    onError: (err) => toast.error(getApiError(err, "Хадгалахад алдаа гарлаа")),
  });

  const metaMutation = useMutation({
    mutationFn: () => {
      const areaVal = parseFloat(acquisitionAreaM2);
      return landApi.updateParcelMeta(
        acqId,
        parcelId,
        dbChanged,
        changedParcelId,
        isNaN(areaVal) ? undefined : areaVal,
        acquisitionGeomWkt.trim() || undefined,
      );
    },
    onSuccess: () => {
      toast.success("Мэдээлэл хадгалагдлаа");
      queryClient.invalidateQueries({
        queryKey: ["parcel-full", acqId, parcelId],
      });
      setEditingMeta(false);
      setAreaAutoCalc(false);
    },
    onError: (err) => toast.error(getApiError(err, "Хадгалахад алдаа гарлаа")),
  });

  const monitoringSyncMutation = useMutation({
    mutationFn: () => {
      if (!data?.parcel_id) throw new Error("Нэгж талбарын дугаар олдсонгүй");
      return landApi.syncParcelMonitorings(acqId, data.parcel_id);
    },
    onSuccess: () => {
      toast.success("Хянан баталгааны мэдээлэл шинэчлэгдлээ");
      queryClient.invalidateQueries({
        queryKey: ["parcel-full", acqId, parcelId],
      });
    },
    onError: (err) =>
      toast.error(
        getApiError(err, "Хянан баталгааны мэдээлэл шинэчлэхэд алдаа гарлаа"),
      ),
  });

  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  // Давхардсан нэгж талбаруудыг "Байршил"-ын газрын зураг дээр давхцуулж харуулах эсэх.
  const [showOverlaps, setShowOverlaps] = useState(false);
  // Трас зураг — жижиг зураг нь "Байршил" газрын зурагт АСААЛТТАЙ давхаргуудаар
  const [traceOpen, setTraceOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState<string[] | null>(null);

  const row = (label: string, value?: React.ReactNode) => (
    <div
      key={label}
      className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d] last:border-0"
    >
      <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44">
        {label}
      </span>
      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
        {value || "—"}
      </span>
    </div>
  );

  if (isLoading)
    return (
      <div className="ap-card p-5 animate-pulse space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-8 rounded bg-slate-100 dark:bg-[#252630]" />
        ))}
      </div>
    );
  if (!data)
    return (
      <div className="ap-card p-10 text-center text-[13px] text-slate-400">
        Мэдээлэл олдсонгүй
      </div>
    );

  const adminUnit = findAdminUnit(
    acquisition?.aus,
    data.au1_code,
    data.au2_code,
    data.au3_code,
  );
  const monitorings = data.monitorings ?? [];
  const overlaps = data.overlaps ?? [];
  const canPrintTrace = canPrintParcelTrace(acquisition);

  return (
    <div className="flex flex-col gap-5">
      {/*
        БАЙРШЛЫН ДАВХАРДЛЫН АНХААРУУЛГА.
        Хамгийн ДЭЭР, улаанаар: нэг газарт хоёр нэгж талбар бүртгэгдсэн бол
        нөхөх олговор хоёр удаа бодогдох эрсдэлтэй. Давхардал арилтал
        чөлөөлөлт "Хээрийн судалгаа" төлөв рүү шилжихгүй тул хэрэглэгч үүнийг
        дэлгэрэнгүй рүү орох мөчид харах ёстой.
      */}
      {overlaps.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/[0.08]">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-red-700 dark:text-red-400">
                Байршлын давхардал — {overlaps.length} нэгж талбар
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-red-600/90 dark:text-red-400/80">
                Энэ нэгж талбар доорх талбар(ууд)тай орон зайн хувьд давхцаж
                байна. Давхардлыг арилгах хүртэл чөлөөлөлт &quot;Хээрийн
                судалгаа&quot; төлөв рүү шилжихгүй — нэг газрын нөхөх олговрыг
                хоёр удаа бодох эрсдэлтэй.
              </p>
              <div className="mt-2.5 flex flex-col gap-1">
                {overlaps.map((o) => (
                  <div
                    key={o.other_parcel_uuid}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]"
                  >
                    <Link
                      href={`/parcel/${o.other_parcel_uuid}${acqId ? `?acq=${acqId}` : ""}`}
                      className="font-mono font-semibold text-red-700 underline decoration-red-300 underline-offset-2 hover:decoration-red-500 dark:text-red-400"
                    >
                      {o.other_parcel_id}
                    </Link>
                    <span className="text-red-600/80 dark:text-red-400/70">
                      давхцах талбай {formatArea(o.overlap_area_m2)}
                    </span>
                    {o.other_status_name && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/20 dark:text-red-400">
                        {o.other_status_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Талбарын мэдээлэл */}
        <div className="ap-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Талбарын мэдээлэл
            </p>
            <div className="flex items-center gap-2">
              {!isExternal &&
                !isLocked &&
                (editingMeta ? (
                  <>
                    <button
                      onClick={() => {
                        setEditingMeta(false);
                        setDbChanged(data.db_changed ?? "");
                        setChangedParcelId(data.changed_parcel_id ?? "");
                        setAcquisitionAreaM2(
                          String(data.acquisition_area_m2 ?? ""),
                        );
                        setAcquisitionGeomWkt(data.acquisition_geom_wkt ?? "");
                        setAreaAutoCalc(false);
                      }}
                      className="h-7 px-3 rounded-lg text-[12px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252630] transition-colors"
                    >
                      Болих
                    </button>
                    <button
                      onClick={() => metaMutation.mutate()}
                      disabled={metaMutation.isPending}
                      className="h-7 px-3 rounded-lg text-[12px] font-semibold bg-[#02c0ce] text-white hover:bg-[#02c0ce]/90 disabled:opacity-50 transition-colors"
                    >
                      Хадгалах
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditingMeta(true)}
                    className="h-7 px-3 rounded-lg text-[12px] font-semibold text-[#02c0ce] hover:bg-[#02c0ce]/10 transition-colors"
                  >
                    Засах
                  </button>
                ))}
              {!isExternal && !isLocked && !editingMeta && (
                <button
                  onClick={() => setSyncDialogOpen(true)}
                  disabled={!acqId || syncDialogOpen}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#0acf97]/10 px-3 text-[12px] font-semibold text-[#0acf97] transition-colors hover:bg-[#0acf97]/20 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Мэдээлэл дуудах
                </button>
              )}
            </div>
          </div>
          {row("Дугаар", <span className="font-mono">{data.parcel_id}</span>)}
          {/* Хуучин дугаар нь зөвхөн нэгж талбар өөрчлөгдсөн үед ирнэ */}
          {data.old_parcel_id
            ? row(
                "Хуучин дугаар",
                <span className="font-mono">{data.old_parcel_id}</span>,
              )
            : null}
          {row(
            "Аймаг/Нийслэл",
            formatAdminUnit(adminUnit?.au1_name, data.au1_code),
          )}
          {row(
            "Сум/Дүүрэг",
            formatAdminUnit(adminUnit?.au2_name, data.au2_code),
          )}
          {row(
            "Баг/Хороо",
            formatAdminUnit(adminUnit?.au3_name, data.au3_code),
          )}
          {row("Эрхийн төрөл", RIGHT_TYPE_LABELS[data.right_type])}
          {row(
            "Газрын зориулалт",
            data.landuse_name
              ? `${data.landuse_name}${data.landuse ? ` (${data.landuse})` : ""}`
              : data.landuse,
          )}
          {row("Хашааны хаяг", data.address_khashaa)}
          {row("Гудамжны нэр", data.address_streetname)}
          {row("Үл хөдлөх хөрөнгийн дугаар", data.property_no)}
          {row(
            "Эрх эхэлсэн",
            data.valid_from ? formatDate(data.valid_from) : undefined,
          )}
          {row(
            "Эрх дуусах",
            data.valid_till ? formatDate(data.valid_till) : undefined,
          )}
          {row("Нийт талбай", formatArea(data.area_m2))}
          {/* Чөлөөлөгдөх талбай */}
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44">
              Чөлөөлөгдөх талбай
            </span>
            {editingMeta ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="number"
                  value={acquisitionAreaM2}
                  onChange={(e) => {
                    setAcquisitionAreaM2(e.target.value);
                    setAreaAutoCalc(false);
                  }}
                  placeholder="Талбай оруулах (м²)..."
                  className="h-8 w-44 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
                />
                {acquisitionGeomWkt.trim() && (
                  <button
                    type="button"
                    onClick={handleAutoCalcArea}
                    disabled={areaCalcBusy}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#02c0ce]/30 bg-[#02c0ce]/10 px-3 text-[12px] font-semibold text-[#02c0ce] hover:bg-[#02c0ce]/20 transition-colors disabled:opacity-50"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    {areaCalcBusy ? "Тооцоолж байна..." : "Хилээс тооцоолох"}
                  </button>
                )}
                {areaAutoCalc && (
                  <span className="text-[11px] text-[#0acf97] font-medium">
                    Автоматаар тооцоологдсон
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {highlightArea(formatArea(data.acquisition_area_m2))}
              </span>
            )}
          </div>
          {row(
            "Төсөөллийн үнэлгээ",
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums text-[#02c0ce]">
                {data.estimated_value != null
                  ? `${data.estimated_value.toLocaleString("mn-MN")}₮`
                  : "—"}
              </span>
              {data.estimated_value != null && data.estimated_value_at && (
                <span
                  className="text-[11px] text-slate-400"
                  title={data.estimated_value_by || undefined}
                >
                  {formatDate(data.estimated_value_at)}
                </span>
              )}
              {/* Тооцоолох товч нь ҮНЭЛГЭЭНИЙ мөрөнд — өмнө нь "Нийт талбай"-н
                  ард байсан тул талбайн тохиргоо шиг уншигдаж байв. */}
              {!isExternal && !useProfApi && !isLocked && !editingMeta && (
                <button
                  type="button"
                  onClick={() => setEstOpen(true)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#02c0ce]/30 bg-[#02c0ce]/10 px-2.5 text-[12px] font-semibold text-[#02c0ce] hover:bg-[#02c0ce]/20"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  {data.estimated_value != null
                    ? "Үнэлгээ тохируулах"
                    : "Үнэлгээ оруулах"}
                </button>
              )}
              {/* ДЭЛГЭРЭНГҮЙ — өөрчлөлтийн БҮХ түүхийг хавсралттайгаа. Засах
                  эрхгүй хэрэглэгч (санхүү, мэрг. байгууллага) ч хянах
                  шаардлагатай тул харах эрхтэй бүгдэд харагдана. */}
              <button
                type="button"
                onClick={() => setEstHistoryOpen(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-[#252630]"
              >
                <History className="h-3.5 w-3.5" />
                Дэлгэрэнгүй
              </button>
            </span>,
          )}
          {row(
            "Үлдэх газрын хэмжээ",
            data.remaining_area_m2 != null
              ? formatArea(data.remaining_area_m2)
              : formatArea(
                  (data.area_m2 || 0) - (data.acquisition_area_m2 || 0),
                ),
          )}
          {/* Өмчлөх эрхийн гэрчилгээ — нөхөх олговрын үнэлгээнээс (уншихад зориулав) */}
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44">
              Өмчлөх эрхийн гэрчилгээ
            </span>
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
              {landValuation?.ownership_cert_no ||
                data.detail?.certificate_no ||
                "—"}
            </span>
          </div>
          {/* Мэдээллийн санд орсон өөрчлөлтийн тайлбар (чөлөөт текст) */}
          <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44 pt-1.5">
              МС-д орсон өөрчлөлт
            </span>
            {editingMeta ? (
              <textarea
                value={dbChanged}
                onChange={(e) => setDbChanged(e.target.value)}
                rows={2}
                placeholder="Ж: устгагдсан, нэгж талбарын дугаар өөрчлөгдсөн..."
                className="flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 py-1.5 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all resize-y"
              />
            ) : (
              <span
                className={`text-[13px] font-medium whitespace-pre-wrap ${data.db_changed ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-200"}`}
              >
                {data.db_changed || "—"}
              </span>
            )}
          </div>
          {/* Өөрчлөгдсөн нэгж талбарын дугаар */}
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44">
              Өөрчлөгдсөн НТ дугаар
            </span>
            {editingMeta ? (
              <input
                type="text"
                value={changedParcelId}
                onChange={(e) => setChangedParcelId(e.target.value)}
                placeholder="Нэгж талбарын дугаар..."
                className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
              />
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {data.changed_parcel_id || "—"}
              </span>
            )}
          </div>
          {/* Давхардсан хилийн зураг */}
          <div className="flex items-start gap-3 py-2.5 last:border-0 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44">
              Чөлөөлөгдөх талбайн хил
            </span>
            {editingMeta ? (
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  accept=".wkt,.txt,.json,.geojson,application/geo+json,application/json,text/plain"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleBoundaryLayerFile(file);
                    e.currentTarget.value = "";
                  }}
                  className="block w-full text-[12px] text-slate-500 file:mr-3 file:h-8 file:rounded-lg file:border-0 file:bg-[#02c0ce]/10 file:px-3 file:text-[12px] file:font-semibold file:text-[#02c0ce] hover:file:bg-[#02c0ce]/20 dark:text-slate-400"
                />
                <textarea
                  value={acquisitionGeomWkt}
                  onChange={(e) => {
                    setAcquisitionGeomWkt(e.target.value);
                    setAreaAutoCalc(false);
                  }}
                  rows={3}
                  placeholder="POLYGON((106.76 47.66,...)) эсвэл GeoJSON файлаар оруулна"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none transition-all focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 dark:border-white/[0.08] dark:bg-[#1e1f27] dark:text-slate-200"
                />
              </div>
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {data.acquisition_geom_wkt ? "Оруулсан" : "—"}
              </span>
            )}
          </div>
        </div>

        {/* Байршил */}
        <div className="ap-card overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-slate-100 dark:border-[#37394d]">
            <MapPin className="h-3.5 w-3.5 text-[#02c0ce]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Байршил
            </p>
            <div className="ml-auto flex items-center gap-3">
              {overlaps.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  <span>Давхардсан нэгж талбар ({overlaps.length})</span>
                  <Switch
                    checked={showOverlaps}
                    onCheckedChange={setShowOverlaps}
                    className="data-[state=checked]:bg-red-500"
                  />
                </label>
              )}
              {/* Хэвлэхэд «Трас зураг» хавсралтыг дарж бичдэг тул зөвхөн
                  админ ба чөлөөлөлтийг хариуцсан ажилтан */}
              {canPrintTrace && (
                <button
                  type="button"
                  onClick={() => setTraceOpen(true)}
                  disabled={!data.geometry_wkt}
                  title={
                    data.geometry_wkt
                      ? "Трас зураг хэвлэх"
                      : "Нэгж талбарын хил байхгүй"
                  }
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#02c0ce]/30 bg-[#02c0ce]/10 px-2.5 text-[12px] font-semibold text-[#02c0ce] transition-colors hover:bg-[#02c0ce]/20 disabled:opacity-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Трас зураг
                </button>
              )}
            </div>
          </div>
          <ParcelMap
            parcelId={data.parcel_id}
            acquisitionId={acqId}
            geometryWkt={data.geometry_wkt}
            acquisitionGeometryWkt={data.acquisition_geom_wkt}
            statusId={data.status_id ?? data.status}
            overlaps={overlaps}
            showOverlaps={showOverlaps}
            onVisibleLayersChange={setMapLayers}
          />
          {traceOpen && canPrintTrace && (
            <TracePrintDialog
              acquisitionId={acqId}
              acquisitionName={
                acquisition?.acquisition_name || acquisition?.plan_name
              }
              planCode={acquisition?.plan_code}
              parcel={{
                uuid: parcelId,
                code: data.parcel_id,
                geometryWkt: data.geometry_wkt,
                acquisitionGeometryWkt: data.acquisition_geom_wkt,
                statusId: data.status_id ?? data.status,
                statusName: data.status_name,
                areaM2: data.area_m2,
                acquisitionAreaM2: data.acquisition_area_m2,
                location: [adminUnit?.au2_name, adminUnit?.au3_name]
                  .filter(Boolean)
                  .join(", "),
                address: [data.address_streetname, data.address_khashaa]
                  .filter(Boolean)
                  .join(", "),
                landuse: data.landuse_name || data.landuse,
                rightType: RIGHT_TYPE_LABELS[data.right_type],
              }}
              insetLayers={mapLayers}
              overlaps={overlaps}
              showOverlaps={showOverlaps}
              canSave={!isLocked}
              onClose={() => setTraceOpen(false)}
            />
          )}
          {showOverlaps && overlaps.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-5 py-2 text-[11.5px] text-slate-500 dark:border-[#37394d] dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border-2 border-[#0062ff]" />
                Энэ нэгж талбар
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border-2 border-dashed border-[#f97316] bg-[#f97316]/15" />
                Давхцаж буй нэгж талбар
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-[#dc2626]/70" />
                Давхцах хэсэг
              </span>
            </div>
          )}
          <div className="border-t border-slate-100 px-5 py-4 dark:border-[#37394d]">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-[#10b981]" />
              <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                Хянан баталгааны мэдээлэл
              </p>
              {!isExternal && !isLocked && (
                <button
                  type="button"
                  onClick={() => monitoringSyncMutation.mutate()}
                  disabled={
                    monitoringSyncMutation.isPending || !data?.parcel_id
                  }
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#10b981]/30 bg-[#10b981]/10 px-3 text-[12px] font-semibold text-[#10b981] transition-colors hover:bg-[#10b981]/20 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${monitoringSyncMutation.isPending ? "animate-spin" : ""}`}
                  />
                  Шинэчлэх
                </button>
              )}
            </div>
            {monitorings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-400 dark:border-[#37394d] dark:text-slate-500">
                Хянан баталгааны мэдээлэл татагдаагүй байна.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400 dark:bg-[#252630] dark:text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Хуудас</th>
                      <th className="px-3 py-2 font-semibold">Төлөв</th>
                      <th className="px-3 py-2 font-semibold">Байгууллага</th>
                      <th className="px-3 py-2 font-semibold">Огноо</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#37394d]">
                    {monitorings.map((item) => {
                      const isVerified =
                        item.status_name?.trim() === "Баталгаажуулсан";
                      return (
                        <tr
                          key={item.monitoring_id}
                          className="text-slate-700 dark:text-slate-200"
                        >
                          <td className="px-3 py-2">{item.page_no || "—"}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-[12px] font-semibold ${
                                isVerified
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                                  : "bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300"
                              }`}
                            >
                              {item.status_name || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {item.company_name || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {item.created_at
                              ? formatDate(item.created_at)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {syncDialogOpen && data && (
        <ParcelSyncDialog
          acqId={acqId}
          parcelUuid={parcelId}
          parcelCode={data.parcel_id}
          rightType={data.detail?.right_type}
          // Татсан мэдээлэл олон табд тархсан тул дуусахад хуудсыг бүхэлд нь сэргээнэ.
          onClose={(finished) => {
            setSyncDialogOpen(false);
            if (finished) window.location.reload();
          }}
        />
      )}

      {estOpen && !isExternal && !useProfApi && !isLocked && (
        <EstimatedValueDialog
          data={data}
          pending={estimatedMutation.isPending}
          onClose={() => setEstOpen(false)}
          onSave={(confidencePercent, baseFeePerM2, file) =>
            estimatedMutation.mutate({ confidencePercent, baseFeePerM2, file })
          }
        />
      )}
      {estHistoryOpen && (
        <EstimatedValueHistoryDialog
          acquisitionId={acqId}
          parcelUuid={parcelId}
          onClose={() => setEstHistoryOpen(false)}
        />
      )}
    </div>
  );
}
