"use client";
import { useParcelStatusRules } from "@/lib/use-parcel-status-rules";
import React, { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { replaceQueryParam } from "@/lib/url-state";
import { useQuery } from "@tanstack/react-query";
import { landApi } from "@/lib/api";
import { profApi } from "@/lib/prof-api";
import { RIGHT_TYPE_LABELS, ACQ_STATUS } from "@/types";
import {
  ArrowLeft,
  Info,
  Paperclip,
  Building2,
  Printer,
  Activity,
  UserCheck,
  Gavel,
  Landmark,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { type Tab } from "./_components/constants";
import { GeneralTab } from "./_components/general_tab";
import { HolderTab } from "./_components/holder_tab";
import { ProgressTab } from "./_components/progress_tab";
import { RealEstateTab } from "./_components/real_estate_tab";
import { DocumentsTab } from "./_components/documents_tab";
import { FinanceTab } from "./_components/finance_tab";
import { PrintTemplatesTab } from "./_components/print_templates_tab";
import { DecreeTab } from "./_components/decree_tab";
import { SurveyTab } from "./_components/survey_tab";
import {
  canAccessParcel,
  canViewParcelTab,
  hasPermission,
  isExternalSpecialRole,
  isFinanceSpecialist,
  shouldUseProfessionalOrgApi,
} from "@/lib/role-utils";
import { Users } from "lucide-react";

export default function ParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const acqId = searchParams.get("acq") ?? "";
  // Идэвхтэй таб URL-д (`?tab=`) хадгалагдана — өөр хуудас руу ороод буцахад
  // орхисон табдаа буцаж ирнэ.
  const tab = (searchParams.get("tab") as Tab | null) ?? "general";
  const [mounted, setMounted] = useState(false);
  const isExternal = isExternalSpecialRole();
  const isFinance = isFinanceSpecialist();
  const useProfApi = shouldUseProfessionalOrgApi();

  React.useEffect(() => setMounted(true), []);

  function handleTabClick(key: Tab) {
    replaceQueryParam(searchParams, "tab", key);
  }

  const {
    data: parcel,
    isLoading: parcelLoading,
    error: parcelError,
  } = useQuery({
    queryKey: ["parcel-full", acqId, id],
    queryFn: () =>
      useProfApi
        ? profApi.profGetParcel(acqId, id)
        : landApi.getParcel(acqId, id),
    enabled: !!acqId,
    retry: (failCount, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403 || status === 404) return false;
      return failCount < 2;
    },
  });
  const {
    data: acquisition,
    isLoading: acquisitionLoading,
    error: acquisitionError,
  } = useQuery({
    queryKey: ["land", acqId],
    queryFn: () =>
      useProfApi ? profApi.profGetAcquisition(acqId) : landApi.getById(acqId),
    enabled: !!acqId,
    retry: (failCount, err) => {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 403 || status === 404) return false;
      return failCount < 2;
    },
  });

  // Түгжээ нь «Нэгж талбарын төлөв»-ийн ДҮРМЭЭС (parcel_status): «Эцсийн
  // төлөв» — мэдээллийн табууд; «Явц түгжих» — явцын таб (Татгалзсан нь
  // эцсийн боловч буцааж шилжих боломжтой тул явц түгжихгүй). Өмнө НЭРЭЭР
  // шалгадаг байсан ба «Нөлөөлөгдсөн гарсан»-ыг буруу нэрээр бичсэн тул тэр
  // төлөвт түгжигддэггүй байв.
  const statusRules = useParcelStatusRules();
  const parcelRules = statusRules(parcel?.status_id ?? parcel?.status);
  const isAcqConfirmed = acquisition?.status === ACQ_STATUS.CONFIRMED;

  const isBeforeFieldStage =
    acquisition != null && acquisition.status < ACQ_STATUS.FIELD_SURVEY;
  const isParcelLocked = isAcqConfirmed || parcelRules.is_final;
  const isProgressLocked = isAcqConfirmed || parcelRules.locks_progress;

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "general",
      label: "Ерөнхий мэдээлэл",
      icon: <Info className="h-4 w-4" />,
    },
    {
      key: "holder",
      label: "Эзэмшигч",
      icon: <UserCheck className="h-4 w-4" />,
    },
    {
      key: "finance",
      label: "Барьцаа, төлбөр",
      icon: <Landmark className="h-4 w-4" />,
    },
    {
      key: "realEstate",
      label: "Нөхөх олговор",
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      key: "documents",
      label: "Баримт бичиг",
      icon: <Paperclip className="h-4 w-4" />,
    },
    { key: "decree", label: "Захирамж", icon: <Gavel className="h-4 w-4" /> },
    { key: "print", label: "Эх хэвлэл", icon: <Printer className="h-4 w-4" /> },
    { key: "progress", label: "Явц", icon: <Activity className="h-4 w-4" /> },
    {
      key: "survey",
      label: "Судалгаа",
      icon: <ClipboardList className="h-4 w-4" />,
    },
  ];
  // Таб бүр хандах эрхийн бодлогоор (access-policy) харагдана.
  // mounted шалгалт — SSR/hydration үед localStorage-ийн токен байхгүй тул хойшлуулна.
  const visibleTabs = !mounted
    ? []
    : TABS.filter((item) => canViewParcelTab(item.key));
  const activeTab = visibleTabs.some((item) => item.key === tab)
    ? tab
    : "general";

  const parcelErrorStatus = (
    parcelError as { response?: { status?: number } } | null
  )?.response?.status;
  const acquisitionErrorStatus = (
    acquisitionError as { response?: { status?: number } } | null
  )?.response?.status;
  const accessErrorStatus = parcelErrorStatus ?? acquisitionErrorStatus;

  if (parcelLoading || acquisitionLoading) {
    return (
      <div className="flex flex-col gap-5 animate-pulse">
        <div className="h-8 w-48 rounded bg-slate-100 dark:bg-[#252630]" />
        <div className="h-12 w-full rounded-lg bg-slate-100 dark:bg-[#252630]" />
        <div className="h-64 w-full rounded-lg bg-slate-100 dark:bg-[#252630]" />
      </div>
    );
  }

  if (accessErrorStatus === 403) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <Users className="h-8 w-8 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-slate-700 dark:text-white">
            Хандах эрх байхгүй
          </p>
          <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
            Энэ нэгж талбар таны байгууллагад нээлттэй биш байна.
          </p>
        </div>
        <Link
          href={acqId ? `/acquisition/${acqId}?tab=parcels` : "/acquisition"}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[#37394d] px-4 py-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:border-[#02c0ce] hover:text-[#02c0ce] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Буцах
        </Link>
      </div>
    );
  }

  if (
    isExternal &&
    parcel &&
    acquisition &&
    !canAccessParcel(
      parcel.status_name,
      acquisition.professional_org_id,
      parcel.independent_org_id,
      parcelRules.is_valuation_stage,
    )
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
          <Users className="h-8 w-8 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-slate-700 dark:text-white">
            Хандах эрх байхгүй
          </p>
          <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1">
            Энэ нэгж талбар таны байгууллагад нээлттэй биш байна.
          </p>
        </div>
        <Link
          href={`/acquisition/${acqId}?tab=parcels`}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[#37394d] px-4 py-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:border-[#02c0ce] hover:text-[#02c0ce] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Чөлөөлөлт рүү буцах
        </Link>
      </div>
    );
  }

  // Баталгаажсан чөлөөлөлтийн нэгж талбарт гадаад хэрэглэгчид хандах боломжгүй.
  //
  // ОНЦГОЙ ТОХИОЛДОЛ: САНХҮҮГИЙН мэргэжилтэн БҮХ нэгж талбарыг ХАРНА
  // (баталгаажсан чөлөөлөлтийнхийг ч) — тэд нөхөх олговрын хяналт хийдэг тул
  // түүх нь хаагдах ёсгүй. Үйлдэл нь `isParcelLocked`/`isProgressLocked`-оор
  // хаалттай хэвээр бөгөөд backend мөн бичих хүсэлтийг 423-аар няцаана.
  if (isExternal && !isFinance && isAcqConfirmed && parcel && acquisition) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-500/10">
          <svg
            className="h-8 w-8 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[15px] font-semibold text-slate-700 dark:text-white">
            Дэлгэрэнгүй мэдээлэл хаалттай
          </p>
          <p className="text-[13px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
            Чөлөөлөлт{" "}
            <strong className="text-slate-600 dark:text-slate-300">
              Баталгаажсан
            </strong>{" "}
            төлөвтэй тул нэгж талбарын дэлгэрэнгүй мэдээлэлд хандах боломжгүй.
          </p>
        </div>
        <Link
          href="/acquisition"
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[#37394d] px-4 py-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:border-[#02c0ce] hover:text-[#02c0ce] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Жагсаалт руу буцах
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white font-mono">
              {parcel?.parcel_id ?? id}
            </h1>
          </div>
          {acqId && parcel && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              {RIGHT_TYPE_LABELS[parcel.right_type] ?? "—"} · {parcel.au3_code}
            </p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="ap-card flex items-stretch overflow-x-auto divide-x divide-slate-100 dark:divide-[#37394d]">
        {visibleTabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => handleTabClick(t.key)}
              className={`relative flex flex-col items-center justify-center gap-1.5 px-6 py-3.5 min-w-[110px] whitespace-nowrap transition-all select-none
                ${active ? "text-[#02c0ce] bg-[#02c0ce]/5 dark:bg-[#02c0ce]/10" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#252630]"}`}
            >
              {active && (
                <span className="absolute top-0 left-4 right-4 h-0.5 rounded-b-full bg-[#02c0ce]" />
              )}
              <span
                className={
                  active
                    ? "text-[#02c0ce]"
                    : "text-slate-400 dark:text-slate-500"
                }
              >
                {t.icon}
              </span>
              <span
                className={`text-[11.5px] font-semibold tracking-wide ${active ? "text-[#02c0ce]" : ""}`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Acquisition баталгаажсан — засвар хориглох анхааруулга */}
      {isAcqConfirmed && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 px-4 py-3">
          <span className="text-amber-500 shrink-0">🔒</span>
          <p className="text-[13px] text-amber-700 dark:text-amber-400 font-medium">
            Чөлөөлөлт <strong>Баталгаажсан</strong> төлөвтэй тул нэгж талбар
            дээр ямар нэгэн засвар хийх боломжгүй.
          </p>
        </div>
      )}

      {activeTab === "general" && (
        <GeneralTab acqId={acqId} parcelId={id} isLocked={isParcelLocked} />
      )}
      {activeTab === "holder" && (
        <HolderTab
          acqId={acqId}
          parcelId={id}
          isLocked={isParcelLocked}
          isAcqConfirmed={isAcqConfirmed}
        />
      )}
      {activeTab === "progress" && (
        <ProgressTab
          acqId={acqId}
          parcelId={id}
          isLocked={isProgressLocked}
          beforeFieldStage={isBeforeFieldStage}
        />
      )}
      {activeTab === "realEstate" && (
        <RealEstateTab
          acqId={acqId}
          parcelId={id}
          parcelCode={parcel?.parcel_id ?? ""}
          isLocked={isAcqConfirmed}
        />
      )}
      {activeTab === "documents" && (
        <DocumentsTab parcelId={id} isLocked={isParcelLocked} />
      )}
      {activeTab === "finance" && (
        <FinanceTab acqId={acqId} parcelId={id} isLocked={isParcelLocked} />
      )}
      {activeTab === "decree" && <DecreeTab parcelId={id} />}
      {activeTab === "print" && <PrintTemplatesTab parcel={parcel} />}
      {/* Судалгааг нөхөх олговор олгосны ДАРАА авдаг тул баталгаажсан
          чөлөөлөлтөд ч засна (backend мөн түгжээгүй) — зөвхөн land:update. */}
      {activeTab === "survey" && (
        <SurveyTab parcelId={id} canEdit={!isExternal && hasPermission("land:update")} />
      )}
    </div>
  );
}
