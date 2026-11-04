"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { authStorage } from "@/lib/auth";
import { authApi } from "@/lib/api";
import {
  isExternalSpecialRole,
  hasPermission,
  isProfessionalOrg,
  canViewUsers,
  canViewRoles,
  canViewHr,
  canViewSettings,
  canViewDecisionDrafts,
  isSeniorSpecialist,
  isFinanceSpecialist,
  canImportLegacyData,
} from "@/lib/role-utils";
import {
  LayoutDashboard,
  Map,
  FileText,
  Users,
  Shield,
  LogOut,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Layers,
  Building,
  User,
  Grid2x2,
  BarChart3,
  Settings,
  SlidersHorizontal,
  GitBranch,
  FolderOpen,
  Calculator,
  History,
  IdCard,
  UserCog,
  Building2,
  Landmark,
  Network,
  BadgeCheck,
  Gavel,
  Hammer,
  Wallet,
  FileUp,
  ClipboardList,
} from "lucide-react";
import { notifyNavStart } from "@/lib/blocking-loader-state";
import { loadPageTabs } from "@/lib/page-tabs";

const NAV_MAIN = [
  { href: "/", label: "Хяналтын самбар", icon: LayoutDashboard },
  { href: "/acquisition", label: "Газар чөлөөлөлт", icon: FileText },
  { href: "/report", label: "Тайлан", icon: BarChart3 },
  { href: "/map", label: "Газрын зураг", icon: Map },
  { href: "/parcel", label: "Нэгж талбар", icon: Grid2x2 },
  // Чөлөөлөгдсөн газрын судалгааны дүн — land:read эрхтэй ажилтанд.
  { href: "/parcel_survey", label: "Газрын судалгаа", icon: ClipboardList },
  // Буулгалтын мэдээлэл — shapefile-аар оруулсан газрууд (үндсэн нэгж талбараас тусдаа).
  { href: "/land_release", label: "Буулгалтын мэдээлэл", icon: Layers },
  // «Нөхөх олговрын түүх» цэсийг хассан — хуудас нь хуваарилалтаар хязгаарлагдахгүй
  // бүх чөлөөлөлтийн олговрыг харуулдаг байв. Мэдэгдлээс дэлгэрэнгүй
  // (/compensation/[id]) руу орох холбоос хэвээр.
  // Хуучин мэдээллийн импорт — ЗӨВХӨН админ (proxy ба импортын үйлчилгээ
  // backend-ээр дахин шалгана).
  { href: "/legacy_import", label: "Хуучин мэдээлэл оруулах", icon: FileUp },
];

// «Захирамж» бүлэг — төлөвөөр тусгаарласан хоёр жагсаалт (decision:read эрхтэй
// ажилтанд). Үндсэн цэсэнд «Газрын судалгаа»-ны дараа, «Хуучин мэдээлэл
// оруулах»-ын өмнө байрлана.
const NAV_DECISION = [
  { href: "/decision_draft", label: "Захирамжийн төсөл", icon: FileText },
  { href: "/decision", label: "Шийдвэр", icon: BadgeCheck },
];

// Хэрэглэгч/ролийн цэс нь эрхээр шүүгдэнэ (доорх canViewUsers/canViewRoles).
const NAV_ADMIN = [
  { href: "/users", label: "Хэрэглэгчид", icon: Users },
  { href: "/roles", label: "Эрх & Роль", icon: Shield },
];

const NAV_AUDIT = [
  { href: "/audit_logs", label: "Үйлдлийн лог", icon: History },
];


