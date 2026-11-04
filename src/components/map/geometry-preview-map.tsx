"use client";
import { useEffect, useRef, useState } from "react";
import OLMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Cluster from "ol/source/Cluster";
import Feature, { type FeatureLike } from "ol/Feature";
import XYZ from "ol/source/XYZ";
import WKT from "ol/format/WKT";
import { fromLonLat, toLonLat } from "ol/proj";
import { createEmpty, extend as extendExtent, getCenter, getHeight, getWidth, isEmpty as isEmptyExtent } from "ol/extent";
import type { Geometry } from "ol/geom";
import Point from "ol/geom/Point";
import { Fill, Icon, Stroke, Style, Text } from "ol/style";
// @ts-ignore: CSS side-effect import for OpenLayers styles
import "ol/ol.css";
import { MapPinOff } from "lucide-react";
import { createBasemapLayer, watchBasemap } from "./basemap";
import { logger } from "@/lib/logger";

// Үүнээс жижиг (пикселээр) геометрийг цэгээр харуулна.
const MARKER_MIN_PX = 8;
// Дэлгэц дээр ийм зайд (px) орших цэгүүд нэг тойрогт нэгтгэгдэж тоо нь бичигдэнэ.
const CLUSTER_DISTANCE_PX = 36;
// Газрын тооны маркер — тод дугуй (дотроо цагаан тоо) + хагас тунгалаг 2
// цагираг (halo). ӨНГӨ (төлөв) бүр өөрийн дугуйтай; нэг байршлын дугуйнууд
// НИЙЛСЭН нэг icon болно: бие биедээ OVERLAP-аар давхарлаж (2 — хажуу хажуудаа,
// 3+ — тойрог дээр), гадна цагирагууд нийлж нэг бүлэг харагдана. Дугуй бүрийг
// цагаан нимгэн хүрээ тусгаарлана. Тоо ихсэх тусам дугуй томорно. SVG-г 2 дахин
// нарийвчлалаар зурж 0.5 масштабтай харуулна (retina-д бүдгэрэхгүй).
const HALO = { inner: 5, outer: 11 }; // цагирагийн нэмэлт радиус (px)
// Хоёр дугуйн төв хоорондын зай = (r1 + r2) × OVERLAP — 1-ээс бага бол давхарлана.
const OVERLAP = 0.8;
const clusterText = (n: number) => (n > 999 ? "999+" : String(n));
const coreRadius = (n: number) => (n < 10 ? 13 : n < 100 ? 16 : n < 1000 ? 19 : 21);

/** Дугуйнуудын төв (бүлгийн төв = 0,0). */
function clusterLayout(radii: number[]): [number, number][] {
  if (radii.length === 1) return [[0, 0]];
  if (radii.length === 2) {
    const d = (radii[0] + radii[1]) * OVERLAP;
    return [
      [-d / 2, 0],
      [d / 2, 0],
    ];
  }
  // 3+: тойрог дээр (эхнийх нь дээр), хөрш хоёрын зай ≈ дундаж (r1 + r2) × OVERLAP.
  const n = radii.length;
  const avg = radii.reduce((a, r) => a + r, 0) / n;
  const side = 2 * avg * OVERLAP;
  const R = side / (2 * Math.sin(Math.PI / n));
  return radii.map((_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [R * Math.cos(a), R * Math.sin(a)];
  });
}

