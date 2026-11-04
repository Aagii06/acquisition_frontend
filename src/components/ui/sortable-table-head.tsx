"use client";

// Хүснэгтийн БАГАНААР эрэмбэлэх толгой.
//
// Жагсаалтууд нь СЕРВЕР ДЭЭР хуудаслагддаг тул эрэмбийг browser дээр хийж
// болохгүй — тэгвэл зөвхөн ХАРАГДАЖ БУЙ хуудас дотроо эрэмбэлэгдэж, "хамгийн
// том талбай" гэх мэт асуултад буруу хариу өгнө. Иймд энэ компонент нь
// зөвхөн ТӨЛӨВ (аль багана, ямар чиглэл) хөтөлж, эцэг хуудас түүнийгээ
// backend-ийн `sort` / `order` параметрээр дамжуулна.

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";
export type SortState = { by: string; dir: SortDir };

/** Багана дээр дарахад: өсөх → буурах → эрэмбэгүй (үндсэн байдал). */
export function nextSortState(
  current: SortState | null,
  key: string,
): SortState | null {
  if (!current || current.by !== key) return { by: key, dir: "asc" };
  if (current.dir === "asc") return { by: key, dir: "desc" };
  return null;
}

/**
 * Хүснэгтийн нэг баганын тодорхойлолт.
 * `key` байхгүй бол тухайн багана эрэмбэлэгдэхгүй (үйлдлийн багана г.м.).
 */
export type SortColumn = {
  label: string;
  /** Гарчгийн доор (шинэ мөрөнд) жижиг тайлбар — ж: «Үндсэн/Нөлөөлөлд өртсөн». */
  sublabel?: string;
  key?: string;
  className?: string;
};

const TH_BASE =
  "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap";

export function SortableHeaderRow({
  columns,
  sort,
  onSort,
  thClassName = TH_BASE,
  className,
}: {
  columns: SortColumn[];
  sort: SortState | null;
  onSort: (key: string) => void;
  /** Багананы үндсэн класс (хуудас бүр өөрийн padding-тай тул дарж бичиж болно). */
  thClassName?: string;
  className?: string;
}) {
  return (
    <tr className={className}>
      {columns.map((col, i) => {
        const cls = `${thClassName}${col.className ? ` ${col.className}` : ""}`;
        if (!col.key) {
          return (
            <th key={i} className={cls}>
              {col.label}
              {col.sublabel && <Sublabel text={col.sublabel} />}
            </th>
          );
        }
        const active = sort?.by === col.key;
        return (
          <th key={i} className={cls} aria-sort={ariaSort(sort, col.key)}>
            <SortButton
              label={col.label}
              sortKey={col.key}
              sort={sort}
              onSort={onSort}
              active={active}
            />
            {col.sublabel && <Sublabel text={col.sublabel} />}
          </th>
        );
      })}
    </tr>
  );
}

/** `<th aria-sort>`-ийн утга. */
export function ariaSort(
  sort: SortState | null,
  key: string,
): "ascending" | "descending" | "none" {
  if (sort?.by !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

/**
 * Баганын нэрний хажууд жижиг эрэмбэлэх товч. `SortableHeaderRow`-д
 * багтахгүй (rowSpan/colSpan, нөхцөлт багана г.м.) толгойтой хүснэгтэд
 * `<th>` дотор шууд хэрэглэнэ.
 */
export function SortButton({
  label,
  sortKey,
  sort,
  onSort,
  active = sort?.by === sortKey,
  className,
}: {
  label: ReactNode;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  active?: boolean;
  className?: string;
}) {
  const Icon = !active
    ? ChevronsUpDown
    : sort!.dir === "asc"
      ? ChevronUp
      : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={
        active
          ? sort!.dir === "asc"
            ? "Буурахаар эрэмбэлэх"
            : "Эрэмбийг цуцлах"
          : "Өсөхөөр эрэмбэлэх"
      }
      className={`group inline-flex max-w-full items-center gap-1 text-left uppercase tracking-wider transition-colors hover:text-slate-600 dark:hover:text-slate-300 ${
        active ? "text-[#02c0ce] dark:text-[#02c0ce]" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <span className="whitespace-normal break-words">{label}</span>
      <Icon
        className={`h-3 w-3 shrink-0 transition-opacity ${
          active ? "opacity-100" : "opacity-30 group-hover:opacity-70"
        }`}
      />
    </button>
  );
}

/**
 * Хуудаслалтгүй (бүх мөрийг нэг дор татдаг) жагсаалтыг browser дээр
 * эрэмбэлэх. Сервер хуудаслалттай жагсаалтад ХЭРЭГЛЭХГҮЙ — тэнд `sort`/`order`
 * параметрийг backend рүү дамжуулна.
 */
export function useClientSort<T>(
  rows: T[],
  getValue: (row: T, key: string) => string | number | boolean | null | undefined,
) {
  const [sort, setSort] = useState<SortState | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getValue(a, sort.by);
      const bv = getValue(b, sort.by);
      // Хоосон утга аль ч чиглэлд сүүлд (backend-ийн NULLS LAST-тай ижил).
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), "mn", { numeric: true }) * factor;
    });
    // getValue нь ихэвчлэн inline функц тул deps-д оруулбал рендер бүрт дахин эрэмбэлнэ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  return {
    sorted,
    sort,
    onSort: (key: string) => setSort((cur) => nextSortState(cur, key)),
  };
}

function Sublabel({ text }: { text: string }) {
  return (
    <span className="block text-[10px] font-medium normal-case tracking-normal text-slate-400/80 dark:text-slate-500">
      {text}
    </span>
  );
}
