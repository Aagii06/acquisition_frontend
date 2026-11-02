"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Eye, FileSpreadsheet, Loader2, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { canImportLegacyData } from "@/lib/role-utils";
import { legacyImportApi, type ImportMode, type ImportState } from "@/lib/legacy-import/api";
import { BoundaryStep } from "./_components/boundary-step";
import { ParcelStep } from "./_components/parcel-step";
import { ReportStep } from "./_components/report-step";
import { SummaryStep } from "./_components/summary-step";
import { ValuationStep } from "./_components/valuation-step";
import { ProjectsStep } from "./_components/projects-step";
import { RollbackDialog } from "./_components/rollback-dialog";
import { AttachmentsImport } from "./_components/attachments-import";
import { GusJobBanner, inputClass, primaryButton, secondaryButton, td, th, theadClass } from "./_components/shared";

type StepKey = "boundary" | "parcels" | "reports" | "projects" | "summary";

/** Горим бүрийн алхам: бүтэн — хил → нэгж талбар → үнэлгээ; зөвхөн үнэлгээ — эксэл (+ заавал биш мэдээлэл, хил). */
const STEPS: Record<ImportMode, { key: StepKey; label: string }[]> = {
  full: [
    { key: "boundary", label: "Чөлөөлөлтийн хил" },
    { key: "parcels", label: "Нэгж талбар" },
    { key: "reports", label: "Үнэлгээ" },
    { key: "summary", label: "Нэгтгэл ба оруулах" },
  ],
  valuation: [
    { key: "reports", label: "Үнэлгээний эксэл" },
    { key: "projects", label: "Чөлөөлөлтийн мэдээлэл ба хил" },
    { key: "summary", label: "Нэгтгэл ба оруулах" },
  ],
};

const PAGE_SIZE = 20;

const modeOf = (state: ImportState | undefined): ImportMode => state?.session.mode ?? "full";

const STATUS_LABEL: Record<ImportState["session"]["status"], string> = {
  draft: "Ноорог", committing: "Оруулж байна", committed: "Оруулсан", failed: "Амжилтгүй", rolled_back: "Устгасан",
};

/**
 * ГУС-ын шалгалт (нэгж талбар / үнэлгээ) явж байгаа эсвэл тасарсан. Тасарсан
 * ажил нь харгалзах шалгалт ДУУСААГҮЙ үед л — файлыг дахин оруулсны дараа
 * санах ойд үлдсэн хуучин алдаа алхмыг хаах ёсгүй.
 */
const gusJob = (state: ImportState | undefined) => {
  const job = state?.job;
  if (!state || !job || job.kind === "commit" || job.state === "done") return null;
  if (job.state === "failed") {
    const view = job.kind === "parcels" ? state.parcels : state.reports;
    if (!view || view.gusDone) return null;
  }
  return job;
};

/** Үнэлгээний ГУС-ын шалгалт дуусаагүй (оруулаагүй бол саад биш). */
const reportsPending = (state: ImportState) => Boolean(state.reports && !state.reports.gusDone);

/**
 * Алхам бүр өмнөх алхам нь алдаагүй, ГУС-ын шалгалт нь ДУУССАН бол нээгдэнэ —
 * дуусаагүй байхад цааш явбал нэгтгэл, тохиргоо дутуу мэдээлэл дээр хийгдэнэ.
 */
function reachable(state: ImportState | undefined, step: StepKey): boolean {
  if (!state) return step === "boundary";
  if (state.session.status === "committed" || state.session.status === "rolled_back") return true;
  if (modeOf(state) === "valuation") {
    if (step === "reports") return true;
    return Boolean(state.reports?.canProceed) && !reportsPending(state) && !gusJob(state);
  }
  if (step === "boundary") return true;
  if (!state.boundary?.canProceed) return false;
  if (step === "parcels") return true;
  if (!state.parcels?.canProceed || !state.parcels.gusDone) return false;
  if (step === "reports") return true;
  return !reportsPending(state) && !gusJob(state);
}

