"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { authStorage } from "@/lib/auth";
import {
  canViewHr,
  canViewRoles,
  canViewSettings,
  canViewUsers,
  hasPermission,
  isExternalSpecialRole,
  isFinanceSpecialist,
  isProfessionalOrg,
  isSeniorSpecialist,
  canImportLegacyData,
} from "@/lib/role-utils";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BlockingLoaderProvider, ContentLoader } from "@/lib/blocking-loader";
import { NavigationEvents } from "@/components/layout/navigation-events";
import { PageTabs } from "@/components/layout/page-tabs";
import { KeepAliveTabs } from "@/components/layout/keep-alive-tabs";

/**
 * Хуудасны түвшний эрхийн бодлого.
 *
 * Урьд нь хажуугийн цэс л эрхээр шүүгддэг байсан тул хаяг мөрөөр шууд орвол
 * (жишээ нь `/employee`, `/report`) хуудас нээгдэж, зөвхөн API-ийн 403-аар
 * зогсдог байв. Тохиргооны/лавлахын GET-үүд backend дээр эрх шаарддаггүй тул
 * зарим хуудас БҮРЭН нээлттэй байсан.
 *
 * ЖИЧ: энэ бол ХЭРЭГЛЭГЧИЙН ТУСГАЛ (defense-in-depth) — жинхэнэ хамгаалалт нь
 * backend дээр. Дүрмүүд нь Sidebar-ийн харагдах дүрэмтэй ЯГ ижил функцуудыг
 * ашигладаг тул хоёр газар зөрөх боломжгүй.
 */
const ROUTE_GUARDS: { match: (p: string) => boolean; allow: () => boolean }[] = [
  { match: (p) => p.startsWith("/users"), allow: canViewUsers },
  { match: (p) => p.startsWith("/roles"), allow: canViewRoles },
  { match: (p) => p.startsWith("/audit_logs"), allow: () => hasPermission("audit:read") },
  { match: (p) => p.startsWith("/legacy_import"), allow: canImportLegacyData },
  { match: (p) => p.startsWith("/parcel_survey"), allow: () => hasPermission("land:read") },
  {
    match: (p) => p.startsWith("/land_release"),
    allow: () => hasPermission("land:read") && !isExternalSpecialRole(),
  },
  // Тайлан нь БҮХ чөлөөлөлтийг нэгтгэдэг тул backend дээр ахлах мэргэжилтнээр
  // хязгаарлагдсан (`/report/download`, `/report/summary`) — UI мөн тэгнэ.
  { match: (p) => p.startsWith("/report"), allow: isSeniorSpecialist },
  {
    match: (p) =>
      ["/person", "/employee", "/organization", "/valuation_org", "/department", "/position"].some(
        (r) => p.startsWith(r),
      ),
    allow: canViewHr,
  },
  {
    match: (p) =>
      [
        "/acquisition_category",
        "/acquisition_workflow",
        "/parcel_status",
        "/parcel_workflow",
        "/document_type",
        "/asset_spec_type",
        "/asset_calc_type",
        "/decision_work_type",
        "/decision_budget",
        "/decision_review_unit",
      ].some((r) => p.startsWith(r)),
    allow: canViewSettings,
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Хуудсууд эрхийг (localStorage) render-ийн үеэр шууд уншдаг — сервер дээр
  // localStorage байхгүй тул эрхтэй товч г.м. SERVER HTML-д байхгүй, client-д
  // байдаг → URL-ыг шууд нээх/F5 дарахад hydration алдаа гардаг байв. Нэвтрэлт
  // бүхэлдээ client талд тул хуудсыг зөвхөн mount болсны дараа зурна.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!authStorage.getAccessToken()) router.replace("/login");
    setMounted(true);
  }, [router]);

  useEffect(() => {
    if (!authStorage.getAccessToken()) return;
    if (!isExternalSpecialRole()) return;
    const profOrgAllowed =
      isProfessionalOrg() &&
      (pathname === "/" ||
        pathname === "/my_acquisitions" ||
        pathname.startsWith("/acquisition") ||
        /^\/parcel\/[^/]+$/.test(pathname));
    const otherExternalAllowed =
      !isProfessionalOrg() &&
      (pathname === "/" ||
        pathname.startsWith("/acquisition") ||
        // Санхүүгийн мэргэжилтэн — "Нэгж талбар" ЖАГСААЛТ (цэсэнд харагддаг)
        // мөн нээлттэй. Бусад гадаад роль зөвхөн дэлгэрэнгүй рүү ханддаг.
        (isFinanceSpecialist() && pathname === "/parcel") ||
        /^\/parcel\/[^/]+$/.test(pathname));
    if (!profOrgAllowed && !otherExternalAllowed) {
      router.replace(isProfessionalOrg() ? "/my_acquisitions" : "/acquisition");
    }
  }, [pathname, router]);

  // Дотоод хэрэглэгчийн хуудасны эрх — цэсэнд харагдахгүй хуудсыг хаягаар
  // шууд нээхээс сэргийлнэ.
  useEffect(() => {
    if (!authStorage.getAccessToken()) return;
    if (isExternalSpecialRole()) return; // дээрх шалгуураар аль хэдийн хумигдсан
    const guard = ROUTE_GUARDS.find((g) => g.match(pathname));
    if (guard && !guard.allow()) router.replace("/");
  }, [pathname, router]);

  return (
    <BlockingLoaderProvider>
      <NavigationEvents />
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          {/* useSearchParams — Suspense-гүй бол Next build CSR bailout алдаа өгнө */}
          <Suspense fallback={<div className="h-[52px] shrink-0" />}>
            <PageTabs />
          </Suspense>
          {/* Loader нь гүйлгэх элементийн ГАДНА — гүйлгэсэн үед ч харагдах хэсгийг бүрхэнэ */}
          <div className="relative flex-1 overflow-hidden">
            {/* Таб бүр өөрийн гүйлгэх хэсэгтэй, нээлттэй байх хугацаандаа mount-тай үлдэнэ */}
            <main className="relative h-full bg-background">
              {mounted ? <KeepAliveTabs>{children}</KeepAliveTabs> : null}
            </main>
            <ContentLoader />
          </div>
        </div>
      </div>
    </BlockingLoaderProvider>
  );
}
