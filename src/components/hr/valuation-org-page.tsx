"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { valuationOrgApi } from "@/lib/api";
import { canAddHr, canEditHr, canRemoveHr, canViewHr } from "@/lib/role-utils";
import { getApiError } from "@/lib/utils";
import type { Employee, ValuationOrg, ValuationOrgEmployeeInput, ValuationOrgPayload } from "@/types";
import { ChevronRight, Landmark, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, type PendingConfirm } from "@/components/ui/confirm-dialog";
import { SortButton, ariaSort, useClientSort } from "@/components/ui/sortable-table-head";

const inputCls =
  "h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";
const primaryBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#02c0ce] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#02a3af] disabled:opacity-60";
const ghostBtn =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.04]";
const iconBtn =
  "flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition-colors hover:bg-[#02c0ce]/10 hover:text-[#02c0ce] dark:bg-[#252630] dark:text-slate-400";

// Үнэлгээний байгууллагын БҮХ кэш нэг иерархид: ["valuation-orgs", <төрөл>, ...].
//
// Өмнө нь гурван key тус тусдаа байсан — ["valuation-org-list", search],
// ["valuation-org", id], ["valuation-orgs"] — бөгөөд дунд хоёр нь ЗӨВХӨН нэг
// үсгээр ялгаатай байв. Улмаар хадгалсны дараа дэлгэрэнгүйн кэшийг цэвэрлэх
// мөр дутуу байсныг хэн ч анзаараагүй (ажилтан нэмээд дахин нээхэд хуучин
// жагсаалт харагддаг байсан).
//
// Одоо React Query-ийн УГТВАРААР таарах шинжийг ашиглана: qk.all нь доорх
// гурвуулангийг НЭГ дуудлагаар хүчингүй болгоно.
//
//   ["valuation-orgs", "list",    <хайлт>]  → энэ хуудасны хүснэгт
//   ["valuation-orgs", "detail",  <id>]     → дэлгэрэнгүй (GET /:id)
//   ["valuation-orgs", "options"]           → чөлөөлөлт / нэгж талбарын
//                                             сонгогчид (өөр хуудсууд;
//                                             тэнд literal-аар бичигдсэн)
const qk = {
  all: ["valuation-orgs"] as const,
  list: (search: string) => ["valuation-orgs", "list", search] as const,
  detail: (id: string | null) => ["valuation-orgs", "detail", id] as const,
};

const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? (
    <span className="text-slate-300 dark:text-slate-600">—</span>
  ) : (
    v
  );

type OrgForm = {
  name: string;
  short_name: string;
  register_no: string;
  license_no: string;
  license_issued_at: string;
  license_expires_at: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  is_active: boolean;
};

// Маягтын ажилтан. `id` утгатай бол одоо байгаа ажилтныг засна.
// `hasLogin` нь ЗӨВХӨН харуулах зориулалттай (backend-ээс ирнэ).
//
// `uid` — React-ийн key. Шинэ ажилтанд `id` байхгүй тул индексээр key хийвэл
// дундаас мөр хасахад доорх мөрүүдийн key нь шилжиж, React input-уудыг БУРУУ
// мөрд холбодог (бичсэн утга нүүдэг). uid нь мөрийн ард бариастай явна.
// `originalUsername` — backend-ээс ирсэн нэвтрэх нэр. Нууц үг ЗААВАЛ шаардах
// эсэхийг үүнтэй тулгаж шийднэ: нэр өөрчлөгдөөгүй бол нууц үг хэрэггүй.
type EmployeeForm = ValuationOrgEmployeeInput & {
  hasLogin?: boolean;
  uid: string;
  originalUsername?: string;
};

let employeeUidSeq = 0;
const nextUid = () => `emp-${++employeeUidSeq}`;

const EMPTY_ORG: OrgForm = {
  name: "",
  short_name: "",
  register_no: "",
  license_no: "",
  license_issued_at: "",
  license_expires_at: "",
  phone: "",
  email: "",
  address: "",
  note: "",
  is_active: true,
};

function emptyEmployee(): EmployeeForm {
  return {
    uid: nextUid(),
    last_name: "",
    first_name: "",
    register_no: "",
    phone: "",
    email: "",
    position_name: "",
    username: "",
    password: "",
  };
}

