"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toLonLat, transformExtent } from "ol/proj";
import GeoJSON from "ol/format/GeoJSON";
import type Polygon from "ol/geom/Polygon";
import type MultiPolygon from "ol/geom/MultiPolygon";
import { ChevronDown, Download, ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import { landApi, departmentApi } from "@/lib/api";
import { STATUS_LABELS } from "@/types";
import type { DroneImage } from "@/types";
import { GS_WFS, gsAuthHeaders, droneTileUrl, GS_GWC_MAX_ZOOM } from "@/lib/geoserver";
import {
  layerDef,
  geoServerName,
  combineCql,
  parcelStatusIdFromLayer,
  AGREED_GROUP,
  AGREED_CODE_LAYERS,
  AGREED_CODE_LAYER_IDS,
  SEC_GROUP,
  SEC_CODE_LAYERS,
  SEC_CODE_LAYER_IDS,
  type MapLayerId,
} from "./layers";
import { useParcelStatusLayers } from "./use-parcel-status-layers";
import { useParcelStatusRules } from "@/lib/use-parcel-status-rules";
import {
  PRINT_BOUNDARY_IDS,
  PRINT_STYLES,
  PARCEL_STATUS_PRINT_STYLE,
  PRINT_SATELLITE_URLS,
  PRINT_SATELLITE_MAX_ZOOM,
} from "./print-layers";
import {
  composePrintPage,
  downloadCanvasAsPdf,
  printMapAreaSizePx,
  printInfoBandPx,
  printScaleFor,
  renderPrintMapCanvas,
  loadImage,
  type PrintLayerSpec,
  type PrintOrientation,
  type PrintPaperSize,
  type PrintInfo,
  type PrintLegendItem,
  type PrintMapViewInfo,
} from "./print-map";

/** Зураг боловсруулах тохиргоо — ноорог ба хэрэгжсэн хоёул ийм хэлбэртэй. */
interface PrintSettings {
  title: string;
  paper: PrintPaperSize;
  orientation: PrintOrientation;
  hiddenLayers: Set<string>;
  drones: Set<string>;
  /** СОНГОСОН ГУС-ийн дэд давхаргууд (зөвшилцсөн зураг / хамгаалалтын зурвас) */
  gusLayers: Set<string>;
  /** Эцсийн бус төлөвтэй нэгж талбарын өмчлөгчийн нэрийг зураг дээр бичих */
  showOwners: boolean;
}

/**
 * "Ажлын зураг" — ДАШБОАРДААС хэвлэх цонх.
 *
 * ЯАГААД OPENLAYERS АШИГЛААГҮЙ: OL-ийн canvas-аас зураг "буулгах" арга нь
 * хэвлэхийн том хэмжээнд суурь зургийг л буулгаж, WMS давхаргуудыг (нэгж
 * талбар, чөлөөлөлтийн хил, дүүрэг/хорооны хил) ЧИМЭЭГҮЙ орхидог байв.
 * Одоо renderPrintMapCanvas нь давхарга бүрийг ШУУД татаж canvas дээр
 * зурна — далд төлөв, тайминг байхгүй, алдаа гарвал ХАРАГДАНА.
 *
 * Зургийн хэмжээг хуудасны зургийн талбайн ХАРЬЦААГААР үүсгэдэг тул
 * composePrintPage-ийн "cover" тайралт юу ч огтолдоггүй.
 */

// Нэгж талбарын ТӨЛӨВҮҮД нь `parcel_status` бүртгэлээс ирнэ (доор
// `useParcelStatusLayers`). Хатуу жагсаалт байхгүй тул шинэ төлөв нэмэхэд
// хэвлэх цонх өөрөө түүнийг тайлбар/задаргаа/давхаргадаа оруулна.
// Аймаг/сум/баг хилийн давхарга "Ажлын зураг" дээр ордоггүй (Трас зураг дээр л байна).
const BOUNDARY_IDS = PRINT_BOUNDARY_IDS.filter((id) => id !== "au1" && id !== "au2" && id !== "au3");

/* ГУС-ийн лавлах давхаргууд — СОНГОЛТООР (өгөгдмөл нь унтраалттай). Дэд
   давхаргуудыг тус тусад нь сонгоно; хэвлэхэд бүлэг тус бүр НЭГ WMS хүсэлт
   (сонгосон кодуудын CQL-ийг OR-оор нэгтгэнэ — өнгийг SLD өөрөө кодоор нь). */
const GUS_GROUPS = [
  { ...AGREED_GROUP, ids: AGREED_CODE_LAYER_IDS as readonly string[], codes: AGREED_CODE_LAYERS },
  { ...SEC_GROUP, ids: SEC_CODE_LAYER_IDS as readonly string[], codes: SEC_CODE_LAYERS },
];
/** Хэвлэх хүрээнд байгаа ГУС-ийн кодыг тоолох WFS-ийн дээд хэмжээ (proxy: 5000). */
const GUS_PRESENCE_MAX = 5000;
type StaticLayerId = Parameters<typeof layerDef>[0];

/** Нэгж талбарын API-гийн хуудасны дээд хэмжээ (backend: max 200). */
const OWNER_PAGE_SIZE = 200;
/** Өмчлөгчийн нэрийн үсгийн хэмжээ — ХУУДАСНЫ px-ээр. */
const OWNER_LABEL_FONT = 6.5;

/**
 * Хэвлэх газрын зургийн ӨРГӨН (px) — нягтаршлын коэффициентээр өснө.
 *
 * Зургийн canvas нь хуудсанд тавигдах хэмжээнээсээ ЖИЖИГ байвал сунгагдаж
 * бүдгэрнэ. Иймд хуудасны зургийн талбайн S дахин том хэмжээгээр авна.
 * Дээд хязгаар нь браузерын canvas/GeoServer-ийн хүсэлтийн бодит хязгаар
 * (хэт том WMS зураг удаан ирдэг).
 */
const MAP_W_MAX = 4700;

function droneBounds(img: DroneImage): [number, number, number, number] | null {
  const { min_x: a, min_y: b, max_x: c, max_y: d } = img;
  if (a == null || b == null || c == null || d == null) return null;
  const e = [a, b, c, d] as [number, number, number, number];
  if (!e.every(Number.isFinite)) return null;
  if (Math.abs(a) > 180 || Math.abs(c) > 180 || Math.abs(b) > 90 || Math.abs(d) > 90) return null;
  if (a >= c || b >= d) return null;
  return e;
}

export default function PrintMapDialog({
  acquisitionId,
  acquisitionName,
  onClose,
}: {
  acquisitionId: string;
  acquisitionName?: string;
  onClose: () => void;
}) {
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  // Нэгж талбарын ТӨЛӨВҮҮД — бүртгэлээс. Тайлбар, явцын задаргаа болон
  // хэвлэх давхаргууд бүгд эндээс бүрдэнэ.
  const { defs: statusLayerDefs } = useParcelStatusLayers();
  const statusRules = useParcelStatusRules();
  const [extent, setExtent] = useState<[number, number, number, number] | null>(null);

  const [paper, setPaper] = useState<PrintPaperSize>("A4");
  const [orientation, setOrientation] = useState<PrintOrientation>("landscape");
  const [title, setTitle] = useState(acquisitionName?.trim() || "Чөлөөлөлтийн байршил");
  /* ── ТОХИРГОО: ноорог vs хэрэгжсэн ──────────────────────────────────
     Гарчиг, цаас, чиглэл, давхарга, дроны сонголт БҮГД зөвхөн НООРОГ —
     өөрчлөхөд зураг шинэчлэгдэхгүй. "Зураг үүсгэх"/"Шинээр үүсгэх" дарахад
     л ноорог нь `applied` болж зураг боловсруулагдана. Өмнө нь цаас/чиглэл
     сонгомогц, гарчиг бичих бүрд зураг шууд дахин зурагддаг байв. */
  const [selectedDrones, setSelectedDrones] = useState<Set<string>>(() => new Set());
  /* ЧАГТЛААГҮЙ давхаргууд — газрын зураг дээр ч, таних тэмдэг дээр ч ГАРАХГҮЙ.
     Өгөгдмөл нь бүгд асаалттай (хоосон Set). */
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(() => new Set());
  const [gusLayers, setGusLayers] = useState<Set<string>>(() => new Set());
  // Дэд давхаргын жагсаалт нь урт (9 / 28) тул бүлгийг дэлгэж байж харуулна.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [showOwners, setShowOwners] = useState(false);
  /* Сүүлд ХЭРЭГЖСЭН тохиргоо — урьдчилан харах зураг ЯГ үүгээр бүтсэн.
     null = цонх нээгдээд зураг хараахан үүсгээгүй (нээгдэнгүүт дэмий
     WMS/тайлын хүсэлт явуулахгүй). Татах үед ч цаас/чиглэлийг ЭНДЭЭС авна —
     ноорог руу сольсон чиглэлээр PDF үүсгэвэл зураг сунаж гажина. */
  const [applied, setApplied] = useState<PrintSettings | null>(null);
  const viewInfoRef = useRef<PrintMapViewInfo | null>(null);
  // Сүүлийн зурагт (хэвлэх хүрээнд) объект нь байгаа ГУС-ийн дэд давхаргууд.
  const presentGusRef = useRef<Set<string> | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [pageCanvas, setPageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Давхцлаас болж зурагдаагүй өмчлөгчийн нэрийн тоо.
  const [skippedOwners, setSkippedOwners] = useState(0);

  const acqFilter = `acquisition_id='${acquisitionId}'`;

  /* ── Өгөгдөл ─────────────────────────────────────────────────── */
  const { data: acq, isFetched: acqFetched } = useQuery({
    queryKey: ["land", acquisitionId],
    queryFn: () => landApi.getById(acquisitionId),
  });
  const { data: categories = [], isFetched: categoriesFetched } = useQuery({
    queryKey: ["acquisition-categories"],
    queryFn: () => landApi.listCategories(),
    staleTime: Infinity,
  });
  const { data: departments = [], isFetched: departmentsFetched } = useQuery({
    queryKey: ["departments", "options"],
    queryFn: () => departmentApi.list({ page_size: 200 }).then((r) => r.data ?? []),
    staleTime: 5 * 60_000,
  });
  const { data: droneImages = [] } = useQuery({
    queryKey: ["drone-images", acquisitionId],
    queryFn: () => landApi.listDroneImages(acquisitionId),
  });

  // Хүрээ мэдэгдэж буй, GeoServer-т нийтлэгдсэн зургууд л сонгогдоно
  const usableDrones = useMemo(
    () => droneImages.filter((img) => !!img.layer_name && !!droneBounds(img)),
    [droneImages],
  );

  const [statusCounts, setStatusCounts] = useState<Record<number, number>>({});
  const [parcelsAreaM2, setParcelsAreaM2] = useState(0);
  const [countsLoaded, setCountsLoaded] = useState(false);

  useEffect(() => {
    void loadImage("/logo.png").then((img) => {
      logoRef.current = img;
    });
  }, []);

  /* ── Хүрээ ба нэгж талбарын тоо/талбай (WFS) ─────────────────── */
  useEffect(() => {
    const p = new URLSearchParams({
      service: "WFS", version: "1.1.0", request: "GetFeature",
      typeName: "land:v_acquisition_boundary", CQL_FILTER: acqFilter,
      outputFormat: "application/json", propertyName: "geometry", maxFeatures: "1",
    });
    void fetch(GS_WFS, {
      method: "POST",
      headers: gsAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: p.toString(),
    })
      .then((r) => r.json())
      .then((json) => {
        const geom = json?.features?.[0]?.geometry;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const walk = (n: unknown): void => {
          if (!Array.isArray(n)) return;
          if (typeof n[0] === "number" && typeof n[1] === "number") {
            const [x, y] = n as [number, number];
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          } else n.forEach(walk);
        };
        walk(geom?.coordinates);
        if (Number.isFinite(minX)) {
          setExtent(transformExtent([minX, minY, maxX, maxY], "EPSG:4326", "EPSG:3857") as [number, number, number, number]);
        }
      })
      .catch(() => {});

    const pp = new URLSearchParams({
      service: "WFS", version: "1.1.0", request: "GetFeature",
      typeName: "land:v_parcel_acquisition", CQL_FILTER: acqFilter,
      outputFormat: "application/json", propertyName: "parcel_id,status,acquisition_area_m2",
    });
    void fetch(`${GS_WFS}?${pp.toString()}`, { headers: gsAuthHeaders() })
      .then((r) => r.json())
      .then((json) => {
        const counts: Record<number, number> = {};
        let sum = 0;
        (json?.features ?? []).forEach((f: { properties?: { status?: number; acquisition_area_m2?: number } }) => {
          const st = f.properties?.status ?? 0;
          counts[st] = (counts[st] ?? 0) + 1;
          sum += Number(f.properties?.acquisition_area_m2 ?? 0) || 0;
        });
        setStatusCounts(counts);
        setParcelsAreaM2(sum);
      })
      .catch(() => {})
      .finally(() => setCountsLoaded(true));
  }, [acqFilter]);

  /* ── Зураг авч, хуудас бүрдүүлэх ─────────────────────────────── */
  // Таних тэмдэг — ХЭРЭГЖҮҮЛЖ буй тохиргооны давхаргуудаар (ноорогоор биш).
  const buildLegend = (hidden: Set<string>, gus: Set<string>): PrintLegendItem[] => [
    // Төлөв тус бүрийн тооны ӨМНӨ — төсөл арга хэмжээний нийт нэгж талбар.
    ...(acq ? [{ color: "", label: `Нийт нэгж талбар (${acq.parcel_count})`, total: true }] : []),
    // Төлөвүүд БҮРТГЭЛЭЭС ирнэ (хатуу жагсаалт биш) бөгөөд хэрэглэгчийн
    // ХАССАН давхарга таних тэмдэгт гарахгүй.
    ...statusLayerDefs
      .filter((d) => {
        const sid = parcelStatusIdFromLayer(d.id) ?? -1;
        return (statusCounts[sid] ?? 0) > 0 && !hidden.has(d.id);
      })
      .map((d) => {
        const sid = parcelStatusIdFromLayer(d.id) ?? -1;
        return { color: d.color, label: `${d.label} (${statusCounts[sid]})` };
      }),
    ...BOUNDARY_IDS.filter((id) => !hidden.has(id)).map((id) => {
      const def = layerDef(id);
      return { color: def.color, label: def.label, line: true };
    }),
    // Сонгосон ГУС-ийн дэд давхаргууд — бүлэг бүр ГАРЧИГтай (тод мөр), дэд
    // давхарга нь зураг дээрхтэй ижил торлолтоор (SLD: торлосон / цэгэн).
    ...GUS_GROUPS.flatMap((g) => {
      const picked = g.ids.filter((id) => gus.has(id));
      if (!picked.length) return [];
      return [
        { color: "", label: g.label, total: true },
        ...picked.map((id) => {
          const def = layerDef(id as StaticLayerId);
          return { color: def.color, label: def.label, hatch: def.hatch };
        }),
      ];
    }),
  ];

  /* Чагтлах давхаргын жагсаалт — таних тэмдэгтэй ЯГ ижил өнгө/шошго/дараалалтай.
     Нэг ч нэгж талбаргүй төлөв харагдахгүй (легенд дээр ч гардаггүй); тоолол
     хараахан ирээгүй бол бүгдийг нь үзүүлнэ. */
  const layerChips = useMemo(() => {
    const counted = Object.keys(statusCounts).length > 0;
    return [
      // Төлөвүүд БҮРТГЭЛЭЭС — шинэ төлөв нэмэхэд чагтлах жагсаалтад өөрөө орно.
      ...statusLayerDefs
        .filter((d) => !counted || (statusCounts[parcelStatusIdFromLayer(d.id) ?? -1] ?? 0) > 0)
        .map((d) => ({ id: d.id as string, color: d.color, label: d.label })),
      ...BOUNDARY_IDS.map((id) => {
        const def = layerDef(id);
        return { id: id as string, color: def.color, label: def.label };
      }),
    ];
  }, [statusCounts, statusLayerDefs]);

  const toggleGus = (ids: readonly string[], on: boolean) =>
    setGusLayers((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const toggleLayer = (id: string) =>
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // forEach — tsconfig-т `target` заагаагүй (ES5) тул Set-ийг spread/for-of хийж болохгүй.
  const sameSet = (a: Set<string>, b: Set<string>) => {
    if (a.size !== b.size) return false;
    let same = true;
    a.forEach((v) => {
      if (!b.has(v)) same = false;
    });
    return same;
  };
  // Газрын зургийг ДАХИН ТАТАХ шаардлагатай өөрчлөлт үү (гарчгаас бусад)
  const sameMapSettings = (a: PrintSettings, b: PrintSettings) =>
    a.paper === b.paper &&
    a.orientation === b.orientation &&
    sameSet(a.hiddenLayers, b.hiddenLayers) &&
    sameSet(a.drones, b.drones) &&
    sameSet(a.gusLayers, b.gusLayers) &&
    a.showOwners === b.showOwners;

  const draft: PrintSettings = {
    title,
    paper,
    orientation,
    hiddenLayers,
    drones: selectedDrones,
    gusLayers,
    showOwners,
  };
  const started = applied !== null;
  /* Ноорог нь зураг дээр хэрэгжсэнээсээ ЗӨРСӨН үү — товчийг онцолж,
     урьдчилан харагдаж буй зураг ХУУЧИН гэдгийг мэдэгдэнэ. */
  const dirty = !!applied && (applied.title !== draft.title || !sameMapSettings(applied, draft));
  // Эхний үүсгэлтийн өмнө товч нь ҮНДСЭН үйлдэл тул үргэлж тодоор харагдана.
  const highlight = dirty || !started;
  /* Тоолол/мэдээлэл ирэхээс ӨМНӨ үүсгэвэл таних тэмдэг/мэдээллийн карт
     дутуу гарна — тэгээд дараа нь автоматаар дахин зурахгүй тул товчийг хүлээлгэнэ. */
  const dataReady = !!extent && countsLoaded && acqFetched && categoriesFetched && departmentsFetched;

  const info = useMemo<PrintInfo>(() => {
    const cat = categories.find((c) => c.id === acq?.general_category_id);
    const dept = departments.find((d) => String(d.id) === String(cat?.department_id ?? ""));
    return {
      planCode: acq?.plan_code,
      planName: acq?.plan_name,
      nithDecreeNumber: acq?.nith_decree_number,
      acquisitionAreaM2: acq?.area_m2,
      parcelsAreaM2,
      orgName: "Нийслэлийн газар зохион байгуулалтын алба",
      logo: logoRef.current,
      departmentName: dept?.name,
      departmentCode: dept?.code,
      statusName: acq ? STATUS_LABELS[acq.status] : undefined,
      progressPercent: acq?.progress_percent ?? 0,
      progressBreakdown: statusLayerDefs
        .map((d) => ({
          color: d.color,
          label: d.label,
          count: statusCounts[parcelStatusIdFromLayer(d.id) ?? -1] ?? 0,
        }))
        .filter((sl) => sl.count > 0),
      specialists: (acq?.assigned_users ?? []).map((u) => u.user_name).filter(Boolean),
    };
  }, [acq, categories, departments, parcelsAreaM2, statusCounts, statusLayerDefs]);

  /* ӨМЧЛӨГЧИЙН ШОШГО — ЭЦСИЙН БУС төлөвтэй нэгж талбарууд дээр.
     Нэр нь GeoServer-ийн view-д байхгүй тул backend-ийн жагсаалтаас
     (holder_name), геометр нь WFS-ээс; parcel_id-аар холбоно. */
  const loadOwnerLabels = async (hidden: Set<string>) => {
    const names = new Map<string, string>();
    for (let page = 1; ; page++) {
      const res = await landApi.getParcels(acquisitionId, { page, page_size: OWNER_PAGE_SIZE });
      (res.data ?? []).forEach((p) => {
        if (p.holder_name?.trim()) names.set(p.parcel_id, p.holder_name.trim());
      });
      if (page >= (res.total_pages ?? 1) || !(res.data ?? []).length) break;
    }

    const q = new URLSearchParams({
      service: "WFS", version: "1.1.0", request: "GetFeature",
      typeName: "land:v_parcel_acquisition", CQL_FILTER: acqFilter,
      outputFormat: "application/json", propertyName: "parcel_id,status,geometry",
    });
    const r = await fetch(GS_WFS, {
      method: "POST",
      headers: gsAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: q.toString(),
    });
    if (!r.ok) throw new Error(`Нэгж талбарын геометр ачаалагдсангүй (${r.status})`);
    const features = new GeoJSON().readFeatures(await r.json(), {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    // Далдалсан төлөвийн нэгж талбарт ч нэр бичихгүй.
    const hiddenStatuses = new Set(
      statusLayerDefs.filter((d) => hidden.has(d.id)).map((d) => parcelStatusIdFromLayer(d.id)),
    );
    const labels: { x: number; y: number; text: string; weight: number }[] = [];
    features.forEach((f) => {
      const status = Number(f.get("status"));
      if (statusRules(status).is_final || hiddenStatuses.has(status)) return;
      const text = names.get(String(f.get("parcel_id") ?? ""));
      const geom = f.getGeometry() as Polygon | MultiPolygon | undefined;
      if (!text || !geom) return;
      // Хотгор хэлбэртэй талбарт ч ДОТОР нь байх цэг (centroid гадуур гарч болно)
      const pt =
        geom.getType() === "MultiPolygon"
          ? (geom as MultiPolygon).getInteriorPoints().getCoordinates()[0]
          : (geom as Polygon).getInteriorPoint().getCoordinates();
      // Том нэгж талбарын нэр түрүүлж байрлана (давхцвал жижгийнх нь хасагдана).
      if (pt) labels.push({ x: pt[0], y: pt[1], text, weight: geom.getArea() });
    });
    return labels;
  };

  /* ХЭВЛЭХ ХҮРЭЭНД БАЙГАА ГУС-ийн дэд давхаргууд. Сонгосон бүхнийг таних
     тэмдэгт оруулбал (9 + 28 дэд төрөл) картад багтахгүй "… бусад N" болж,
     зураг дээр нэр байхгүй тул юу болох нь мэдэгдэхгүй үлддэг. Иймд зөвхөн
     хүрээнд объект нь бодитоор байгаа төрлүүдийг үлдээнэ. Тоолж чадаагүй
     (алдаа, хязгаарт хүрсэн) бүлгийн сонголтыг бүхэлд нь хэвээр үлдээнэ. */
  const loadPresentGusLayers = async (
    view: [number, number, number, number],
    picked: Set<string>,
  ): Promise<Set<string>> => {
    const present = new Set<string>();
    await Promise.all(
      GUS_GROUPS.map(async (g) => {
        const pickedIds = g.ids.filter((id) => picked.has(id));
        if (!pickedIds.length) return;
        try {
          const q = new URLSearchParams({
            service: "WFS", version: "1.1.0", request: "GetFeature",
            typeName: `land:${geoServerName(pickedIds[0] as MapLayerId)}`,
            outputFormat: "application/json", propertyName: "code",
            bbox: `${view.join(",")},EPSG:3857`, maxFeatures: String(GUS_PRESENCE_MAX),
          });
          const r = await fetch(GS_WFS, {
            method: "POST",
            headers: gsAuthHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
            body: q.toString(),
          });
          if (!r.ok) throw new Error(String(r.status));
          const features: { properties?: { code?: unknown } }[] = (await r.json())?.features ?? [];
          if (features.length >= GUS_PRESENCE_MAX) throw new Error("limit");
          const found = new Set(features.map((f) => String(f.properties?.code ?? "")));
          const known = new Set(g.codes.filter((c) => c.code !== null).map((c) => String(c.code)));
          let hasOther = false;
          found.forEach((c) => {
            if (!known.has(c)) hasOther = true;
          });
          g.codes.forEach((c) => {
            if (!picked.has(c.id)) return;
            if (c.code === null ? hasOther : found.has(String(c.code))) present.add(c.id);
          });
        } catch {
          pickedIds.forEach((id) => present.add(id));
        }
      }),
    );
    return present;
  };

  const rebuild = async (cfg: PrintSettings) => {
    const ext = extent;
    if (!ext) return;
    setBusy(true);
    setError(null);
    setSkippedOwners(0);
    const { orientation, paper } = cfg;

    /* Зургийн хэмжээ — хуудасны зургийн талбайн ХАРЬЦААГААР (тайралт үүсэхгүй),
       нягтаршлын коэффициентээр ТОМСГОСОН (PDF дээр тод гарна). */
    const area = printMapAreaSizePx(orientation, paper);
    const mapW = Math.min(MAP_W_MAX, Math.round(area.width * printScaleFor(paper)));
    const mapH = Math.round((mapW * area.height) / area.width);

    /* Хилийг ДЭЭД хэсэгт: доод зурвасыг таних тэмдэг/мэдээллийн карт эзэлнэ. */
    const a = printMapAreaSizePx(orientation, paper);
    const cover = a.width / mapW; // өргөн/өндөр ижил харьцаатай тул нэг утга
    const band = printInfoBandPx() / cover;
    const usableH = Math.max(mapH * 0.35, mapH - band);
    const PAD = 1.06;
    const resolution = Math.max(((ext[2] - ext[0]) * PAD) / mapW, ((ext[3] - ext[1]) * PAD) / usableH);
    const cx = (ext[0] + ext[2]) / 2;
    const cy = (ext[1] + ext[3]) / 2 - (band / 2) * resolution;
    const view: [number, number, number, number] = [
      cx - (resolution * mapW) / 2,
      cy - (resolution * mapH) / 2,
      cx + (resolution * mapW) / 2,
      cy + (resolution * mapH) / 2,
    ];
    const viewInfo = { resolution, centerLat: toLonLat([cx, cy])[1] };

    /* Давхаргууд — ДООДООС дээш (zIndex-ийн дарааллаар).
       1) суурь хиймэл дагуул  2) сонгосон дроны зураг  3) WMS давхаргууд */
    const layers: PrintLayerSpec[] = [
      {
        kind: "xyz",
        urls: PRINT_SATELLITE_URLS,
        maxZoom: PRINT_SATELLITE_MAX_ZOOM,
        crossOrigin: "anonymous",
      },
    ];
    usableDrones
      .filter((img) => cfg.drones.has(img.id))
      .forEach((img) => {
        const b = droneBounds(img);
        if (!b) return;
        layers.push({
          kind: "xyz",
          urls: [droneTileUrl(acquisitionId, img.id)],
          maxZoom: GS_GWC_MAX_ZOOM,
          clipExtent: transformExtent(b, "EPSG:4326", "EPSG:3857") as [number, number, number, number],
        });
      });
    // Хилийн давхаргууд ТОГТМОЛ, төлөвийнх нь БҮРТГЭЛЭЭС. Хэрэглэгчийн
    // хассан (cfg.hiddenLayers) давхаргыг хэвлэхэд оруулахгүй.
    [
      ...BOUNDARY_IDS.map((id) => ({ id: id as string, def: layerDef(id) })),
      ...statusLayerDefs.map((d) => ({ id: d.id as string, def: d })),
    ]
      .filter(({ id }) => !cfg.hiddenLayers.has(id))
      .sort((x, y) => x.def.zIndex - y.def.zIndex)
      .forEach(({ id, def }) => {
        const isStatus = parcelStatusIdFromLayer(id) !== null;
        layers.push({
          kind: "wms",
          // Төлөвийн давхаргууд GeoServer дээр байхгүй — эх давхаргаар нь
          // дуудаж, `status=N`-ээ өөрийн cql-ээр нэмнэ.
          layer: `land:${geoServerName(id as MapLayerId)}`,
          styles: isStatus ? PARCEL_STATUS_PRINT_STYLE : PRINT_STYLES[id],
          cql: id.startsWith("au") ? undefined : combineCql(def.cql, acqFilter) || undefined,
          opacity: def.opacity ?? 0.9,
          // ЗААВАЛ: чөлөөлөлтийн хил + нэгж талбарууд. Бусад нь туслах —
          // унавал алгасаад үлдсэнийг нь хэвлэнэ.
          required: id === "v_acquisition_plan" || isStatus,
        });
      });
    // ГУС-ийн лавлах давхаргууд — нэгж талбаруудын ДЭЭР (zIndex 50/51), улс
    // даяарын өгөгдөл тул чөлөөлөлтөөр шүүхгүй. Туслах тул унавал алгасна.
    GUS_GROUPS.forEach((g) => {
      const picked = g.ids.filter((id) => cfg.gusLayers.has(id));
      if (!picked.length) return;
      const first = layerDef(picked[0] as StaticLayerId);
      layers.push({
        kind: "wms",
        layer: `land:${geoServerName(picked[0] as MapLayerId)}`,
        cql: picked.map((id) => `(${layerDef(id as StaticLayerId).cql})`).join(" OR "),
        opacity: first.opacity ?? 1,
      });
    });

    try {
      if (cfg.showOwners) {
        const labels = await loadOwnerLabels(cfg.hiddenLayers);
        // Үсгийн хэмжээ хуудасны px-ээр тогтмол → canvas-ын нягтаршлаар өсгөнө.
        if (labels.length)
          layers.push({
            kind: "label",
            labels,
            fontPx: OWNER_LABEL_FONT * (mapW / area.width),
            bottomInsetPx: band,
            onSkipped: setSkippedOwners,
          });
      }
      const [canvas, presentGus] = await Promise.all([
        renderPrintMapCanvas({ extent: view, width: mapW, height: mapH, layers }),
        loadPresentGusLayers(view, cfg.gusLayers),
      ]);
      mapCanvasRef.current = canvas;
      viewInfoRef.current = viewInfo;
      presentGusRef.current = presentGus;
      compose(canvas, cfg, viewInfo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const compose = (canvas: HTMLCanvasElement, cfg: PrintSettings, viewInfo: PrintMapViewInfo | null) => {
    const page = composePrintPage(canvas, {
      title: cfg.title,
      orientation: cfg.orientation,
      paper: cfg.paper,
      legend: buildLegend(cfg.hiddenLayers, presentGusRef.current ?? cfg.gusLayers),
      viewInfo,
      info: { ...info, logo: logoRef.current },
    });
    setPageCanvas(page);
    setDataUrl(page.toDataURL("image/png"));
  };

  /* ЗУРАГ ЗӨВХӨН ЭНД боловсруулагдана — "Зураг үүсгэх"/"Шинээр үүсгэх" товч.
     Зөвхөн гарчиг өөрчлөгдсөн бол газрын зургийг ДАХИН ТАТАХГҮЙ — хадгалсан
     canvas дээрээ хуудсыг л дахин бүрдүүлнэ (масштабын мөр ч хадгалагдана). */
  const generate = () => {
    const next: PrintSettings = {
      ...draft,
      hiddenLayers: new Set(hiddenLayers),
      drones: new Set(selectedDrones),
      gusLayers: new Set(gusLayers),
    };
    const prev = applied;
    setApplied(next);
    if (prev && mapCanvasRef.current && !error && sameMapSettings(prev, next)) {
      compose(mapCanvasRef.current, next, viewInfoRef.current);
    } else {
      void rebuild(next);
    }
  };

  const download = () => {
    if (!pageCanvas || !applied) return;
    const name = applied.title.trim().replace(/\s+/g, "_").slice(0, 80) || "gazriin_zurag";
    void downloadCanvasAsPdf(pageCanvas, applied.orientation, name, applied.paper);
  };

  const selectCls =
    "h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none focus:border-[#02c0ce] dark:border-[#37394d] dark:bg-[#1e1f27] dark:text-slate-200";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />


      <div className="relative flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f27]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-[#37394d]">
          <p className="text-[14px] font-bold text-slate-800 dark:text-white">Ажлын зураг</p>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-[#252630]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 border-b border-slate-100 px-5 py-3 dark:border-[#37394d]">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Гарчиг</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Гарчиг оруулах..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-700 outline-none focus:border-[#02c0ce] dark:border-[#37394d] dark:bg-[#1e1f27] dark:text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Цаас</label>
              <select value={paper} onChange={(e) => setPaper(e.target.value as PrintPaperSize)} className={selectCls}>
                <option value="A4">A4</option>
                <option value="A3">A3</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">Чиглэл</label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as PrintOrientation)}
                className={selectCls}
              >
                <option value="landscape">Хэвтээ</option>
                <option value="portrait">Босоо</option>
              </select>
            </div>
          </div>

          {/* ДАВХАРГА — чагтлаагүй нь зураг дээр ч, таних тэмдэг дээр ч гарахгүй.
              Гүйцэтгэлийн хувь/дугуй диаграм нь чөлөөлөлтийн БОДИТ үзүүлэлт
              тул давхарга далдлахад өөрчлөгдөхгүй. */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Давхарга
            </label>
            <div className="flex max-h-20 flex-wrap gap-2 overflow-y-auto">
              {layerChips.map((chip) => {
                const on = !hiddenLayers.has(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => toggleLayer(chip.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      on
                        ? "border-[#02c0ce] bg-[#02c0ce]/10 text-slate-700 dark:text-slate-200"
                        : "border-slate-200 text-slate-400 line-through hover:bg-slate-50 dark:border-[#37394d] dark:text-slate-500 dark:hover:bg-[#252630]"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: chip.color, opacity: on ? 1 : 0.3 }}
                    />
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ГУС-ийн лавлах давхаргууд — СОНГОЛТООР. Бүлгийн чагт нь бүх дэд
              давхаргыг асаах/унтраах; дэлгэж байж тус тусад нь сонгоно.
              Сонгосон нь зураг дээр ба таних тэмдэгт гарна. */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {GUS_GROUPS.map((g) => {
                const n = g.ids.filter((id) => gusLayers.has(id)).length;
                const open = openGroup === g.id;
                return (
                  <div
                    key={g.id}
                    className={`flex items-center rounded-lg border text-[11px] font-medium ${
                      n > 0
                        ? "border-[#02c0ce] bg-[#02c0ce]/10 text-slate-700 dark:text-slate-200"
                        : "border-slate-200 text-slate-500 dark:border-[#37394d] dark:text-slate-400"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-1.5 py-1 pl-2.5 pr-1.5">
                      <input
                        type="checkbox"
                        checked={n === g.ids.length}
                        ref={(el) => {
                          if (el) el.indeterminate = n > 0 && n < g.ids.length;
                        }}
                        onChange={(e) => toggleGus(g.ids, e.target.checked)}
                        className="h-3 w-3 accent-[#02c0ce]"
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} />
                      {g.label}
                      {n > 0 && <span className="text-[10px] text-slate-400">({n}/{g.ids.length})</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => setOpenGroup(open ? null : g.id)}
                      title="Дэд давхаргууд"
                      className="flex h-full items-center border-l border-inherit px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-[#252630]"
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                );
              })}
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showOwners}
                  onChange={(e) => setShowOwners(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#02c0ce]"
                />
                Өмчлөгч харах
              </label>
            </div>
            {GUS_GROUPS.filter((g) => g.id === openGroup).map((g) => (
              <div key={g.id} className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-slate-50 p-2 dark:bg-[#252630]">
                {g.ids.map((id) => {
                  const def = layerDef(id as StaticLayerId);
                  const on = gusLayers.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleGus([id], !on)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] transition-colors ${
                        on
                          ? "border-[#02c0ce] bg-white text-slate-700 dark:bg-[#1e1f27] dark:text-slate-200"
                          : "border-slate-200 text-slate-400 hover:bg-white dark:border-[#37394d] dark:text-slate-500 dark:hover:bg-[#1e1f27]"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: def.color, opacity: on ? 1 : 0.35 }}
                      />
                      {def.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {usableDrones.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Дроны зураг ({usableDrones.length})
              </label>
              <div className="flex max-h-20 flex-wrap gap-2 overflow-y-auto">
                {usableDrones.map((img) => {
                  const on = selectedDrones.has(img.id);
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() =>
                        setSelectedDrones((prev) => {
                          const next = new Set(prev);
                          if (next.has(img.id)) next.delete(img.id);
                          else next.add(img.id);
                          return next;
                        })
                      }
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        on
                          ? "border-[#02c0ce] bg-[#02c0ce]/10 text-[#02c0ce]"
                          : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-[#37394d] dark:text-slate-400 dark:hover:bg-[#252630]"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {img.original_name || img.file_name || img.id.slice(0, 8)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ЗУРАГ ҮҮСГЭХ — цонх нээгдэхэд зураг бэлдэхгүй, эхний болон
              дараачийн бүх үүсгэлтийг ЭНЭ товч эхлүүлнэ. Алдаа гарсан үед
              ДАХИН ОРОЛДОХ гарц ч болно (өөрчлөлтгүй үед ч идэвхтэй). */}
          <div className="flex items-center justify-end gap-2">
            {started && dirty && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                Сонголт өөрчлөгдсөн — зургийг шинэчилнэ үү
              </span>
            )}
            {!dataReady && (
              <span className="text-[11px] text-slate-400">
                {!extent ? "Чөлөөлөлтийн хил ачаалж байна..." : "Мэдээлэл ачаалж байна..."}
              </span>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={busy || !dataReady}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                highlight
                  ? "border-[#02c0ce] bg-[#02c0ce] text-white hover:bg-[#02aab6]"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[#37394d] dark:text-slate-300 dark:hover:bg-[#252630]"
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              {started ? "Шинээр үүсгэх" : "Зураг үүсгэх"}
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-4 dark:bg-[#15161c]">
          {/* Урьдчилан харах нь ХЭВЛЭГДЭХ ЯГ ТЭР зураг — өөр газрын зураг
              байхгүй тул "дэлгэц дээр өөр, хэвлэхэд өөр" гэсэн зөрүү үүсэхгүй. */}
          {dataUrl && (
            /* `max-h-full max-w-full` + өргөн/өндөр AUTO = "fit" (contain):
               хуудас өндөр, өргөн ХОЁУЛАА багтаж, харьцаа нь хадгалагдана.
               Өмнө нь `w-full` байсан тул БОСОО хуудас өргөнөөрөө тулж,
               өндрөө `max-h-full` таслахад харьцаа гажиж (сунасан) харагддаг
               байв — хэвлэгдэх PDF-тэй тохирохгүй. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dataUrl}
              alt="Ажлын зураг"
              className="max-h-full max-w-full rounded object-contain shadow"
              style={{ opacity: busy ? 0.35 : 1 }}
            />
          )}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-[12px]">Газрын зураг бэлдэж байна...</span>
            </div>
          )}
          {!started && !busy && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 text-center text-slate-400 dark:text-slate-500">
              <ImageIcon className="h-8 w-8" />
              <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
                Ажлын зураг бэлдээгүй байна
              </p>
              <p className="max-w-sm text-[11px]">
                Цаас, чиглэл, давхаргаа сонгоод <strong>&laquo;Зураг үүсгэх&raquo;</strong> дарна уу.
              </p>
            </div>
          )}
          {!busy && !error && dataUrl && applied?.showOwners && skippedOwners > 0 && (
            <div className="absolute left-4 right-4 top-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Нэгж талбар нягт тул <strong>{skippedOwners}</strong> өмчлөгчийн нэр давхцаж байсныг хэвлэсэнгүй.
              {applied.paper === "A4" ? " Илүү олон нэр гаргах бол A3 цаас сонгоно уу." : ""}
            </div>
          )}
          {!busy && error && (
            <div className="absolute inset-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-500/40 dark:bg-red-500/10">
              <p className="text-[12.5px] font-semibold text-red-600 dark:text-red-400">
                Газрын зургийн давхарга ачаалагдсангүй
              </p>
              <p className="max-w-lg break-words text-[11px] text-red-500/90 dark:text-red-300/80">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-[#37394d]">
          <button
            onClick={onClose}
            className="h-9 rounded-lg px-4 text-[12.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-[#252630]"
          >
            Хаах
          </button>
          <button
            onClick={download}
            disabled={!dataUrl || busy}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#02c0ce] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#02aab6] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Татах
          </button>
        </div>
      </div>
    </div>
  );
}
