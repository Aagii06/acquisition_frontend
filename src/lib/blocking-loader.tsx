"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { cn } from "./utils";
import {
  subscribe,
  getScreenBlocking,
  getContentLoading,
  getRefreshing,
  getBooting,
  endBoot,
} from "./blocking-loader-state";

export function BlockingLoaderProvider({ children }: { children: React.ReactNode }) {
  const blocking = useSyncExternalStore(
    subscribe,
    getScreenBlocking,
    () => false,
  );

  return (
    <>
      {children}
      {blocking && <BlockingOverlay />}
      <BootLoader />
    </>
  );
}

/**
 * Бүтэн дэлгэцийг (sidebar, header-тэй нь) бүрэн далдлах loader. Нэвтрэх
 * хуудас болон самбар хоёулаа ЯГ ЭНИЙГ харуулдаг тул шилжилт тасралтгүй.
 */
export function FullPageLoader() {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-background"
      style={{ pointerEvents: "all" }}
      role="status"
      aria-live="polite"
    >
      <LoaderCard />
    </div>
  );
}

/** Эхний уншилт дууссаны дараа хүлээх хугацаа — дараагийн query эхлэх зай. */
const BOOT_SETTLE_MS = 400;

/**
 * Нэвтэрсний дараа (`startBoot`) самбарын эхний уншилт дуустал бүтэн дэлгэцийн
 * loader харуулна. Хуудас mount болж query-нүүд эхлэх хүртэл хоромхон
 * "уншилтгүй" мөч байдаг тул шууд биш, BOOT_SETTLE_MS тогтвортой байсны дараа
 * унтарна.
 */
function BootLoader() {
  const booting = useSyncExternalStore(subscribe, getBooting, () => false);
  const navPending = useSyncExternalStore(
    subscribe,
    () => getContentLoading() === "nav",
    () => false,
  );
  const initialFetching =
    useIsFetching({ predicate: (q) => q.state.data === undefined }) > 0;
  const busy = navPending || initialFetching;
  useEffect(() => {
    if (!booting || busy) return;
    const timer = window.setTimeout(endBoot, BOOT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [booting, busy]);
  return booting ? <FullPageLoader /> : null;
}

function BlockingOverlay() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      style={{ pointerEvents: "all" }}
    >
      <LoaderCard />
    </div>
  );
}

/**
 * Контентын хэсгийн loader — `relative` эцэг элемент дотор байрлана. Sidebar
 * болон табууд түгжигдэхгүй тул хэрэглэгч ачаалж байх хооронд өөр таб руу
 * шилжиж чадна.
 */
/** Loader харагдахаас өмнө хүлээх хугацаа — үүнээс хурдан хүсэлт анивчихгүй. */
const SHOW_DELAY_MS = 300;

export function ContentLoader() {
  const navPending = useSyncExternalStore(
    subscribe,
    () => getContentLoading() === "nav",
    () => false,
  );
  // Зөвхөн ӨГӨГДӨЛГҮЙ (анх уншиж буй) query-д loader харуулна. Кэштэй
  // өгөгдлийн арын шинэчлэлт (stale → refetch) ЧИМЭЭГҮЙ явна — урьд нь
  // таб руу буцах бүрд бүх GET overlay асааж хуудас "дахин ачаалж" буй мэт
  // харагддаг байв.
  const initialFetching =
    useIsFetching({ predicate: (q) => q.state.data === undefined }) > 0;
  const refreshing = useSyncExternalStore(subscribe, getRefreshing, () => false);
  const target = navPending ? "nav" : initialFetching ? "read" : refreshing ? "refresh" : null;
  // Хурдан (< SHOW_DELAY_MS) дуусах хүсэлтэд loader огт гарахгүй — эс бөгөөс
  // хайлтын санал, жагсаалтын хуудас солих г.м. бүрд spinner гялс хийж анивчдаг.
  const [mode, setMode] = useState<typeof target>(null);
  useEffect(() => {
    if (!target) {
      setMode(null);
      return;
    }
    const timer = window.setTimeout(() => setMode(target), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [target]);
  if (!mode) return null;
  if (mode === "refresh") {
    // ⟳ товч: агуулга харагдсаар, дээр нь саарал давхарга + голд spinner.
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-500/30">
        <Spinner />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "absolute inset-0 z-40 flex items-center justify-center",
        // Шинэ хуудас: өмнөх табын агуулгыг бүрэн далдална.
        mode === "nav" ? "bg-background" : "bg-background/60 backdrop-blur-[1px]",
      )}
    >
      <LoaderCard />
    </div>
  );
}

function LoaderCard() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-[#1e1f27] px-8 py-6 shadow-2xl">
      <Spinner />
      <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
        Уншиж байна...
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-8 w-8 animate-spin text-[#02c0ce]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
