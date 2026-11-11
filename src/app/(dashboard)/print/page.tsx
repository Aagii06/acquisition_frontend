"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GS_WFS, gsAuthHeaders } from "@/lib/geoserver";
import { useAcquisitionOptions } from "@/hooks/use-acquisition-options";
import { PRINT_MAX_ACQUISITIONS } from "@/components/map/print-map-dialog";

// OpenLayers/canvas — зөвхөн хөтөч дээр.
const PrintMapDialog = dynamic(() => import("@/components/map/print-map-dialog"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-[#252630]" />,
});

/**
 * Нэг хэвлэлтэд багтах чөлөөлөлтүүдийн НИЙЛСЭН хүрээний дээд хэмжээ (км).
 * Хол зайтай чөлөөлөлтүүдийг нэг хуудсанд оруулбал масштаб хэт жижгэрч,
 * нэгж талбарууд ялгагдахгүй болдог.
 */
const MAX_SPAN_KM = 10;

type BBox = [number, number, number, number]; // EPSG:4326 — minLon, minLat, maxLon, maxLat

/** Чөлөөлөлтийн хилийн хүрээ (WFS). Хилгүй бол null. */
async function fetchAcqBBox(id: string): Promise<BBox | null> {
  const p = new URLSearchParams({
    service: "WFS", version: "1.1.0", request: "GetFeature",
    typeName: "land:v_acquisition_boundary", CQL_FILTER: `acquisition_id='${id.replace(/'/g, "''")}'`,
    outputFormat: "application/json", propertyName: "geometry",
  });
  const r = await fetch(GS_WFS, {
    method: "POST",
    headers: gsAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: p.toString(),
  });
  if (!r.ok) throw new Error(`Чөлөөлөлтийн хил ачаалагдсангүй (${r.status})`);
  const json = await r.json();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (n: unknown): void => {
    if (!Array.isArray(n)) return;
    if (typeof n[0] === "number" && typeof n[1] === "number") {
      minX = Math.min(minX, n[0]); minY = Math.min(minY, n[1]);
      maxX = Math.max(maxX, n[0]); maxY = Math.max(maxY, n[1]);
    } else n.forEach(walk);
  };
  (json?.features ?? []).forEach((f: { geometry?: { coordinates?: unknown } }) => walk(f.geometry?.coordinates));
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/** Хүрээнүүдийн НИЙЛСЭН хүрээний урт талын хэмжээ (км). */
function spanKm(boxes: BBox[]): number {
  if (!boxes.length) return 0;
  const minX = Math.min(...boxes.map((b) => b[0]));
  const minY = Math.min(...boxes.map((b) => b[1]));
  const maxX = Math.max(...boxes.map((b) => b[2]));
  const maxY = Math.max(...boxes.map((b) => b[3]));
  const midLat = ((minY + maxY) / 2) * (Math.PI / 180);
  const w = (maxX - minX) * 111.32 * Math.cos(midLat);
  const h = (maxY - minY) * 110.57;
  return Math.max(w, h);
}

/**
 * «Хэвлэх» — 1–3 чөлөөлөлтийг НЭГ ажлын зурагт хэвлэх хуудас.
 *
 * Хэвлэх тохиргоо, давхарга, PDF татах бүгд дашбоардын «Ажлын зураг»
 * цонхтой (print-map-dialog) ЯГ ИЖИЛ — энд зөвхөн чөлөөлөлт сонгогч нэмэгдэнэ.
 */
export default function PrintPage() {
  const { acquisitions, isLoading } = useAcquisitionOptions();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Сонгосон чөлөөлөлтүүдийн хүрээ — зайны шалгалтад.
  const bboxes = useRef(new Map<string, BBox | null>());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const byId = useMemo(() => new Map(acquisitions.map((a) => [a.id, a])), [acquisitions]);
  const full = selected.length >= PRINT_MAX_ACQUISITIONS;

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return acquisitions
      .filter((a) => !selected.includes(a.id))
      .filter(
        (a) =>
          !q ||
          (a.acquisition_name ?? "").toLowerCase().includes(q) ||
          (a.plan_code ?? "").toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [acquisitions, selected, query]);

  /* Нэмэхийн ӨМНӨ зайг шалгана: шинэ чөлөөлөлтийг сонгосонтой нийлүүлэхэд
     хүрээ нь MAX_SPAN_KM-ээс хэтэрвэл нэмэхгүй. Хилгүй чөлөөлөлт зураг дээр
     гардаггүй тул шалгалтад оролцохгүй. */
  const add = async (id: string) => {
    if (checking || selected.includes(id) || selected.length >= PRINT_MAX_ACQUISITIONS) return;
    setOpen(false);
    setChecking(true);
    try {
      let box = bboxes.current.get(id);
      if (box === undefined) {
        box = await fetchAcqBBox(id);
        bboxes.current.set(id, box);
      }
      if (box) {
        const others = selected.map((x) => bboxes.current.get(x)).filter((b): b is BBox => !!b);
        const span = spanKm([...others, box]);
        if (others.length && span > MAX_SPAN_KM) {
          toast.error(
            `Сонгосон чөлөөлөлтүүдээс хэт хол байна (нийт хүрээ ${span.toFixed(1)} км, дээд тал нь ${MAX_SPAN_KM} км)`,
          );
          return;
        }
      }
      setSelected((prev) => (prev.includes(id) || prev.length >= PRINT_MAX_ACQUISITIONS ? prev : [...prev, id]));
      setQuery("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };
  const remove = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));

  const selector = (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Чөлөөлөлт ({selected.length} / {PRINT_MAX_ACQUISITIONS})
      </label>

      <div ref={wrapRef} className="relative w-full">
        <div className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 focus-within:border-[#02c0ce] dark:border-[#37394d] dark:bg-[#1e1f27]">
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />
          ) : (
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
          <input
            value={query}
            disabled={full || checking}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={
              full
                ? `Хамгийн ихдээ ${PRINT_MAX_ACQUISITIONS} чөлөөлөлт сонгоно`
                : isLoading
                  ? "Ачаалж байна..."
                  : "Чөлөөлөлт хайх (нэр, код)"
            }
            className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 outline-none disabled:cursor-not-allowed dark:text-slate-200"
          />
        </div>
        {open && !full && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-[#1e1f27]">
            <div className="max-h-64 overflow-y-auto">
              {options.length === 0 ? (
                <div className="px-3 py-3 text-[12px] text-slate-400">Олдсонгүй</div>
              ) : (
                options.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void add(a.id);
                    }}
                    className="block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50 dark:border-[#252630] dark:hover:bg-[#252630]"
                  >
                    <span className="block text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
                      {a.acquisition_name || "—"}
                    </span>
                    {a.plan_code && <span className="text-[10.5px] text-slate-400">{a.plan_code}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Сонгосон чөлөөлөлтүүд — мөр мөрөөр, сонгосон дарааллаар. */}
      {selected.length > 0 && (
        <ul className="mt-2 w-full divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-[#37394d] dark:border-[#37394d]">
          {selected.map((id, i) => {
            const a = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px]">
                <span className="w-4 shrink-0 text-right tabular-nums text-slate-400">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200" title={a?.acquisition_name}>
                  {a?.acquisition_name || id.slice(0, 8)}
                </span>
                {a?.plan_code && <span className="shrink-0 text-[11px] text-slate-400">{a.plan_code}</span>}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  title="Хасах"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Хэвлэх</h1>
        <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
          1–{PRINT_MAX_ACQUISITIONS} чөлөөлөлтийг нэг ажлын зурагт нэгтгэн хэвлэнэ
        </p>
      </div>
      {/* overflow-hidden БАЙХГҮЙ — хайлтын жагсаалт ба урьдчилан харах хэсэг тайрагдахгүй. */}
      <div className="ap-card rounded-2xl">
        <PrintMapDialog embedded acquisitionIds={selected} selector={selector} />
      </div>
    </div>
  );
}