/** Хуудасны дугаарууд: эхний, сүүлийн, одоогийнхын хөрш; завсарт null (…). */
function pageNumbers(page: number, totalPages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

/** Чөлөөлөлтийн нэрс — олон бол эхний хэдийг харуулж, бусдыг дэлгэнэ. */
function AcquisitionNames({ names, count }: { names: string[]; count: number }) {
  const [open, setOpen] = useState(false);
  if (names.length === 0) return <>{count || "—"}</>;
  const limit = 3;
  const shown = open ? names : names.slice(0, limit);
  return (
    <div className="min-w-[220px] max-w-[360px] space-y-0.5 whitespace-normal break-words">
      {shown.map((n, i) => <div key={`${n}-${i}`}>{n}</div>)}
      {names.length > limit && (
        <button className="text-[11px] font-medium text-[#02c0ce] hover:underline" onClick={() => setOpen((o) => !o)}>
          {open ? "Хураах" : `+${names.length - limit} бусад`}
        </button>
      )}
    </div>
  );
}

function LegacyImportPage() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const sessionID = params.get("session");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [step, setStep] = useState<StepKey>("boundary");
  const [creating, setCreating] = useState(false);
  const [rollbackID, setRollbackID] = useState<string | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  // Хайлтыг сервер рүү бичих бүрд биш, бичиж дуусахад илгээнэ.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(nameQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [nameQuery]);

  useEffect(() => setAllowed(canImportLegacyData()), []);

  const sessions = useQuery({
    queryKey: ["legacy-import", "sessions", page, debouncedQuery],
    queryFn: () => legacyImportApi.sessions({ page, pageSize: PAGE_SIZE, q: debouncedQuery }),
    enabled: allowed === true && !sessionID,
    placeholderData: keepPreviousData,
  });
  const sessionItems = sessions.data?.items ?? [];
  const total = sessions.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Сүүлийн хуудасны сүүлчийн мөрийг устгавал хоосон хуудсанд үлдэхгүй.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const stateKey = ["legacy-import", "session", sessionID];
  const stateQuery = useQuery({
    queryKey: stateKey,
    // Анх нээхэд loader харуулна; дараагийн шинэчлэлт чимээгүй.
    queryFn: () => legacyImportApi.get(sessionID!, queryClient.getQueryData(stateKey) !== undefined),
    enabled: allowed === true && Boolean(sessionID),
  });
  const state = stateQuery.data;

  // ГУС-ын шалгалт / оруулалт явж байхад ЗӨВХӨН явцыг (хөнгөн, loader-гүй)
  // шалгана; дуусмагц бүтэн төлөвийг нэг удаа татна.
  const busy = state?.job?.state === "running" || state?.session.status === "committing";
  const progress = useQuery({
    queryKey: ["legacy-import", "progress", sessionID],
    queryFn: () => legacyImportApi.progress(sessionID!),
    enabled: allowed === true && Boolean(sessionID) && busy,
    refetchInterval: 1000,
    // Хариу бүр шинэ объект — ижил «дууссан» хариу давтагдсан ч effect ажиллана.
    structuralSharing: false,
  });
  useEffect(() => {
    const p = progress.data;
    if (!p || !state || !busy) return;
    if (p.job?.state === "running" || p.status === "committing") {
      queryClient.setQueryData<ImportState>(stateKey, { ...state, job: p.job, session: { ...state.session, status: p.status } });
    } else {
      if (p.job?.state === "done" && p.job.kind !== "commit" && state.job?.state === "running") {
        toast.success("ГУС-аас татаж дууслаа — дараагийн алхам руу шилжиж болно");
      }
      queryClient.invalidateQueries({ queryKey: stateKey });
    }
  }, [progress.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Сэргээсэн импорт — хамгийн сүүлд хүрсэн алхам руу.
  useEffect(() => {
    if (!state) return;
    setStep((current) => {
      if (current !== "boundary") return current;
      if (state.session.status === "committed" || state.session.status === "rolled_back") return "summary";
      if (state.reports) return reachable(state, "summary") ? "summary" : "reports";
      if (modeOf(state) === "valuation") return "reports";
      if (state.parcels) return "reports";
      if (state.boundary?.canProceed) return "parcels";
      return "boundary";
    });
  }, [state?.session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setState = (next: ImportState) => queryClient.setQueryData(["legacy-import", "session", sessionID], next);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["legacy-import", "session", sessionID] });

  const start = async (mode: ImportMode) => {
    setCreating(true);
    try {
      const { id } = await legacyImportApi.create(mode);
      setStep("boundary");
      router.push(`/legacy_import?session=${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await legacyImportApi.remove(id);
      queryClient.invalidateQueries({ queryKey: ["legacy-import", "sessions"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Алдаа гарлаа");
    }
  };

  // Ноорог жагсаалтад харагдахгүй тул гарахдаа шууд устгана. ГУС-ын шалгалт
  // явж байвал сервер татгалзана — тэр нь дараа нь (1 цагийн дараа) цэвэрлэгдэнэ.
  const leave = async () => {
    if (state?.session.status === "draft") {
      await legacyImportApi.remove(state.session.id).catch(() => undefined);
    }
    queryClient.invalidateQueries({ queryKey: ["legacy-import", "sessions"] });
    router.push("/legacy_import");
  };

  if (allowed === null) return null;
  if (!allowed) {
    return <div className="ap-card p-8 text-center text-[13px] text-slate-500">Энэ хуудсыг харах эрх байхгүй байна.</div>;
  }

  const locked = state?.session.status === "committed" || state?.session.status === "committing" || state?.session.status === "rolled_back";
  const steps = STEPS[modeOf(state)];
  const nextStep = steps[steps.findIndex((s) => s.key === step) + 1];
  // Дэлгэрэнгүйн гарчиг — импортын чөлөөлөлтийн нэр (файл оруулаагүй ноорогт хоосон).
  const acquisitionNames = Array.from(
    new Set(
      state?.result?.acquisitions?.names?.length
        ? state.result.acquisitions.names
        : state?.summary?.acquisitions?.length
          ? state.summary.acquisitions.map((a) => a.name)
          : state?.boundary?.rows.length
            ? state.boundary.rows.map((r) => r.name)
            : (state?.reports?.projects ?? []).map((p) => p.name),
    ),
  ).filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {sessionID && (
          <button
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:border-[#02c0ce] hover:text-[#02c0ce] dark:border-[#37394d] dark:bg-[#1e1f27] dark:text-slate-300"
            onClick={leave}
            title={state?.session.status === "draft" ? "Импортын жагсаалт руу буцна. Оруулаагүй импорт хадгалагдахгүй — устгагдана" : "Импортын жагсаалт руу буцах"}>
            <ArrowLeft className="h-4 w-4" /> Буцах
          </button>
        )}
        <div className="min-w-0 flex-1">
          {sessionID && acquisitionNames.length > 0 ? (
            <>
              <h1 className="break-words text-xl font-bold text-slate-800 dark:text-white" title={acquisitionNames.join("\n")}>
                {acquisitionNames[0]}
                {acquisitionNames.length > 1 && (
                  <span className="ml-2 text-[13px] font-medium text-slate-400">+{acquisitionNames.length - 1} чөлөөлөлт</span>
                )}
              </h1>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                Хуучин мэдээлэл оруулах{state && ` · ${STATUS_LABEL[state.session.status]}`}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">Хуучин мэдээлэл оруулах</h1>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                Чөлөөлөлтийн хил, нэгж талбар, үнэлгээний файлыг шалгаж түр хадгална. «Оруулах» дарсны дараа л системд бүртгэгдэнэ.
              </p>
            </>
          )}
        </div>
      </div>

      {!sessionID && showAttachments && <AttachmentsImport onClose={() => setShowAttachments(false)} />}

      {!sessionID && (
        <div className="ap-card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-white">Импортууд</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button className={secondaryButton} onClick={() => setShowAttachments(true)} disabled={showAttachments}
                title="Хавтасны PDF-ийг нэрээр нь (= нэгж талбарын дугаар) нэгж талбарт «Нөхөх олговор олгосон баримт» болгон хавсаргана">
                <Paperclip className="h-4 w-4" /> Хавсралт оруулах
              </button>
              <button className={secondaryButton} onClick={() => start("valuation")} disabled={creating}
                title="Зөвхөн үнэлгээний эксэл — хил, нэгж талбарын файлгүй (архивын адил)">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Зөвхөн үнэлгээ
              </button>
              <button className={primaryButton} onClick={() => start("full")} disabled={creating}
                title="Чөлөөлөлтийн хил + нэгж талбар + үнэлгээ">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Шинэ импорт
              </button>
            </div>
          </div>
          {(total > 0 || debouncedQuery || nameQuery) && (
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={cn(inputClass, "w-full pl-9 pr-8")}
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Чөлөөлөлтийн нэрээр хайх"
              />
              {nameQuery && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setNameQuery("")} title="Цэвэрлэх">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {sessions.isLoading && <p className="text-[12px] text-slate-500">Уншиж байна…</p>}
          {sessions.error && <p className="text-[12px] text-[#f8285a]">{(sessions.error as Error).message}</p>}
          {sessions.data && total === 0 && !debouncedQuery && <p className="text-[12px] text-slate-500">Одоогоор импорт алга.</p>}
          {sessions.data && total === 0 && debouncedQuery && (
            <p className="text-[12px] text-slate-500">«{debouncedQuery}» нэртэй чөлөөлөлттэй импорт олдсонгүй.</p>
          )}
          {sessionItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead className={theadClass}>
                  <tr>
                    <th className={th}>Огноо</th>
                    <th className={th}>Хэрэглэгч</th>
                    <th className={th}>Төлөв</th>
                    <th className={th}>Чөлөөлөлт</th>
                    <th className={th}>Нэгж талбар</th>
                    <th className={th}>Үнэлгээ</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {sessionItems.map((s) => (
                    <tr
                      key={s.id}
                      onClick={(e) => {
                        // Дотор нь байгаа товч өөрөө ажиллана; текст сонгож байвал шилжихгүй.
                        if ((e.target as HTMLElement).closest("a, button")) return;
                        if (window.getSelection()?.toString()) return;
                        const href = `/legacy_import?session=${s.id}`;
                        if (e.metaKey || e.ctrlKey) {
                          window.open(href, "_blank");
                          return;
                        }
                        router.push(href);
                      }}
                      className="cursor-pointer border-b border-slate-50 align-top transition-colors hover:bg-[#02c0ce]/[0.07] dark:border-white/[0.04] dark:hover:bg-[#02c0ce]/[0.12]"
                    >
                      <td className={td}>{new Date(s.updatedAt).toLocaleString("mn-MN")}</td>
                      <td className={td}>{s.createdBy}</td>
                      <td className={td}>
                        {STATUS_LABEL[s.status]}
                        {s.rollback && (
                          <span className="block text-[11px] text-slate-400">
                            {s.rollback.by}, {new Date(s.rollback.at).toLocaleString("mn-MN")}
                          </span>
                        )}
                      </td>
                      <td className={td}><AcquisitionNames names={s.acquisitionNames ?? []} count={s.acquisitions} /></td>
                      <td className={td}>{s.mode === "valuation" ? "—" : s.parcels}</td>
                      <td className={td}>{s.reportRows}</td>
                      <td className={td}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-[#252630]"
                            onClick={() => router.push(`/legacy_import?session=${s.id}`)}>
                            <Eye className="h-3.5 w-3.5" /> Дэлгэрэнгүй
                          </button>
                          {s.status === "committed" && (
                            <button
                              disabled={!s.deletable}
                              title={s.deletable ? "Энэ импортоор оруулсан мэдээллийг санаас устгана"
                                : "Импортын бүртгэл (устгах жагсаалт) байхгүй — өмнөх хувилбараар оруулсан импорт"}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#f8285a]/40 px-3 text-[12px] font-medium text-[#f8285a] hover:bg-[#f8285a]/5 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => setRollbackID(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" /> Устгах
                            </button>
                          )}
                          {s.status === "failed" && (
                            <button title="Устгах" className="text-slate-400 hover:text-[#f8285a]" onClick={() => remove(s.id)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-[#37394d]">
              <p className="text-[12px] text-slate-400 dark:text-slate-500">
                Нийт {total} импортын {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}-г харуулж байна
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-400"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {pageNumbers(page, totalPages).map((p, i) =>
                    p === null ? (
                      <span key={`gap-${i}`} className="px-1 text-[13px] text-slate-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={cn(
                          "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[13px] font-medium transition-colors",
                          page === p
                            ? "border-[#02c0ce] bg-[#02c0ce] text-white"
                            : "border-slate-200 text-slate-600 hover:border-[#02c0ce] hover:text-[#02c0ce] dark:border-white/[0.08] dark:text-slate-400",
                        )}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-[#02c0ce] hover:text-[#02c0ce] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-400"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {rollbackID && (
        <RollbackDialog
          sessionID={rollbackID}
          onClose={() => setRollbackID(null)}
          onDone={() => {
            setRollbackID(null);
            queryClient.invalidateQueries({ queryKey: ["legacy-import"] });
          }}
        />
      )}

      {sessionID && stateQuery.error && (
        <div className="ap-card p-4 text-[13px] text-[#f8285a]">{(stateQuery.error as Error).message}</div>
      )}

      {sessionID && state && (
        <>
          <ol className="ap-card flex flex-wrap gap-2 p-3">
            {modeOf(state) === "valuation" && (
              <li className="flex items-center px-2 text-[12px] font-semibold text-[#02c0ce]">Зөвхөн үнэлгээ:</li>
            )}
            {steps.map((s, index) => {
              const open = reachable(state, s.key);
              const done =
                (s.key === "boundary" && state.boundary?.canProceed) ||
                (s.key === "parcels" && state.parcels?.canProceed && state.parcels.gusDone) ||
                (s.key === "reports" && state.reports?.canProceed && state.reports.gusDone) ||
                (s.key === "projects" && (state.reports?.projects ?? []).some((p) => p.hasInfo || p.areaM2 !== null)) ||
                (s.key === "summary" && state.session.status === "committed");
              return (
                <li key={s.key}>
                  <button
                    disabled={!open}
                    onClick={() => setStep(s.key)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      step === s.key ? "bg-[#02c0ce] text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#252630]",
                      !open && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      step === s.key ? "bg-white/25" : done ? "bg-[#0acf97] text-white" : "bg-slate-200 dark:bg-white/[0.1]",
                    )}>
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>

          {gusJob(state) && <GusJobBanner job={gusJob(state)!} />}

          {step === "boundary" && <BoundaryStep state={state} onUpdated={setState} locked={locked} />}
          {step === "parcels" && <ParcelStep state={state} onUpdated={setState} locked={locked} />}
          {step === "reports" && (modeOf(state) === "valuation"
            ? <ValuationStep state={state} onUpdated={setState} locked={locked} />
            : <ReportStep state={state} onUpdated={setState} locked={locked} />)}
          {step === "projects" && <ProjectsStep state={state} onUpdated={setState} locked={locked} />}
          {step === "summary" && <SummaryStep state={state} onCommitted={refresh} />}

          {nextStep && (
            <div className="flex items-center justify-end gap-3">
              {!reachable(state, nextStep.key) && state.job?.state === "running" && state.job.kind !== "commit" && (
                <span className="text-[12px] text-slate-500">ГУС-аас татаж дуусахыг хүлээнэ үү</span>
              )}
              {!reachable(state, nextStep.key) && !gusJob(state) && reportsPending(state) && (
                <span className="text-[12px] text-[#f8285a]">ГУС-ын шалгалт дуусаагүй — үнэлгээний файлаа «Дахин шалгах»-аар дахин оруулна уу</span>
              )}
              <button
                className={primaryButton}
                disabled={!reachable(state, nextStep.key)}
                onClick={() => setStep(nextStep.key)}
              >
                {step === "projects" && !(state.reports?.projects ?? []).some((p) => p.hasInfo || p.areaM2 !== null)
                  ? "Алгасах →"
                  : "Дараагийн алхам →"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LegacyImportPage />
    </Suspense>
  );
}