// Тохиргоо — ижил төрлийн цэсийг бүлэглэнэ (sidebar-т бүлгийн гарчигтай).
const NAV_CONFIG_GROUPS = [
  {
    label: "Ерөнхий",
    items: [{ href: "/document_type", label: "Хавсралтын төрөл", icon: FileText }],
  },
  {
    label: "Чөлөөлөлт",
    items: [
      { href: "/acquisition_category", label: "Чөлөөлөлтийн ангилал", icon: FolderOpen },
      { href: "/acquisition_workflow", label: "Чөлөөлөлтийн урсгал", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Нэгж талбар",
    items: [
      { href: "/parcel_status", label: "Нэгж талбарын статус", icon: Grid2x2 },
      { href: "/parcel_workflow", label: "Нэгж талбарын урсгал", icon: GitBranch },
    ],
  },
  {
    label: "Үнэлгээ",
    items: [
      { href: "/asset_spec_type", label: "Байгууламжийн чанарын төрөл", icon: Layers },
      { href: "/asset_calc_type", label: "Байгууламжийн тооцооллын төрөл", icon: Calculator },
    ],
  },
  {
    label: "Захирамжийн төсөл",
    items: [
      { href: "/decision_work_type", label: "Ажлын төрөл", icon: Hammer },
      { href: "/decision_budget", label: "Төсөв", icon: Wallet },
      { href: "/decision_review_unit", label: "Төсөл хянах нэгж", icon: Building },
    ],
  },
];

const NAV_CONFIG = NAV_CONFIG_GROUPS.flatMap((g) => g.items);

const NAV_HR = [
  { href: "/person", label: "Иргэн, хуулийн этгээд", icon: IdCard },
  { href: "/employee", label: "Ажилтан", icon: UserCog },
  { href: "/organization", label: "Байгууллага", icon: Building2 },
  { href: "/valuation_org", label: "Үнэлгээний байгууллага", icon: Landmark },
  { href: "/department", label: "Алба, хэлтэс", icon: Network },
  { href: "/position", label: "Албан тушаал", icon: BadgeCheck },
];

type NavEntry = { href: string; label: string; icon: React.ElementType };

// Цэсэнд байхгүй ч таб болж нээгддэг хуудсууд.
const NAV_EXTRA: NavEntry[] = [
  { href: "/my_acquisitions", label: "Газар чөлөөлөлт", icon: FileText },
  { href: "/profile", label: "Хувийн мэдээлэл", icon: User },
];

const NAV_ALL: NavEntry[] = [
  ...NAV_MAIN,
  ...NAV_DECISION,
  ...NAV_ADMIN,
  ...NAV_AUDIT,
  ...NAV_CONFIG,
  ...NAV_HR,
  ...NAV_EXTRA,
].sort((a, b) => b.href.length - a.href.length);

/**
 * Замд харгалзах цэсийн зүйл (хамгийн урт prefix). Таб нь цэсийн зүйлээр
 * бүлэглэгдэнэ — `/acquisition/12` нь "Газар чөлөөлөлт" табд нээгдэнэ.
 * `/acquisition_category` нь `/acquisition`-д андуурагдахгүйн тулд сегментийн
 * хилээр тааруулна.
 */
export function resolveNavItem(pathname: string): NavEntry | null {
  if (pathname === "/") return NAV_MAIN[0];
  return (
    NAV_ALL.find(
      (item) =>
        item.href !== "/" &&
        (pathname === item.href || pathname.startsWith(`${item.href}/`)),
    ) ?? null
  );
}

/**
 * Хураасан (icon-only) sidebar дээр курсор очиход нэрийг нь баруун талд
 * харуулдаг tooltip. Native `title` удаан, загваргүй тул оронд нь ашиглана.
 * `fixed` байрлалтай — nav нь overflow-y-auto тул absolute бол тасарна.
 */
function CollapsedTip({
  label,
  collapsed,
  className,
  children,
}: {
  label: string;
  collapsed: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <div
      className={className}
      onMouseEnter={(e) => {
        if (!collapsed) return;
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ top: r.top + r.height / 2, left: r.right + 10 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {collapsed && pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-[#37394d] dark:bg-[#252630] dark:text-[#e2eeff]"
        >
          {/* Зүүн сум — tooltip-ийн хүрээтэй ижил өнгө, 45° эргүүлсэн дөрвөлжин */}
          <span className="absolute -left-[5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-slate-200 bg-white dark:border-[#37394d] dark:bg-[#252630]" />
          {label}
        </span>
      )}
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  indent = false,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
  indent?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // ӨӨР таб нээлттэй бол (ж: `/parcel/12` дэлгэрэнгүй дээр) цэс дарахад жагсаалт
  // руу ШИНЭЭР орохгүй — таб дарсантай адил орхисон хуудас руу нь буцна. Одоо
  // харж буй таб бол цэс хэвийнээрээ (жагсаалт руу) шилжинэ.
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const plain =
      e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
      (resolveNavItem(pathname)?.href ?? pathname) !== href;
    const tabPath = plain ? loadPageTabs().find((t) => t.key === href)?.path : undefined;
    if (tabPath && tabPath !== href) {
      e.preventDefault();
      notifyNavStart(undefined, tabPath);
      router.push(tabPath);
      return;
    }
    notifyNavStart(e);
  };
  return (
    <CollapsedTip label={label} collapsed={collapsed} className="relative">
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#02c0ce]" />
      )}
      {/*
        prefetch={false} — Next-ийн <Link> нь харагдах талбарт орсон даруйдаа
        зорилтот замын RSC payload-ыг татдаг. Хажуугийн цэс 30 орчим холбоостой
        тул хуудас ачаалах бүрд 30 нэмэлт хүсэлт үүсдэг байв. Browser нь нэг
        origin дээр HTTP/1.1-ээр ЗӨВХӨН 6 холболт зэрэг барьдаг (урд нь
        reverse proxy байхгүй, Next standalone нь HTTP/2 дэмждэггүй) ба
        мэдэгдлийн SSE нэгийг нь БАЙНГА эзэлдэг. Иймд тэр prefetch-ууд жинхэнэ
        API дуудлагыг дараалалд оруулж "уншиж гацах" мэдрэмж төрүүлдэг байлаа.
        Цэс дарахад шилжилт хэвийн ажиллана — зөвхөн урьдчилсан татах нь
        унтарна.
      */}
      <Link
        prefetch={false}
        href={href}
        onClick={onClick}
        className={cn(
          "flex items-center rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
          collapsed ? "justify-center" : "gap-3",
          indent && !collapsed && "pl-6",
          active
            ? "bg-[#02c0ce]/10 text-[#02c0ce] dark:bg-[#02c0ce]/10 dark:text-[#02c0ce]"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-[#97aac1] dark:hover:bg-[#252630] dark:hover:text-[#e2eeff]",
        )}
      >
        <Icon className="h-[17px] w-[17px] shrink-0" />
        {!collapsed && <span className="flex-1">{label}</span>}
      </Link>
    </CollapsedTip>
  );
}

const COLLAPSED_COOKIE = "sidebar_collapsed";

function readCollapsedCookie(): boolean | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COLLAPSED_COOKIE}=([^;]*)`),
  );
  if (!match) return null;
  return match[1] === "1";
}

function writeCollapsedCookie(value: boolean) {
  // 1 жил хадгална
  document.cookie = `${COLLAPSED_COOKIE}=${value ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] =
    useState<ReturnType<typeof authStorage.getUser>>(null);
  // Role-г localStorage-оос уншдаг тул зөвхөн mount хийсний дараа тодорхой болно.
  // ready=false үед буруу menu-г зурахгүйн тулд skeleton харуулна (FOUC-с сэргийлнэ).
  const [ready, setReady] = useState(false);
  const [isExternal, setIsExternal] = useState(false);
  const [isProfOrg, setIsProfOrg] = useState(false);
  const [isFinance, setIsFinance] = useState(false);
  const [canViewConfig, setCanViewConfig] = useState(false);
  const [canViewHrNav, setCanViewHrNav] = useState(false);
  const [canViewAudit, setCanViewAudit] = useState(false);
  const [adminNav, setAdminNav] = useState<typeof NAV_ADMIN>([]);
  const [mainNav, setMainNav] = useState<typeof NAV_MAIN>(
    NAV_MAIN.filter(
      (item) =>
        item.href !== "/legacy_import" &&
        item.href !== "/parcel_survey" &&
        item.href !== "/land_release",
    ),
  );
  // «Захирамж» бүлэг — decision:read эрхтэй ажилтанд л харагдана.
  const [showDecision, setShowDecision] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(
    NAV_DECISION.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ),
  );

  const allAdminHrefs = [...NAV_ADMIN, ...NAV_AUDIT, ...NAV_CONFIG, ...NAV_HR].map((i) => i.href);
  const [adminOpen, setAdminOpen] = useState(
    allAdminHrefs.some((href) => pathname.startsWith(href)),
  );
  const [configOpen, setConfigOpen] = useState(
    NAV_CONFIG.some((item) => pathname.startsWith(item.href)),
  );
  const [hrOpen, setHrOpen] = useState(
    NAV_HR.some((item) => pathname.startsWith(item.href)),
  );
  const [collapsed, setCollapsed] = useState(false);
  // Анх ачааллахад cookie-оос сэргээх үед width анимаци харагдахгүй байлгана.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setUser(authStorage.getUser());
    setIsExternal(isExternalSpecialRole());
    setIsProfOrg(isProfessionalOrg());
    setIsFinance(isFinanceSpecialist());
    setCanViewConfig(canViewSettings());
    setCanViewHrNav(canViewHr());
    setCanViewAudit(hasPermission("audit:read"));
    // Хэрэглэгч/роль цэс — эрхтэй хэрэглэгчид л харагдана. Эрхгүй хэрэглэгч
    // цэсээр орж 403 toast-той хоосон хуудас харахаас сэргийлнэ.
    setAdminNav(
      NAV_ADMIN.filter((item) =>
        item.href === "/users" ? canViewUsers() : canViewRoles(),
      ),
    );
    // Захирамжийн төсөл нь тусдаа decision:* эрхтэй — эрхгүй ажилтанд цэс
    // харуулбал 403-той хоосон хуудас нээгдэнэ.
    setShowDecision(canViewDecisionDrafts());
    // Тайлан нь БҮХ чөлөөлөлтийг хуваарилалт үл харгалзан нэгтгэдэг тул
    // backend дээр ахлах мэргэжилтнээр хязгаарлагдсан — цэсийг мөн тэгш байлгана.
    const showReport = isSeniorSpecialist();
    const showImport = canImportLegacyData();
    const showSurvey = hasPermission("land:read");
    // Буулгалт — backend нь land:read шаардаж, мэргэжлийн байгууллагыг хаадаг.
    const showRelease = hasPermission("land:read") && !isExternalSpecialRole();
    setMainNav(
      NAV_MAIN.filter(
        (item) =>
          (item.href !== "/report" || showReport) &&
          (item.href !== "/legacy_import" || showImport) &&
          (item.href !== "/parcel_survey" || showSurvey) &&
          (item.href !== "/land_release" || showRelease),
      ),
    );
    setReady(true);
  }, []);

  useEffect(() => {
    // Хэрэглэгч өөрөө хураасан/дэлгэсэн бол cookie-оос сэргээнэ, үгүй бол
    // дэлгэцийн өргөнөөр шийднэ. Resize үед зөвхөн 1024px зааг давахад л
    // автоматаар өөрчилнө — тэгэхгүй бол хэрэглэгчийн сонголтыг дарж бичнэ.
    const saved = readCollapsedCookie();
    let wasNarrow = window.innerWidth < 1024;
    setCollapsed(saved ?? wasNarrow);
    const raf = requestAnimationFrame(() => setAnimate(true));
    const handleResize = () => {
      const isNarrow = window.innerWidth < 1024;
      if (isNarrow !== wasNarrow) {
        wasNarrow = isNarrow;
        setCollapsed(isNarrow);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      writeCollapsedCookie(!v);
      return !v;
    });
  };

  const isActive = (href: string) =>
    // Зөвхөн яг ижил эсвэл "/"-ээр үргэлжилсэн зам — "/parcel" нь "/parcel_survey"-д идэвхжихгүй.
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Дэд цэс сонгогдсон үед эцэг цэс (Удирдлага / Хүний нөөц / Тохиргоо)
  // хураалттай байсан ч идэвхтэй өнгөөр ялгарч харагдана.
  const hrActive = NAV_HR.some((item) => isActive(item.href));
  const decisionActive = NAV_DECISION.some((item) => isActive(item.href));
  const configActive = NAV_CONFIG.some((item) => isActive(item.href));
  const adminActive =
    hrActive ||
    configActive ||
    adminNav.some((item) => isActive(item.href)) ||
    (canViewAudit && NAV_AUDIT.some((item) => isActive(item.href)));
  const parentIdle = "text-slate-400 dark:text-[#8391a2]";
  const parentIdleLabel = "text-slate-500 dark:text-[#97aac1]";
  const parentActive = "text-[#02c0ce] dark:text-[#02c0ce]";

  return (
    <aside
      className={cn(
        "relative flex h-screen shrink-0 flex-col bg-white dark:bg-[#1e1f27] border-r border-slate-200/80 dark:border-[#37394d]",
        animate && "transition-all duration-300",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-[85px] border-b border-slate-100 dark:border-[#37394d] shrink-0 overflow-hidden transition-all duration-300",
          collapsed ? "justify-center px-0" : "gap-3 px-4",
        )}
      >
        {/* Цагаан дэвсгэр — dark горимд лого (хар хөх) харагдана */}
        <div className="h-10 w-10 shrink-0 rounded-lg bg-white p-0.5">
          <Image src="/logo.png" alt="Лого" width={40} height={40} priority className="h-full w-full object-contain" />
        </div>
        {!collapsed && (
          // Урт нэр — 2 мөрөнд. Nunito Sans 12px bold-оор эхний мөр ≈145px,
          // текстэд үлдэх зай ≈155px (w-60 − px-4 − лого 40 − gap-3).
          <span className="min-w-0 whitespace-nowrap text-[12px] font-bold leading-snug text-slate-800 dark:text-white tracking-tight">
            Нийслэлийн газар зохион
            <br />
            байгуулалтын алба
          </span>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-5">
        {/* Role тодрох хүртэл skeleton — буруу menu анивчихаас сэргийлнэ */}
        {!ready && (
          <nav className="space-y-1.5" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-lg bg-slate-100 dark:bg-[#252630] animate-pulse"
              />
            ))}
          </nav>
        )}

        {/* Main nav — external special roles see dashboard and acquisition menu */}
        {ready && (
          <div>
            <nav className="space-y-0.5">
              {(isExternal
                ? isProfOrg
                  ? [
                      { href: "/", label: "Хяналтын самбар", icon: LayoutDashboard },
                      { href: "/my_acquisitions", label: "Газар чөлөөлөлт", icon: FileText },
                    ]
                  : NAV_MAIN.filter(
                      (item) =>
                        item.href === "/" ||
                        item.href === "/acquisition" ||
                        // Санхүүгийн мэргэжилтэн — "Нэгж талбар" жагсаалтыг мөн
                        // харна (доторх агуулга дотоод ажилтных ЯГ ИЖИЛ;
                        // backend нь compensation:read-ээр уншуулна).
                        (item.href === "/parcel" && isFinance),
                    )
                : mainNav
              )
                .filter((item) => isExternal || item.href !== "/legacy_import")
                .map((item) => (
                  <NavItem
                    key={item.href}
                    {...item}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                  />
                ))}

              {/* «Захирамж» бүлэг — Захирамжийн төсөл (Төсөл) / Шийдвэр (Баталгаажсан) */}
              {!isExternal && showDecision && (
                <div>
                  <CollapsedTip label="Захирамж" collapsed={collapsed}>
                    <button
                      onClick={() => setDecisionOpen((v) => !v)}
                      className={cn(
                        "relative flex w-full items-center rounded-lg py-2.5 text-[13px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-[#252630]",
                        collapsed ? "justify-center px-3" : "gap-3 px-3",
                      )}
                    >
                      <Gavel className={cn("h-[17px] w-[17px] shrink-0", decisionActive ? parentActive : parentIdle)} />
                      {!collapsed && (
                        <>
                          <span className={cn("flex-1 text-left", decisionActive ? parentActive : parentIdleLabel)}>
                            Захирамж
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                              decisionOpen ? "rotate-180" : "rotate-0",
                            )}
                          />
                        </>
                      )}
                      {/* Хураасан үед дэд цэстэйг илтгэх жижиг сум */}
                      {collapsed && (
                        <ChevronDown
                          className={cn(
                            "absolute right-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                            decisionOpen ? "rotate-180" : "rotate-0",
                          )}
                        />
                      )}
                    </button>
                  </CollapsedTip>
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-200",
                      decisionOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden space-y-0.5">
                      {NAV_DECISION.map((item) => (
                        <NavItem
                          key={item.href}
                          {...item}
                          active={isActive(item.href)}
                          collapsed={collapsed}
                          indent
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isExternal &&
                mainNav
                  .filter((item) => item.href === "/legacy_import")
                  .map((item) => (
                    <NavItem
                      key={item.href}
                      {...item}
                      active={isActive(item.href)}
                      collapsed={collapsed}
                    />
                  ))}
            </nav>
          </div>
        )}

        {/* Удирдлага dropdown — гадаад ролиудад, мөн дотор нь харах юмгүй
            (эрхгүй) хэрэглэгчид харагдахгүй */}
        {ready && !isExternal && (adminNav.length > 0 || canViewAudit || canViewConfig || canViewHrNav) && (
          <div>
            <CollapsedTip label="Удирдлага" collapsed={collapsed}>
            <button
              onClick={() => setAdminOpen((v) => !v)}
              className={cn(
                "relative flex w-full items-center mb-1 gap-1 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-[#252630] py-2",
                collapsed ? "justify-center px-3 py-2.5" : "px-3",
              )}
            >
              <Settings className={cn("h-[17px] w-[17px] shrink-0", adminActive ? parentActive : parentIdle)} />
              {!collapsed && (
                <>
                  <p className={cn("flex-1 text-left text-[10px] font-semibold uppercase tracking-[0.08em]", adminActive ? parentActive : parentIdle)}>
                    Удирдлага
                  </p>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                      adminOpen ? "rotate-180" : "rotate-0",
                    )}
                  />
                </>
              )}
              {/* Хураасан үед дэд цэстэйг илтгэх жижиг сум */}
              {collapsed && (
                <ChevronDown
                  className={cn(
                    "absolute right-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                    adminOpen ? "rotate-180" : "rotate-0",
                  )}
                />
              )}
            </button>
            </CollapsedTip>

            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200",
                adminOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <nav className="space-y-0.5">
                  {adminNav.map((item) => (
                    <NavItem
                      key={item.href}
                      {...item}
                      active={isActive(item.href)}
                      collapsed={collapsed}
                    />
                  ))}
                  {canViewAudit &&
                    NAV_AUDIT.map((item) => (
                      <NavItem
                        key={item.href}
                        {...item}
                        active={isActive(item.href)}
                        collapsed={collapsed}
                      />
                    ))}
                </nav>

                {canViewHrNav && (
                  <div className="mt-0.5">
                    <CollapsedTip label="Хүний нөөц" collapsed={collapsed}>
                    <button
                      onClick={() => setHrOpen((v) => !v)}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-lg py-2 transition-colors hover:bg-slate-50 dark:hover:bg-[#252630]",
                        collapsed ? "justify-center px-3" : "px-3",
                      )}
                    >
                      <UserCog className={cn("h-[17px] w-[17px] shrink-0", hrActive ? parentActive : parentIdle)} />
                      {!collapsed && (
                        <>
                          <span className={cn("flex-1 text-left text-[13px] font-medium", hrActive ? parentActive : parentIdleLabel)}>
                            Хүний нөөц
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                              hrOpen ? "rotate-180" : "rotate-0",
                            )}
                          />
                        </>
                      )}
                      {/* Хураасан үед дэд цэстэйг илтгэх жижиг сум */}
                      {collapsed && (
                        <ChevronDown
                          className={cn(
                            "absolute right-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                            hrOpen ? "rotate-180" : "rotate-0",
                          )}
                        />
                      )}
                    </button>
                    </CollapsedTip>

                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200",
                        hrOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="overflow-hidden">
                        <nav className="space-y-0.5">
                          {NAV_HR.map((item) => (
                            <NavItem
                              key={item.href}
                              {...item}
                              active={isActive(item.href)}
                              collapsed={collapsed}
                              indent
                            />
                          ))}
                        </nav>
                      </div>
                    </div>
                  </div>
                )}

                {/* Тохиргоо nested dropdown — системийн тохиргоо харах эрхтэй хэрэглэгчид */}
                {canViewConfig && (
                  <div className="mt-0.5">
                    <CollapsedTip label="Тохиргоо" collapsed={collapsed}>
                    <button
                      onClick={() => setConfigOpen((v) => !v)}
                      className={cn(
                        "relative flex w-full items-center gap-2 rounded-lg py-2 transition-colors hover:bg-slate-50 dark:hover:bg-[#252630]",
                        collapsed ? "justify-center px-3" : "px-3",
                      )}
                    >
                      <SlidersHorizontal className={cn("h-[17px] w-[17px] shrink-0", configActive ? parentActive : parentIdle)} />
                      {!collapsed && (
                        <>
                          <span className={cn("flex-1 text-left text-[13px] font-medium", configActive ? parentActive : parentIdleLabel)}>
                            Тохиргоо
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                              configOpen ? "rotate-180" : "rotate-0",
                            )}
                          />
                        </>
                      )}
                      {/* Хураасан үед дэд цэстэйг илтгэх жижиг сум */}
                      {collapsed && (
                        <ChevronDown
                          className={cn(
                            "absolute right-0.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-slate-400 dark:text-[#8391a2] transition-transform duration-200",
                            configOpen ? "rotate-180" : "rotate-0",
                          )}
                        />
                      )}
                    </button>
                    </CollapsedTip>

                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200",
                        configOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="overflow-hidden">
                        <nav className="space-y-0.5">
                          {NAV_CONFIG_GROUPS.map((group) => (
                            <div key={group.label} className="pt-1.5 first:pt-0.5">
                              {!collapsed && (
                                <p className="pb-0.5 pl-6 pr-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400/80 dark:text-[#6c7a8d]">
                                  {group.label}
                                </p>
                              )}
                              {group.items.map((item) => (
                                <NavItem
                                  key={item.href}
                                  {...item}
                                  active={isActive(item.href)}
                                  collapsed={collapsed}
                                  indent
                                />
                              ))}
                            </div>
                          ))}
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Хураах/дэлгэх товч — sidebar-ын доод хэсэгт */}
      <div className="shrink-0 border-t border-slate-100 dark:border-[#37394d] p-3">
        <CollapsedTip label="Цэс дэлгэх" collapsed={collapsed}>
        <button
          onClick={toggleCollapsed}
          className={cn(
            "flex w-full items-center rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-[#97aac1] dark:hover:bg-[#252630] dark:hover:text-[#e2eeff]",
            collapsed ? "justify-center" : "gap-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[17px] w-[17px] shrink-0" />
          ) : (
            <>
              <span className="flex-1 text-left">Хураах</span>
              <PanelLeftClose className="h-[17px] w-[17px] shrink-0" />
            </>
          )}
        </button>
        </CollapsedTip>
      </div>
    </aside>
  );
}
