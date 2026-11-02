"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Pencil,
  Save,
  X,
  Calculator,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { landApi } from "@/lib/api";
import { profApi } from "@/lib/prof-api";
import {
  hasPermission,
  isFinanceSpecialist,
  isMika,
  shouldUseProfessionalOrgApi,
} from "@/lib/role-utils";
import { formatDate, formatArea, getApiError } from "@/lib/utils";
import { STATUS_LABELS } from "@/types";
import type { BoundaryOutsideParcel, Plan } from "@/types";
import {
  PlanCodeSearch,
  planHasBoundary,
} from "@/components/ui/plan-code-search";
import { STATUS_CFG } from "./shared";
import {
  ConfirmDialog,
  type PendingConfirm,
} from "@/components/ui/confirm-dialog";
import {
  BoundaryShapefileInput,
  type BoundaryFileSelection,
} from "./boundary-shapefile-input";
import {
  OutsideParcelsNotice,
  outsideParcelGeometries,
} from "./boundary-outside-parcels";
import { SocioSurveySection } from "./socio-survey-section";

export function GeneralTab({ id, canEdit }: { id: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const useProfApi = shouldUseProfessionalOrgApi();
  const canViewSocioSurvey = !isFinanceSpecialist() && !isMika();
  const { data: acq } = useQuery({
    queryKey: ["land", id],
    queryFn: () =>
      useProfApi ? profApi.profGetAcquisition(id) : landApi.getById(id),
  });
  // Санхүүжилтийн эх үүсвэр дэлгэрэнгүй API-тай хамт ирдэг — тусдаа дуудлага хийхгүй
  const fundingSources = acq?.funding_sources ?? [];
  const { data: generalCategories = [] } = useQuery({
    queryKey: ["acquisition-categories"],
    queryFn: () => landApi.listCategories(),
    staleTime: Infinity,
  });
  // Үнэлгээний БАЙГУУЛЛАГУУД (өмнө нь professional_org рольтой хэрэглэгчид).
  const { data: valuationOrgs = [] } = useQuery({
    // ["valuation-orgs", ...] иерархи (valuation-org-page.tsx-ийн qk-г үз):
    // бүртгэлийн хуудас хадгалахдаа угтвараар нь хүчингүй болгодог тул шинэ
    // байгууллага энэ сонгогчид шууд харагдана.
    queryKey: ["valuation-orgs", "options"],
    queryFn: () => landApi.listValuationOrgs(),
    enabled: canEdit,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    acquisition_name: "",
    implementing_org: "",
    reason: "",
    responsible_org: "",
    start_date: "",
    end_date: "",
    // НИТХ тогтоол ба түүний хавсралтын бүлэг жагсаалтын дугаар — НЗД-ын
    // захирамжаас (decree_number) ӨӨР баримт, гараас бүртгэнэ.
    nith_decree_number: "",
    group_list_number: "",
  });
  const [generalCategoryId, setGeneralCategoryId] = useState<number | null>(
    null,
  );
  const [subCategoryId, setSubCategoryId] = useState<number | null>(null);
  const [professionalOrgId, setProfessionalOrgId] = useState<string>("");
  const { data: subCategories = [] } = useQuery({
    queryKey: ["acquisition-categories", generalCategoryId],
    queryFn: () => landApi.listCategories(generalCategoryId!),
    enabled: !!generalCategoryId,
    staleTime: Infinity,
  });
  const [areaM2, setAreaM2] = useState<string>("");
  const [areaAutoCalc, setAreaAutoCalc] = useState(false);
  // Талбайг СЕРВЕР бодно (ГУС-тай ижил UTM арга) — browser дээр тооцвол
  // backend-ийн бичдэг тооноос зөрнө.
  const [areaCalcBusy, setAreaCalcBusy] = useState(false);
  const handleAutoCalcArea = async () => {
    const wkt = acq?.geometry_wkt;
    if (!wkt || areaCalcBusy) return;
    setAreaCalcBusy(true);
    try {
      const calc = await landApi.computeGeometryArea(wkt);
      if (calc != null) {
        setAreaM2(String(calc));
        setAreaAutoCalc(true);
        toast.success("Талбай тооцоологдлоо");
      } else {
        toast.error("Геометриас талбай тооцоолох боломжгүй");
      }
    } catch (err) {
      toast.error(getApiError(err, "Геометриас талбай тооцоолох боломжгүй"));
    } finally {
      setAreaCalcBusy(false);
    }
  };
  // Хил солих ХОЁР зам (нэг удаад зөвхөн НЭГ нь):
  //  1. Төлөвлөгөө — чөлөөлөлт ҮҮСГЭХ хэсэгтэй ЯГ ИЖИЛ байдлаар нэгж талбарын
  //     дугаараар хайж олоод, олдсон төлөвлөгөөний хилээр солино.
  //  2. Гараас .shp файл — хээрийн хэмжилтээр төлөвлөгөөний хил засагдсан үед.
  //     Талбайн зөрүү 30%-иас бага байх ёстой (серверт шалгагдана).
  const [boundaryPlan, setBoundaryPlan] = useState<Plan | null>(null);
  const [boundaryFile, setBoundaryFile] =
    useState<BoundaryFileSelection | null>(null);

  // Төлөвлөгөөний замд шинэ хилээс гарах нэгж талбарууд (ХАДГАЛАЛГҮЙ).
  // Файлын замд энэ мэдээлэл /boundary-preview-ийн хариунд хамт ирдэг.
  const planBoundaryWKT =
    boundaryPlan && planHasBoundary(boundaryPlan)
      ? boundaryPlan.boundary_wkt?.trim() ?? ""
      : "";
  const planOutside = useQuery({
    queryKey: ["boundary-outside-parcels", id, planBoundaryWKT],
    queryFn: () => landApi.boundaryOutsideParcels(id, planBoundaryWKT),
    enabled: editing && !!planBoundaryWKT,
    staleTime: 0,
  });

  useEffect(() => {
    if (acq) {
      setForm({
        acquisition_name: acq.acquisition_name ?? "",
        implementing_org: acq.implementing_org ?? "",
        reason: acq.reason ?? "",
        responsible_org: acq.responsible_org ?? "",
        start_date: acq.start_date ?? "",
        end_date: acq.end_date ?? "",
        nith_decree_number: acq.nith_decree_number ?? "",
        group_list_number: acq.group_list_number ?? "",
      });
      setGeneralCategoryId(acq.general_category_id ?? null);
      setSubCategoryId(acq.sub_category_id ?? null);
      setProfessionalOrgId(acq.professional_org_id ?? "");
      setAreaM2(String(acq.area_m2 ?? ""));
      setAreaAutoCalc(false);
      setBoundaryPlan(null);
      setBoundaryFile(null);
    }
  }, [acq]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (form.start_date) fd.append("start_date", form.start_date);
      if (form.end_date) fd.append("end_date", form.end_date);
      else if (acq?.end_date) fd.append("clear_end_date", "true");
      fd.append("acquisition_name", form.acquisition_name);
      fd.append("implementing_org", form.implementing_org);
      fd.append("reason", form.reason);
      fd.append("responsible_org", form.responsible_org);
      // Хоосон ч илгээнэ — хэрэглэгч утгыг УСТГАХ боломжтой байх ёстой
      // (backend бусад текст талбартай ижил байдлаар орлуулдаг).
      fd.append("nith_decree_number", form.nith_decree_number.trim());
      fd.append("group_list_number", form.group_list_number.trim());
      if (generalCategoryId)
        fd.append("general_category_id", String(generalCategoryId));
      if (subCategoryId) fd.append("sub_category_id", String(subCategoryId));
      const areaVal = parseFloat(areaM2);
      if (!isNaN(areaVal) && areaVal > 0) fd.append("area_m2", String(areaVal));
      // Дугаар илгээвэл backend тэр төлөвлөгөөг ДАХИН хайж, түүний хилээр
      // чөлөөлөлтийн хилийг солино (Create-тэй ижил урсгал).
      if (boundaryPlan) {
        fd.append(
          "plan_parcel_id",
          boundaryPlan.parcel_id ||
            boundaryPlan.plan_code ||
            boundaryPlan.code ||
            "",
        );
      }
      // Гараас оруулсан хилийн файл. Хоёуланг зэрэг илгээхгүй (сервер 400
      // буцаана) — UI дээр нэг нь сонгогдвол нөгөө нь хаагдана.
      if (boundaryFile) {
        fd.append("shapefile", boundaryFile.file, boundaryFile.file.name);
      }
      const updated = await landApi.update(id, fd);
      // Мэргэжлийн байгууллагыг ерөнхий update PUT уншдаггүй — зориулалтын
      // /professional-org endpoint-оор тусад нь солино (өөрчлөгдсөн үед л).
      if (professionalOrgId !== (acq?.professional_org_id ?? "")) {
        await landApi.setProfessionalOrg(id, professionalOrgId || null);
      }
      return updated;
    },
    onSuccess: () => {
      // Хилээс гарсан нэгж талбарын анхааруулга ЗӨВХӨН хил солих үед
      // (хадгалахаас өмнө) харагдана — хадгалсны дараа дахин гаргахгүй.
      toast.success("Хадгалагдлаа");
      setEditing(false);
      setAreaAutoCalc(false);
      setBoundaryPlan(null);
      setBoundaryFile(null);
      queryClient.invalidateQueries({ queryKey: ["land", id] });
      // Хил солиход нэгж талбар хөндөгдөхгүй — зөвхөн хилийн түүх шинэчлэгдэнэ.
      queryClient.invalidateQueries({
        queryKey: ["land-boundary-history", id],
      });
    },
    onError: (err) => toast.error(getApiError(err, "Хадгалахад алдаа гарлаа")),
  });

  // Жагсаалтын хуудасны устгах товчтой ижил — устгасны дараа энэ хуудас
  // хоосон болох тул жагсаалт руу буцна.
  const canDelete = canEdit && !useProfApi && hasPermission("land:delete");
  const deleteMutation = useMutation({
    mutationFn: () => landApi.delete(id),
    onSuccess: () => {
      toast.success("Чөлөөлөлт устгагдлаа");
      queryClient.invalidateQueries({ queryKey: ["land"] });
      router.push("/acquisition");
    },
    onError: (err) =>
      toast.error(getApiError(err, "Устгах боломжгүй (зөвхөн NEW статустай)")),
  });

  // Хил солиход ЗӨВХӨН чөлөөлөлтийн хил өөрчлөгдөнө. Шинэ хилээс гарах нэгж
  // талбар байвал хадгалахаас өмнө зөвшөөрөл авна; байхгүй бол шууд хадгална.
  const confirmOutsideThenSave = (
    outside: BoundaryOutsideParcel[],
    source: string,
  ) => {
    if (outside.length === 0) {
      saveMutation.mutate();
      return;
    }
    const shown = outside.slice(0, 10).map((p) => p.parcel_id).join(", ");
    const more = outside.length > 10 ? ` … (+${outside.length - 10})` : "";
    setPendingConfirm({
      title: "Хилээс гарах нэгж талбар байна",
      description: `${source} хилээр солиход ${outside.length} нэгж талбар шинэ хилтэй давхцахгүй болно: ${shown}${more}. Нэгж талбарт өөрчлөлт орохгүй — зөвхөн чөлөөлөлтийн хил солигдоно. Хадгалах уу?`,
      confirmLabel: "Хадгалах",
      confirmColor: "#f59e0b",
      onConfirm: () => saveMutation.mutate(),
    });
  };

  const requestSave = () => {
    // Хоёр замыг зэрэг илгээвэл сервер татгалзана — UI-д ч гаргахгүй.
    if (boundaryPlan && boundaryFile) {
      toast.error(
        "Төлөвлөгөөгөөр эсвэл файлаар — хил солих нэг аргыг л сонгоно уу",
      );
      return;
    }
    // Гараас оруулсан хилээр солих.
    if (boundaryFile) {
      if (!boundaryFile.preview.accepted) {
        toast.error(
          `Талбайн зөрүү ${boundaryFile.preview.deviation_percent.toFixed(1)}% — ` +
            `зөвшөөрөх дээд хэмжээ ${boundaryFile.preview.max_deviation_percent.toFixed(0)}%`,
        );
        return;
      }
      confirmOutsideThenSave(
        boundaryFile.preview.outside_parcels ?? [],
        `«${boundaryFile.file.name}» файлын`,
      );
      return;
    }
    if (!boundaryPlan) {
      saveMutation.mutate();
      return;
    }
    if (!planHasBoundary(boundaryPlan)) {
      toast.error("Төлөвлөгөөнд хил бүртгэгдээгүй тул хил солих боломжгүй");
      return;
    }
    // Хилээс гарах нэгж талбарыг шалгаж дуусаагүй/чадаагүй бол анхааруулга
    // алгасагдах тул хадгалахгүй.
    if (planOutside.isPending || planOutside.isFetching) {
      toast.info("Шинэ хилээс гарах нэгж талбарыг шалгаж байна, түр хүлээнэ үү");
      return;
    }
    if (planOutside.isError || !planOutside.data) {
      toast.error(
        getApiError(planOutside.error, "Шинэ хилээс гарах нэгж талбарыг шалгаж чадсангүй"),
      );
      return;
    }
    const planLabel =
      boundaryPlan.parcel_id ||
      boundaryPlan.plan_code ||
      boundaryPlan.code ||
      "";
    confirmOutsideThenSave(planOutside.data, `«${planLabel}» төлөвлөгөөний`);
  };

  if (!acq) return null;
  const sc = STATUS_CFG[acq.status] ?? STATUS_CFG[1];
  const parcelCount = acq.parcel_count ?? 0;
  const totalAcqAreaM2 = Number(acq.area_m2) || 0;
  const inp =
    "h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";
  const resetForm = () => {
    setForm({
      acquisition_name: acq.acquisition_name ?? "",
      implementing_org: acq.implementing_org ?? "",
      reason: acq.reason ?? "",
      responsible_org: acq.responsible_org ?? "",
      start_date: acq.start_date ?? "",
      end_date: acq.end_date ?? "",
      nith_decree_number: acq.nith_decree_number ?? "",
      group_list_number: acq.group_list_number ?? "",
    });
    setGeneralCategoryId(acq.general_category_id ?? null);
    setSubCategoryId(acq.sub_category_id ?? null);
    setProfessionalOrgId(acq.professional_org_id ?? "");
    setAreaM2(String(acq.area_m2 ?? ""));
    setAreaAutoCalc(false);
    setBoundaryPlan(null);
    setBoundaryFile(null);
  };

  const row = (label: string, value: React.ReactNode, last = false) => (
    <div
      key={label}
      className={`flex items-center gap-3 py-2.5 ${last ? "" : "border-b border-slate-100 dark:border-[#37394d]"}`}
    >
      <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
        {label}
      </span>
      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
        {value || "—"}
      </span>
    </div>
  );

  return (
    <div className="ap-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-[#37394d]">
        <p className="text-[13px] font-semibold text-slate-700 dark:text-white">
          Мэдээлэл
        </p>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold transition-colors hover:text-[#02c0ce]"
                style={{ color: "#64748b", border: "1px solid #e2e8f0" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "#02c0ce";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "#02c0ce14";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "#e2e8f0";
                  (e.currentTarget as HTMLButtonElement).style.background = "";
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> Засах
              </button>
            )}
            {!editing && canDelete && (
              <button
                onClick={() =>
                  setPendingConfirm({
                    title: "Устгах уу?",
                    description: `«${acq.acquisition_name || acq.plan_code || ""}» чөлөөлөлт болон түүний нэгж талбарууд устгагдана.`,
                    confirmLabel: "Устгах",
                    confirmColor: "#f1556c",
                    onConfirm: () => deleteMutation.mutate(),
                  })
                }
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[12px] font-semibold text-red-500 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? (
                  <span className="h-3 w-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Устгах
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    resetForm();
                  }}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[12px] font-medium text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252630] transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Болих
                </button>
                <button
                  onClick={requestSave}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[12px] font-semibold bg-[#02c0ce] text-white hover:bg-[#02c0ce]/90 disabled:opacity-50 transition-colors"
                >
                  {saveMutation.isPending ? (
                    <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Хадгалах
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Two columns separated by vertical line */}
      <div className="grid md:grid-cols-2">
        {/* Left — Үндсэн мэдээлэл */}
        <div className="px-5 py-4" style={{ borderRight: "1px solid #e2e8f0" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Үндсэн мэдээлэл
          </p>
          {/* ТӨЛӨВЛӨГӨӨНИЙ МЭДЭЭЛЭЛ. plan_code (ж: 2026-04-011-9878) нь
              төлөвлөгөөний КОД, харин plan_parcel_id (ж: 5029776) нь түүний
              НЭГЖ ТАЛБАРЫН дугаар — чөлөөлөлтийг үүгээр үүсгэдэг тул хамгийн
              түрүүнд харуулна. Утгууд нь ГУС-аас татагдаад plan хүснэгтэд
              хадгалагдсан — дэлгэц ГУС руу дахин хандахгүй. */}
          {row(
            "Төлөвлөгөөний нэгж талбар",
            acq.plan_parcel_id ? (
              <span className="font-mono">{acq.plan_parcel_id}</span>
            ) : undefined,
          )}
          {row("Төлөвлөгөөний дугаар", acq.plan_code)}
          {row("Төлөвлөгөөний нэр", acq.plan_name)}
          {row("Төлөвлөгөөний төрөл", acq.plan_type_name)}
          {row("Бүтээн байгуулалт", acq.plan_gazner)}
          {row(
            "Төлөвлөгөөний талбай",
            (acq.plan_area_m2 ?? 0) > 0
              ? formatArea(acq.plan_area_m2)
              : undefined,
          )}
          {row(
            "Төлөвлөгөө батлагдсан",
            acq.plan_approved_date
              ? formatDate(acq.plan_approved_date)
              : undefined,
          )}
          {row(
            "Төлөвлөгөөний хугацаа",
            acq.plan_start_date || acq.plan_end_date
              ? `${acq.plan_start_date ? formatDate(acq.plan_start_date) : "—"} — ${acq.plan_end_date ? formatDate(acq.plan_end_date) : "—"}`
              : undefined,
          )}
          {/* Хил солих — чөлөөлөлт үүсгэх хэсэгтэй ЯГ ИЖИЛ төлөвлөгөө хайлт.
              Олдсон төлөвлөгөөний хил нь шинэ хил болно. */}
          {editing && (
            <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40 pt-1.5">
                Хил солих төлөвлөгөө
              </span>
              <div className="min-w-0 flex-1">
                <PlanCodeSearch
                  plan={boundaryPlan}
                  onFound={setBoundaryPlan}
                  onReset={() => setBoundaryPlan(null)}
                  notFoundHint="Дугаарыг шалгаад дахин хайна уу — төлөвлөгөө олдохгүй бол хил солих боломжгүй."
                  // Одоогийн хилийг ШИНЭ хилтэй зэрэгцүүлж харуулна: хил солих
                  // нь буцаах боломжгүй тул зөрүүг нүдээрээ харах нь чухал.
                  compareGeometry={{
                    wkt: acq.geometry_wkt,
                    color: "#f59e0b",
                    label: "Одоогийн хил",
                    dashed: true,
                  }}
                  // Шинэ хилээс гарах нэгж талбарууд — дугаартай, өнгөөр ялгана.
                  overlayGeometries={outsideParcelGeometries(planOutside.data ?? [])}
                  mapHeight={(planOutside.data?.length ?? 0) > 0 ? 280 : 220}
                />
                {!boundaryPlan && (
                  <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
                    Хоосон орхивол хил хэвээр үлдэнэ. Дугаараар хайж олсон
                    төлөвлөгөөний хил нь чөлөөлөлтийн шинэ хил болно.
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Хил солих ХОЁРДУГААР зам: гараас .shp файл. Хээрийн хэмжилтээр
              төлөвлөгөөний хил засагдсан үед хэрэглэнэ — талбайн зөрүү
              төлөвлөгөөнийхөөс 30%-иас бага байх ёстой (сервер шалгана). */}
          {editing && (
            <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40 pt-1.5">
                Хилийн файл (.shp)
              </span>
              <div className="min-w-0 flex-1">
                <BoundaryShapefileInput
                  acquisitionId={id}
                  currentGeometryWKT={acq.geometry_wkt}
                  selection={boundaryFile}
                  onChange={setBoundaryFile}
                  disabled={!!boundaryPlan}
                />
                {!boundaryFile && !boundaryPlan && (
                  <p className="mt-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
                    Хээрийн хэмжилтээр засварласан хилийг гараас оруулна.
                    Талбайн зөрүү нь төлөвлөгөөний хилийн талбайгаас 30%-иас
                    бага байх шаардлагатай.
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Төлөвлөгөөний замд шинэ хилээс гарах нэгж талбарын анхааруулга
              (файлын замд BoundaryShapefileInput дотроо харуулдаг). */}
          {editing && !boundaryFile && planBoundaryWKT && (
            <div className="my-2.5">
              {planOutside.isFetching ? (
                <p className="text-[11.5px] text-slate-400 dark:text-slate-500">
                  Шинэ хилээс гарах нэгж талбарыг шалгаж байна…
                </p>
              ) : planOutside.isError ? (
                <div className="flex items-start gap-2 rounded-lg border border-[#f1556c]/20 bg-[#f1556c]/8 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f1556c]" />
                  <p className="text-[12px] text-[#f1556c]">
                    {getApiError(planOutside.error, "Шинэ хилээс гарах нэгж талбарыг шалгаж чадсангүй")}
                  </p>
                </div>
              ) : (
                <OutsideParcelsNotice outside={planOutside.data ?? []} />
              )}
            </div>
          )}
          {row(
            "Статус",
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: sc.color, background: sc.bg }}
            >
              {STATUS_LABELS[acq.status] ?? "Тодорхойгүй"}
            </span>,
          )}
          {/* Талбай — засах горимд input + хилээс тооцоолох товч */}
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
              Талбай
            </span>
            {editing ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  value={areaM2}
                  onChange={(e) => {
                    setAreaM2(e.target.value);
                    setAreaAutoCalc(false);
                  }}
                  placeholder="м² оруулах..."
                  className="h-7 w-36 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-2.5 text-[12px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
                />
                {acq.geometry_wkt && (
                  <button
                    type="button"
                    onClick={handleAutoCalcArea}
                    disabled={areaCalcBusy}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#02c0ce]/30 bg-[#02c0ce]/10 px-2.5 text-[11px] font-semibold text-[#02c0ce] hover:bg-[#02c0ce]/20 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <Calculator className="h-3 w-3" />
                    {areaCalcBusy ? "Тооцоолж байна..." : "Хилээс тооцоолох"}
                  </button>
                )}
                {areaAutoCalc && (
                  <span className="text-[11px] text-[#0acf97] font-medium whitespace-nowrap">
                    Автоматаар тооцоологдсон
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {formatArea(acq.area_m2)}
              </span>
            )}
          </div>
          {row("Үүсгэсэн", formatDate(acq.created_at))}
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
              Эхлэх огноо
            </span>
            {editing ? (
              <input
                type="date"
                value={form.start_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, start_date: e.target.value }))
                }
                className="h-7 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-2 text-[12px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] transition-all"
              />
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {formatDate(acq.start_date)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2.5">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
              Дуусах огноо
            </span>
            {editing ? (
              <input
                type="date"
                value={form.end_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, end_date: e.target.value }))
                }
                className="h-7 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-2 text-[12px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] transition-all"
              />
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {acq.end_date ? formatDate(acq.end_date) : "—"}
              </span>
            )}
          </div>

          {/* Нэгж талбарын тоо ба нийт чөлөөлөгдөх талбай */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#37394d] flex flex-col gap-0">
            <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
                Нэгж талбарын тоо
              </span>
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                {parcelCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    {parcelCount}
                    <span className="text-[11px] font-normal text-slate-400">
                      нэгж талбар
                    </span>
                  </span>
                ) : (
                  "0 нэгж талбар"
                )}
              </span>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
                Нийт нөлөөлөлд өртсөн талбай
              </span>
              <span className="text-[13px] font-semibold">
                {totalAcqAreaM2 > 0 ? (
                  <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                    {formatArea(totalAcqAreaM2)}
                  </span>
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right — Төслийн мэдээлэл */}
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Төслийн мэдээлэл
          </p>
          {(
            [
              ["Төслийн нэр", "acquisition_name", "Нэр оруулна уу"],
              [
                "Хэрэгжүүлэгч байгууллага",
                "implementing_org",
                "Байгууллагын нэр",
              ],
              ["Хариуцах байгууллага", "responsible_org", "Байгууллагын нэр"],
            ] as [string, keyof typeof form, string][]
          ).map(([label, key, ph]) => (
            <div
              key={key}
              className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]"
            >
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
                {label}
              </span>
              {editing ? (
                <input
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  placeholder={ph}
                  className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
                />
              ) : (
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  {(form[key] as string) || "—"}
                </span>
              )}
            </div>
          ))}
          {/* Санхүүжилтийн эх үүсвэр — дэлгэрэнгүй API-ийн funding_sources талбараас */}
          <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40 pt-0.5">
              Санхүүжилтийн эх үүсвэр
            </span>
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
              {fundingSources.length > 0
                ? fundingSources
                    .map((s) =>
                      [s.organization_name, s.source_type]
                        .filter(Boolean)
                        .join(" — "),
                    )
                    .join(", ")
                : "—"}
            </span>
          </div>
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
              Ерөнхий ангилал
            </span>
            {editing ? (
              <select
                value={generalCategoryId ?? ""}
                onChange={(e) => {
                  setGeneralCategoryId(
                    e.target.value ? Number(e.target.value) : null,
                  );
                  setSubCategoryId(null);
                }}
                className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
              >
                <option value="">— Сонгоно уу —</option>
                {generalCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {acq.general_category_name || "—"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
              Дэд ангилал
            </span>
            {editing ? (
              <select
                value={subCategoryId ?? ""}
                onChange={(e) =>
                  setSubCategoryId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                disabled={!generalCategoryId}
                className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all disabled:opacity-50"
              >
                <option value="">— Сонгоно уу —</option>
                {subCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {acq.sub_category_name || "—"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
            <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
              Мэргэжлийн байгууллага
            </span>
            {editing ? (
              <select
                value={professionalOrgId}
                onChange={(e) => setProfessionalOrgId(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
              >
                <option value="">— Сонгоно уу —</option>
                {valuationOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                    {org.register_no ? ` · ${org.register_no}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {acq.professional_org_name || "—"}
              </span>
            )}
          </div>
          {/* НИТХ тогтоол ба түүний хавсралтын бүлэг жагсаалтын дугаар —
              гараас бүртгэнэ. Доорх НЗД-ын ЗАХИРАМЖ нь өөр баримт тул
              хоёулаа зэрэгцэж харагдана. */}
          {(
            [
              ["НИТХ тогтоолын дугаар", "nith_decree_number", "Ж: 15/12"],
              ["Бүлэг жагсаалтын дугаар", "group_list_number", "Ж: 3"],
            ] as [string, "nith_decree_number" | "group_list_number", string][]
          ).map(([label, key, ph]) => (
            <div
              key={key}
              className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]"
            >
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
                {label}
              </span>
              {editing ? (
                <input
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                  placeholder={ph}
                  className="h-8 flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all"
                />
              ) : (
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                  {form[key] || "—"}
                </span>
              )}
            </div>
          ))}
          {acq.decree_number && (
            <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
                НЗД захирамжийн дугаар
              </span>
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {acq.decree_number}
              </span>
            </div>
          )}
          {acq.decree_date && (
            <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d]">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40">
                НЗД захирамжийн огноо
              </span>
              <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
                {acq.decree_date}
              </span>
            </div>
          )}
          <div className="py-2.5">
            <div className="flex items-start gap-3">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-40 pt-1">
                Чөлөөлөх шалтгаан
              </span>
              {editing ? (
                <textarea
                  value={form.reason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  rows={3}
                  placeholder="Тайлбар..."
                  className="flex-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 py-2 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all resize-none"
                />
              ) : (
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 flex-1">
                  {form.reason || "—"}
                </span>
              )}
            </div>
          </div>

          {/* Нийгэм эдийн засгийн судалгаа — өөрийн цонх, өөрийн хадгалалттай
              тул "Засах" режимээс ХАМААРАХГҮЙ (тусдаа endpoint). */}
          {canViewSocioSurvey && (
            <SocioSurveySection
              id={id}
              canEdit={canEdit && !useProfApi}
              useProfApi={useProfApi}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        confirmColor={pendingConfirm?.confirmColor}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onClose={() => setPendingConfirm(null)}
      />
    </div>
  );
}