function clusterIcon(parts: { color: string; n: number }[]): Icon {
  const radii = parts.map((p) => coreRadius(p.n));
  const pos = clusterLayout(radii);
  const ext = radii.map((r) => r + HALO.outer);
  const minX = Math.min(...pos.map(([x], i) => x - ext[i]));
  const maxX = Math.max(...pos.map(([x], i) => x + ext[i]));
  const minY = Math.min(...pos.map(([, y], i) => y - ext[i]));
  const maxY = Math.max(...pos.map(([, y], i) => y + ext[i]));
  const w = maxX - minX;
  const h = maxY - minY;
  // Эхлээд бүх цагираг, дараа нь тод дугуй + тоо. Цагирагийн тунгалагшлыг
  // БҮЛЭГТ (<g opacity>) өгнө — давхцсан хэсэг бараан толбо болохгүй, нийлж
  // нэг жигд дэвсгэр болно.
  const ring = (extra: number) =>
    parts.map((p, i) => `<circle cx="${pos[i][0]}" cy="${pos[i][1]}" r="${radii[i] + extra}" fill="${p.color}"/>`).join("");
  const halos = `<g opacity="0.16">${ring(HALO.outer)}</g><g opacity="0.24">${ring(HALO.inner)}</g>`;
  const multi = parts.length > 1;
  const cores = parts
    .map((p, i) => {
      const r = radii[i];
      const [cx, cy] = pos[i];
      const fs = r < 16 ? 12 : r < 19 ? 13 : 12;
      return (
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.color}" fill-opacity="0.96"` +
        (multi ? ` stroke="#ffffff" stroke-width="1.5"` : "") +
        `/>` +
        `<text x="${cx}" y="${cy + fs * 0.36}" text-anchor="middle" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif" ` +
        `font-size="${fs}" font-weight="600" fill="#ffffff">${clusterText(p.n)}</text>`
      );
    })
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="${minX} ${minY} ${w} ${h}">` +
    `${halos}${cores}</svg>`;
  return new Icon({
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    // Бүлгийн төв — байршил.
    anchor: [-minX / w, -minY / h],
    scale: 0.5,
  });
}

/** Геометр тухайн томруулалтад цэгээр харагдах эсэх (`size` — хүрээний урт тал, газрын зургийн нэгжээр). */
// Дэлгэцийн 1px = 0.28 мм (OGC стандарт) — масштабын хуваарийг (1:N) бодоход.
const METERS_PER_PX = 0.00028;

/** Газрын зургийн масштабын хуваарь (1:N) — Web Mercator resolution × cos(өргөрөг). */
export const scaleDenominator = (resolution: number, lat: number) =>
  (resolution * Math.cos((lat * Math.PI) / 180)) / METERS_PER_PX;

/**
 * Геометр тухайн томруулалтад ICON-оор харагдах эсэх.
 *   • iconAboveScale заасан бол — масштаб 1:iconAboveScale-аас ХОЛ (хуваарь их) үед бүгд icon,
 *     ойр үед бүгд хил (нэг дор шилжинэ);
 *   • эс бөгөөс — геометр дэлгэц дээр MARKER_MIN_PX-ээс жижиг үед.
 */
const isTiny = (f: FeatureLike, resolution: number, iconAboveScale?: number) =>
  iconAboveScale
    ? scaleDenominator(resolution, f.get("lat") as number) > iconAboveScale
    : (f.get("size") as number) / resolution < MARKER_MIN_PX;

export type PreviewGeometry = {
  /** WGS84 (EPSG:4326) WKT. Хоосон/танигдахгүй бол чимээгүй алгасагдана. */
  wkt?: string | null;
  color: string;
  label?: string;
  /** Тасархай зураас — ихэвчлэн ХУУЧИН/харьцуулах хилд. */
  dashed?: boolean;
  /** Дүүргэлттэй эсэх (доор орших хилийг бүрхэхээс сэргийлж анхдагчаар үгүй). */
  filled?: boolean;
  /** Зураг ДЭЭР геометрийн голд бичих текст (ж: нэгж талбарын дугаар). */
  text?: string;
  /** Зураасны зузаан (анхдагч 3.5). */
  width?: number;
};

/**
 * WKT геометрийг ЖИЖИГ газрын зураг дээр зурж харуулах компонент.
 *
 * Хаана хэрэглэгддэг: төлөвлөгөө хайж олоход түүний хилийг ХАРУУЛАХ
 * (чөлөөлөлт үүсгэх ба хил солих хоёулаа). Давхарга сонгох, хэвлэх, 3D зэрэг
 * хэрэггүй тул `map-view`/`acquisition-map`-ыг дахин хэрэглэсэнгүй — эдгээр нь
 * GeoServer-ийн WMS давхаргууд ба чөлөөлөлтийн ID шаарддаг.
 */
export default function GeometryPreviewMap({
  geometries,
  height = 200,
  emptyText = "Хил байхгүй тул зураг дээр харуулах боломжгүй",
  onSelect,
  clusterOrder,
  iconAboveScale,
}: {
  geometries: PreviewGeometry[];
  height?: number;
  emptyText?: string;
  /** Геометр дээр дарахад — `geometries` доторх индекс. */
  onSelect?: (index: number) => void;
  /** Тоон маркер доторх өнгөт чипүүдийн дараалал (ж: төлөвийн өнгө 1→3). */
  clusterOrder?: string[];
  /**
   * Масштабын хуваарь (ж: 25000 = 1:25,000). Заасан бол үүнээс ХОЛ үед бүх газар
   * тоотой icon-оор, ойр үед бүгд хилээр харагдана; буланд одоогийн масштаб,
   * zoom бичигдэнэ. Заагаагүй бол газрын дэлгэц дээрх хэмжээгээр шийднэ.
   */
  iconAboveScale?: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const olMap = useRef<OLMap | null>(null);
  const vectorLayer = useRef<VectorLayer<VectorSource> | null>(null);
  const pointSource = useRef<VectorSource<Feature<Point>> | null>(null);
  const clusterRef = useRef<VectorLayer<Cluster> | null>(null);
  const wktFormat = useRef(new WKT());
  const [drawn, setDrawn] = useState<number | null>(null);
  // Зураг нэг л удаа үүсдэг тул хамгийн сүүлийн callback-ийг ref-ээр уншина.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const clusterOrderRef = useRef(clusterOrder);
  clusterOrderRef.current = clusterOrder;
  const iconScaleRef = useRef(iconAboveScale);
  iconScaleRef.current = iconAboveScale;
  const [viewInfo, setViewInfo] = useState<{ scale: number; zoom: number } | null>(null);

  // Зөвхөн WKT-ийн утга (болон хэлбэр) өөрчлөгдөхөд дахин зурна — эцэг
  // компонент дахин render хийх бүрд массив шинээр үүсдэг тул түлхүүрээр
  // харьцуулна.
  const key = geometries
    .map(
      (g) =>
        `${g.color}|${g.dashed ? "d" : ""}|${g.filled ? "f" : ""}|${g.width ?? ""}|${g.text ?? ""}|${g.wkt ?? ""}`,
    )
    .join("~");

  /* ── Зураг үүсгэх (нэг удаа) ── */
  useEffect(() => {
    if (!mapRef.current || olMap.current) return;

    const layer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 10,
      style: (feature, resolution) => {
        const color = (feature.get("color") as string) ?? "#ff7a00";
        const text = feature.get("text") as string | undefined;
        // Icon-оор харагдах үед (isTiny — масштаб эсвэл дэлгэц дээрх хэмжээгээр)
        // энд зурахгүй, доорх тойргийн давхарга (газрын тоотой) харуулна.
        // Томруулахад жинхэнэ хил гарч ирнэ.
        if (isTiny(feature, resolution, iconScaleRef.current)) return undefined;
        return new Style({
          stroke: new Stroke({
            color,
            width: (feature.get("width") as number | undefined) ?? 3.5,
            lineDash: feature.get("dashed") ? [8, 6] : undefined,
          }),
          fill: feature.get("filled") ? new Fill({ color: `${color}33` }) : undefined,
          text: text
            ? new Text({
                text,
                font: "600 11px Inter, system-ui, sans-serif",
                fill: new Fill({ color }),
                stroke: new Stroke({ color: "#ffffff", width: 3 }),
                // Жижиг талбар дээр ч дугаар харагдах ёстой.
                overflow: true,
              })
            : undefined,
        });
      },
    });
    vectorLayer.current = layer;

    // Жижиг геометрүүдийн төв цэг → ойрхоныг нь нэгтгэж (cluster) газрын тоог
    // бичнэ. Тойрог бүр зөвхөн тухайн томруулалтад ЦЭГЭЭР харагдах газрыг тоолно.
    const points = new VectorSource<Feature<Point>>();
    pointSource.current = points;
    const styleCache = new Map<string, Style>();
    const clusterLayer = new VectorLayer({
      source: new Cluster({ distance: CLUSTER_DISTANCE_PX, source: points }),
      zIndex: 11,
      style: (cluster, resolution) => {
        const members = (cluster.get("features") as Feature[]).filter((m) => isTiny(m, resolution, iconScaleRef.current));
        if (members.length === 0) return undefined;
        // Өнгө (төлөв) бүрээр тоолно; дараалал — clusterOrder, эс бөгөөс анх гарсан дараалал.
        const counts = new Map<string, number>();
        members.forEach((m) => {
          const c = m.get("color") as string;
          counts.set(c, (counts.get(c) ?? 0) + 1);
        });
        const order = clusterOrderRef.current ?? [];
        const parts = Array.from(counts.entries())
          .map(([color, n]) => ({ color, n }))
          .sort((a, b) => {
            const ia = order.indexOf(a.color);
            const ib = order.indexOf(b.color);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          });
        const cacheKey = parts.map((p) => `${p.color}:${p.n}`).join("|");
        let st = styleCache.get(cacheKey);
        if (!st) {
          st = new Style({ image: clusterIcon(parts) });
          styleCache.set(cacheKey, st);
        }
        return st;
      },
    });
    clusterRef.current = clusterLayer;

    olMap.current = new OLMap({
      target: mapRef.current,
      layers: [
        // СУУРЬ зураг — тохиргооноос (тохируулаагүй бол үндсэн суурь зураг).
        createBasemapLayer(),
        layer,
        clusterLayer,
      ],
      view: new View({
        center: fromLonLat([104.9, 47.9]),
        zoom: 5,
        minZoom: 4,
        // maxZoom заахгүй — зумлалтын дээд хязгаар байхгүй.
      }),
      controls: [],
    });

    const map = olMap.current;
    const stopBasemapWatch = watchBasemap(map);
    // Одоогийн масштаб ба zoom — iconAboveScale-тай үед буланд харуулна.
    map.on("moveend", () => {
      const view = map.getView();
      const res = view.getResolution();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (res == null || center == null || zoom == null) return;
      const lat = toLonLat(center)[1];
      setViewInfo({ scale: scaleDenominator(res, lat), zoom });
    });
    map.on("singleclick", (evt) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { hitTolerance: 4 });
      if (!hit) return;
      const res = map.getView().getResolution() ?? 1;
      const members = (hit.get("features") as Feature[] | undefined)?.filter((m) => isTiny(m, res, iconScaleRef.current));
      // Олон газартай тойрог — тэдгээрийн хүрээ рүү томруулна.
      if (members && members.length > 1) {
        const ext = createEmpty();
        members.forEach((m) => extendExtent(ext, m.get("ext") as number[]));
        map.getView().fit(ext, { padding: [48, 48, 48, 48], duration: 300 });
        return;
      }
      const idx = (members?.[0] ?? hit).get("idx");
      if (typeof idx === "number") onSelectRef.current?.(idx);
    });
    map.on("pointermove", (evt) => {
      if (evt.dragging) return;
      // Дарж болох: onSelect-тэй үед бүх геометр, эс бөгөөс зөвхөн тойрог (томруулна).
      const over = map.hasFeatureAtPixel(evt.pixel, {
        hitTolerance: 4,
        layerFilter: (l) => !!onSelectRef.current || l === clusterLayer,
      });
      map.getTargetElement().style.cursor = over ? "pointer" : "";
    });

    return () => {
      stopBasemapWatch();
      map.setTarget(undefined);
      olMap.current = null;
      vectorLayer.current = null;
      pointSource.current = null;
      clusterRef.current = null;
    };
  }, []);

  /* ── Геометр солигдоход дахин зурж, хүрээ рүү нүүх ── */
  useEffect(() => {
    const map = olMap.current;
    const layer = vectorLayer.current;
    if (!map || !layer) return;

    const source = layer.getSource();
    if (!source) return;
    source.clear();
    const points = pointSource.current;
    points?.clear();

    const extent = createEmpty();
    let count = 0;
    for (let idx = 0; idx < geometries.length; idx++) {
      const geom = geometries[idx];
      const wkt = geom.wkt?.trim();
      if (!wkt) continue;
      try {
        const feature = wktFormat.current.readFeature(wkt, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        feature.set("color", geom.color);
        feature.set("dashed", !!geom.dashed);
        feature.set("filled", !!geom.filled);
        feature.set("text", geom.text);
        feature.set("width", geom.width);
        feature.set("idx", idx);
        const featureExtent = (feature.getGeometry() as Geometry | undefined)?.getExtent();
        const size = featureExtent ? Math.max(getWidth(featureExtent), getHeight(featureExtent)) : 0;
        feature.set("size", size);
        const lat = featureExtent ? toLonLat(getCenter(featureExtent))[1] : 0;
        feature.set("lat", lat);
        source.addFeature(feature);
        if (featureExtent) {
          extendExtent(extent, featureExtent);
          // Жижиг үед харагдах цэг (тойргийн давхаргад).
          points?.addFeature(
            new Feature({ geometry: new Point(getCenter(featureExtent)), color: geom.color, idx, size, lat, ext: featureExtent }),
          );
        }
        count++;
      } catch (err) {
        // Танигдахгүй WKT нь зургийг бүхэлд нь унагах ёсгүй.
        logger.warn("geometry preview: WKT уншиж чадсангүй", { error: String(err) });
      }
    }
    setDrawn(count);

    if (count > 0 && !isEmptyExtent(extent)) {
      map.getView().fit(extent, { padding: [24, 24, 24, 24], duration: 300 });
    }
    // Контейнерийн хэмжээ (модал дотор нээгдэх, эсвэл хэсэг өргөжих) хожуу
    // тодорхойлогддог тул OL-д дахин мэдэгдэнэ.
    requestAnimationFrame(() => map.updateSize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Олон геометр нэг тайлбартай байж болно (ж: хилээс гарах бүх нэгж талбар) —
  // тайлбарт нэг л удаа гарна.
  const legend = geometries.filter(
    (g, i, all) =>
      g.label &&
      g.wkt?.trim() &&
      all.findIndex((o) => o.label === g.label && o.color === g.color && o.wkt?.trim()) === i,
  );

  return (
    <div className="space-y-1.5">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-slate-200 dark:border-[#37394d] bg-slate-50 dark:bg-[#252630]"
        style={{ height }}
      >
        <div ref={mapRef} className="h-full w-full" />
        {iconAboveScale && viewInfo && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-600 shadow-sm dark:bg-[#1e1f27]/90 dark:text-slate-300">
            1:{Math.round(viewInfo.scale).toLocaleString("mn-MN")} · zoom {viewInfo.zoom.toFixed(1)}
            <span className="ml-1.5 text-slate-400">
              {viewInfo.scale > iconAboveScale ? "· icon" : "· хил"}
            </span>
          </div>
        )}
        {drawn === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-50/95 dark:bg-[#252630]/95 px-3 text-center">
            <MapPinOff className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">{emptyText}</p>
          </div>
        )}
      </div>
      {legend.length > 0 && drawn !== 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {legend.map((g) => (
            <span
              key={`${g.color}-${g.label}`}
              className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"
            >
              <span
                className="h-0.5 w-4 rounded"
                style={
                  g.dashed
                    ? { borderTop: `2px dashed ${g.color}`, height: 0 }
                    : { background: g.color, height: 2 }
                }
              />
              {g.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