// Backend-ийн Employee-г маягтын мөр болгоно. Овог/нэр/регистр нь person дотор
// ирдэг. Нэвтрэх нэрийг ХАРУУЛНА — эс бөгөөс тухайн ажилтан ямар эрхээр
// нэвтэрдгийг мэдэхгүй, зассан ч хоосон нэр илгээгдэх эрсдэлтэй.
function employeeToForm(e: Employee): EmployeeForm {
  return {
    uid: nextUid(),
    id: e.id,
    hasLogin: !!e.user_id,
    last_name: e.person?.last_name ?? "",
    first_name: e.person?.first_name ?? "",
    register_no: e.person?.register_no ?? "",
    phone: e.work_phone ?? e.person?.phone ?? "",
    email: e.work_email ?? e.person?.email ?? "",
    position_name: e.position_name ?? "",
    username: e.username ?? "",
    originalUsername: e.username ?? "",
    password: "",
  };
}

function toDateInput(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function ValuationOrgPage() {
  const queryClient = useQueryClient();
  const canView = canViewHr();
  const perms = { add: canAddHr(), update: canEditHr(), del: canRemoveHr() };

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgForm>(EMPTY_ORG);
  const [employees, setEmployees] = useState<EmployeeForm[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: qk.list(debounced),
    queryFn: () => valuationOrgApi.list({ search: debounced || undefined, page: 1, page_size: 100 }),
    enabled: canView,
  });

  // Засварлахад ажилтнуудыг дэлгэрэнгүй хариултаас (GET /:id) л авна —
  // жагсаалтын хариултад ажилтнууд ирдэггүй.
  const detail = useQuery({
    queryKey: qk.detail(editingId),
    queryFn: () => valuationOrgApi.getById(editingId as string),
    enabled: !!editingId && formOpen,
  });

  // hydratedFor — маягт тухайн байгууллагын өгөгдлөөр аль хэдийн бөглөгдсөн
  // эсэх. Өмнө нь эффект `detail.data`-ийн ОБЪЕКТЫН ХАЯГААР хамаардаг байсан:
  //   1) байгууллага нээх → шинэ объект → маягт бөглөгдөнө;
  //   2) хаах → closeForm маягтыг хоослоно;
  //   3) ДАХИН нээх → React Query кэшээс ЯГ ТЭР объект ирнэ → хаяг өөрчлөгдөөгүй
  //      тул эффект ажиллахгүй → маягт ХООСОН хэвээр (нэр ч, ажилтан ч байхгүй,
  //      formValid=false тул Хадгалах ч бөглөрдөг).
  // Одоо нээлт тутам ЯГ НЭГ УДАА бөглөнө — refetch (цонх focus г.м.) хэрэглэгчийн
  // бичиж байгаа өгөгдлийг дарж бичихгүй.
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!formOpen) {
      hydratedFor.current = null;
      return;
    }
    if (!editingId || !detail.data) return;
    if (hydratedFor.current === editingId) return;

    const d = detail.data;
    hydratedFor.current = editingId;
    setOrg({
      name: d.name ?? "",
      short_name: d.short_name ?? "",
      register_no: d.register_no ?? "",
      license_no: d.license_no ?? "",
      license_issued_at: toDateInput(d.license_issued_at),
      license_expires_at: toDateInput(d.license_expires_at),
      phone: d.phone ?? "",
      email: d.email ?? "",
      address: d.address ?? "",
      note: d.note ?? "",
      is_active: d.is_active ?? true,
    });
    setEmployees((d.employees ?? []).map(employeeToForm));
  }, [formOpen, editingId, detail.data]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setOrg(EMPTY_ORG);
    setEmployees([]);
    hydratedFor.current = null;
  };

  const openCreate = () => {
    setEditingId(null);
    setOrg(EMPTY_ORG);
    // Байгууллага дор хаяж нэг ажилтантай байх нь ердийн тохиолдол тул
    // маягтыг нэг хоосон мөртэй нээнэ.
    setEmployees([emptyEmployee()]);
    hydratedFor.current = null;
    setFormOpen(true);
  };

  // openDetail — "Дэлгэрэнгүй": байгууллагын үндсэн мэдээлэл БА ажилтныг нэг
  // цонхонд засна/нэмнэ. Маягтыг хоослож нээгээд detail (GET /:id) ирэхэд
  // дээрх эффект бөглөнө — өмнөх байгууллагын өгөгдөл харагдахгүй.
  const openDetail = (row: ValuationOrg) => {
    setEditingId(row.id);
    setOrg(EMPTY_ORG);
    setEmployees([]);
    hydratedFor.current = null;
    setFormOpen(true);
  };

  // Маягт ажилтнуудаараа БӨГЛӨГДСӨН эсэх. Засварлах горимд дэлгэрэнгүй (GET /:id)
  // ирэхээс өмнө `employees` нь хоосон массив байна — тэр үед хадгалбал
  // backend-д "бүх ажилтныг хас" гэж ойлгогдож, тухайн байгууллагын бүх
  // ажилтан идэвхгүй болж, сесс нь тасардаг байв. Бөглөгдөөгүй үед талбарыг
  // ОГТ ИЛГЭЭХГҮЙ (undefined) — ингэснээр backend ажилтанд хүрэхгүй.
  const employeesHydrated = !editingId || hydratedFor.current === editingId;

  const payload = (): ValuationOrgPayload => ({
    name: org.name.trim(),
    short_name: org.short_name.trim(),
    register_no: org.register_no.trim(),
    license_no: org.license_no.trim(),
    license_issued_at: org.license_issued_at || null,
    license_expires_at: org.license_expires_at || null,
    phone: org.phone.trim(),
    email: org.email.trim(),
    address: org.address.trim(),
    note: org.note.trim(),
    is_active: org.is_active,
    employees: employeesHydrated
      ? employees.map((e) => ({
          id: e.id,
          last_name: e.last_name.trim(),
          first_name: e.first_name.trim(),
          register_no: e.register_no.trim(),
          phone: e.phone.trim(),
          email: e.email.trim(),
          position_name: e.position_name.trim(),
          username: e.username?.trim() || undefined,
          password: e.password || undefined,
        }))
      : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId ? valuationOrgApi.update(editingId, payload()) : valuationOrgApi.create(payload()),
    onSuccess: () => {
      toast.success(editingId ? "Хадгалагдлаа" : "Бүртгэгдлээ");
      // Хүснэгт, дэлгэрэнгүй, бусад хуудасны сонгогчид — бүгд угтвараар.
      queryClient.invalidateQueries({ queryKey: qk.all });
      closeForm();
    },
    onError: (err) => toast.error(getApiError(err, "Хадгалах үед алдаа гарлаа")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => valuationOrgApi.delete(id),
    onSuccess: () => {
      toast.success("Устгагдлаа");
      queryClient.invalidateQueries({ queryKey: qk.all });
    },
    onError: (err) =>
      toast.error(getApiError(err, "Устгах боломжгүй — чөлөөлөлтөд ашиглагдсан байж болзошгүй")),
  });

  // Ажилтны нэр, регистр заавал. Нэвтрэх нэрийг ШИНЭЭР өгөх/СОЛИХ бол нууц үг
  // ч заавал — backend нь sd_user шинээр үүсгэхэд нууц үг шаарддаг. Ирсэн
  // нэрийг хөндөөгүй бол нууц үг хэрэггүй (одоо байгаа эрх хэвээр).
  const employeesValid = useMemo(
    () =>
      employees.every((e) => {
        if (!e.first_name.trim() || !e.register_no.trim()) return false;
        const username = e.username?.trim() ?? "";
        if (username && username !== (e.originalUsername ?? "") && !e.password) return false;
        return true;
      }),
    [employees],
  );
  const formValid = org.name.trim().length > 0 && employeesValid;

  const updateEmployee = (index: number, patch: Partial<EmployeeForm>) =>
    setEmployees((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  // Жагсаалт нэг дор (page_size 100) ирдэг тул browser дээр эрэмбэлнэ.
  const { sorted: rows, sort, onSort } = useClientSort(list.data?.data ?? [], (row, key) => {
    if (key === "employee_count") return row.employee_count;
    if (key === "is_active") return row.is_active ? 1 : 0;
    if (key === "license_expires_at") return row.license_expires_at ?? "";
    return row[key as "name" | "register_no" | "license_no"];
  });

  if (!canView) {
    return (
      <div className="p-6 text-[13px] text-slate-500 dark:text-slate-400">
        Энэ хуудсыг үзэх эрх байхгүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#02c0ce]/10 text-[#02a3af] dark:text-[#02c0ce]">
            <Landmark className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">
              Үнэлгээний байгууллага
            </h1>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Байгууллага ба түүний ажилтнуудын бүртгэл
            </p>
          </div>
        </div>
        {perms.add && (
          <button type="button" onClick={openCreate} className={primaryBtn}>
            <Plus className="h-4 w-4" />
            Шинэ байгууллага
          </button>
        )}
      </div>

      <div className="ap-card p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Нэр, ТТД, тусгай зөвшөөрөл"
            className={`${inputCls} w-full pl-8`}
          />
        </div>
      </div>

      <div className="ap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-[#37394d] dark:bg-[#1a1d20]">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" aria-sort={ariaSort(sort, "name")}><SortButton label="Нэр" sortKey="name" sort={sort} onSort={onSort} /></th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" aria-sort={ariaSort(sort, "register_no")}><SortButton label="ТТД" sortKey="register_no" sort={sort} onSort={onSort} /></th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" aria-sort={ariaSort(sort, "license_no")}><SortButton label="Тусгай зөвшөөрөл" sortKey="license_no" sort={sort} onSort={onSort} /></th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" aria-sort={ariaSort(sort, "license_expires_at")}><SortButton label="Хүчинтэй хүртэл" sortKey="license_expires_at" sort={sort} onSort={onSort} /></th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" aria-sort={ariaSort(sort, "employee_count")}><SortButton label="Ажилтан" sortKey="employee_count" sort={sort} onSort={onSort} /></th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500" aria-sort={ariaSort(sort, "is_active")}><SortButton label="Төлөв" sortKey="is_active" sort={sort} onSort={onSort} /></th>
                {(perms.update || perms.del) && <th className="w-24 px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Үйлдэл</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
              {list.isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500">
                    Ачаалж байна…
                  </td>
                </tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500">
                    Бүртгэл алга
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  // Мөр дээр дарахад ч дэлгэрэнгүй нээгдэнэ (Үйлдэл багана нь
                  // stopPropagation хийдэг тул устгах товч давхар ажиллахгүй).
                  onClick={perms.update ? () => openDetail(row) : undefined}
                  className={`transition-colors ${
                    perms.update ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-[#252630]" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-100">{row.name}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-slate-500 dark:text-slate-400">{dash(row.register_no)}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-slate-500 dark:text-slate-400">{dash(row.license_no)}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-slate-500 dark:text-slate-400">{dash(toDateInput(row.license_expires_at))}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">{row.employee_count}</td>
                  <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        row.is_active
                          ? "bg-[#02c0ce]/10 text-[#02a3af] dark:text-[#02c0ce]"
                          : "bg-slate-100 text-slate-500 dark:bg-[#252630] dark:text-slate-400"
                      }`}
                    >
                      {row.is_active ? "Идэвхтэй" : "Идэвхгүй"}
                    </span>
                  </td>
                  {(perms.update || perms.del) && (
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {perms.update && (
                          <button
                            type="button"
                            onClick={() => openDetail(row)}
                            className={ghostBtn}
                            title="Үндсэн мэдээлэл ба ажилтныг засах"
                          >
                            Дэлгэрэнгүй
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {perms.del && (
                          <button
                            type="button"
                            className={iconBtn}
                            title="Устгах"
                            onClick={() =>
                              setPendingConfirm({
                                title: "Байгууллагыг устгах уу?",
                                description: `«${row.name}» устгагдана. Ажилтнуудын холбоос ч тасарна.`,
                                confirmLabel: "Устгах",
                                onConfirm: () => deleteMutation.mutate(row.id),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-400 dark:border-[#37394d] dark:text-slate-500">
            Нийт {rows.length} бүртгэл
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl dark:bg-[#191a21]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">
                  {editingId ? org.name || "Байгууллагын дэлгэрэнгүй" : "Шинэ үнэлгээний байгууллага"}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Үндсэн мэдээлэл ба ажилтныг энд засаж, нэмнэ
                </p>
              </div>
              <button type="button" onClick={closeForm} className={iconBtn}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {editingId && detail.isLoading ? (
              <div className="py-8 text-center text-[13px] text-slate-400">Ачаалж байна…</div>
            ) : (
              <div className="space-y-5">
                <section className="space-y-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                    Байгууллагын мэдээлэл
                  </h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      value={org.name}
                      onChange={(e) => setOrg((o) => ({ ...o, name: e.target.value }))}
                      placeholder="Байгууллагын нэр *"
                      className={`${inputCls} md:col-span-2`}
                    />
                    <input
                      value={org.short_name}
                      onChange={(e) => setOrg((o) => ({ ...o, short_name: e.target.value }))}
                      placeholder="Товч нэр"
                      className={inputCls}
                    />
                    <input
                      value={org.register_no}
                      onChange={(e) => setOrg((o) => ({ ...o, register_no: e.target.value }))}
                      placeholder="ТТД / регистр"
                      className={inputCls}
                    />
                    <input
                      value={org.license_no}
                      onChange={(e) => setOrg((o) => ({ ...o, license_no: e.target.value }))}
                      placeholder="Тусгай зөвшөөрлийн дугаар"
                      className={inputCls}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Олгосон
                        <input
                          type="date"
                          value={org.license_issued_at}
                          onChange={(e) => setOrg((o) => ({ ...o, license_issued_at: e.target.value }))}
                          className={inputCls}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Дуусах
                        <input
                          type="date"
                          value={org.license_expires_at}
                          onChange={(e) => setOrg((o) => ({ ...o, license_expires_at: e.target.value }))}
                          className={inputCls}
                        />
                      </label>
                    </div>
                    <input
                      value={org.phone}
                      onChange={(e) => setOrg((o) => ({ ...o, phone: e.target.value }))}
                      placeholder="Утас"
                      className={inputCls}
                    />
                    <input
                      value={org.email}
                      onChange={(e) => setOrg((o) => ({ ...o, email: e.target.value }))}
                      placeholder="Имэйл"
                      className={inputCls}
                    />
                    <input
                      value={org.address}
                      onChange={(e) => setOrg((o) => ({ ...o, address: e.target.value }))}
                      placeholder="Хаяг"
                      className={`${inputCls} md:col-span-2`}
                    />
                    <input
                      value={org.note}
                      onChange={(e) => setOrg((o) => ({ ...o, note: e.target.value }))}
                      placeholder="Тэмдэглэл"
                      className={`${inputCls} md:col-span-2`}
                    />
                    <label className="flex w-fit items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={org.is_active}
                        onChange={(e) => setOrg((o) => ({ ...o, is_active: e.target.checked }))}
                      />
                      Идэвхтэй эсэх
                    </label>
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                      Ажилтнууд
                    </h3>
                    <button
                      type="button"
                      className={ghostBtn}
                      onClick={() => setEmployees((rows) => [...rows, emptyEmployee()])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ажилтан нэмэх
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Хэрэглэгчийн нэр оруулсан ажилтан системд өөрийн эрхээр нэвтэрч,
                    байгууллагад оноогдсон ажлыг хийнэ. Жагсаалтаас хассан ажилтан
                    идэвхгүй болно.
                  </p>

                  {employees.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-[12px] text-slate-400 dark:border-white/[0.08]">
                      Ажилтан бүртгээгүй байна
                    </div>
                  )}

                  <div className="space-y-3">
                    {employees.map((emp, index) => (
                      <div
                        key={emp.uid}
                        className="rounded-lg border border-slate-200 p-3 dark:border-white/[0.08]"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                            {emp.id ? "Бүртгэлтэй ажилтан" : "Шинэ ажилтан"}
                            {emp.hasLogin && (
                              <span className="rounded-md bg-[#02c0ce]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#02a3af] dark:text-[#02c0ce]">
                                Нэвтрэх эрхтэй
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className={iconBtn}
                            title="Хасах"
                            onClick={() => setEmployees((rows) => rows.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <input
                            value={emp.last_name}
                            onChange={(e) => updateEmployee(index, { last_name: e.target.value })}
                            placeholder="Овог"
                            className={inputCls}
                          />
                          <input
                            value={emp.first_name}
                            onChange={(e) => updateEmployee(index, { first_name: e.target.value })}
                            placeholder="Нэр *"
                            className={inputCls}
                          />
                          <input
                            value={emp.register_no}
                            onChange={(e) => updateEmployee(index, { register_no: e.target.value })}
                            placeholder="Регистр *"
                            className={inputCls}
                          />
                          <input
                            value={emp.position_name}
                            onChange={(e) => updateEmployee(index, { position_name: e.target.value })}
                            placeholder="Албан тушаал"
                            className={inputCls}
                          />
                          <input
                            value={emp.phone}
                            onChange={(e) => updateEmployee(index, { phone: e.target.value })}
                            placeholder="Утас"
                            className={inputCls}
                          />
                          <input
                            value={emp.email}
                            onChange={(e) => updateEmployee(index, { email: e.target.value })}
                            placeholder="Имэйл"
                            className={inputCls}
                          />
                          <input
                            value={emp.username ?? ""}
                            onChange={(e) => updateEmployee(index, { username: e.target.value })}
                            placeholder="Нэвтрэх нэр (заавал бус)"
                            className={inputCls}
                          />
                          <input
                            type="password"
                            value={emp.password ?? ""}
                            onChange={(e) => updateEmployee(index, { password: e.target.value })}
                            placeholder={
                              (emp.username?.trim() ?? "") &&
                              (emp.username?.trim() ?? "") !== (emp.originalUsername ?? "")
                                ? "Нууц үг *"
                                : "Шинэ нууц үг (солих бол)"
                            }
                            className={inputCls}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-[#37394d]">
                  <button type="button" onClick={closeForm} className={ghostBtn}>
                    Болих
                  </button>
                  <button
                    type="button"
                    disabled={!formValid || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                    className={primaryBtn}
                  >
                    {saveMutation.isPending ? "Хадгалж байна…" : "Хадгалах"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
