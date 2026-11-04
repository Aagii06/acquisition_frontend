"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  departmentApi,
  employeeApi,
  organizationApi,
  personApi,
  positionApi,
  type DepartmentPayload,
  type EmployeePayload,
  type OrganizationPayload,
  type PersonPayload,
  type PositionPayload,
} from "@/lib/api";
import { canAddHr, canEditHr, canRemoveHr, canViewHr } from "@/lib/role-utils";
import { getApiError } from "@/lib/utils";
import type { Department, Employee, Organization, Person, Position } from "@/types";
import { BadgeCheck, Building2, IdCard, Network, Pencil, Plus, Search, Trash2, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, type PendingConfirm } from "@/components/ui/confirm-dialog";
import { SortButton, ariaSort, useClientSort } from "@/components/ui/sortable-table-head";

type Mode = "organization" | "department" | "position" | "person" | "employee";
type Row = Organization | Department | Position | Person | Employee;
type FormState = Record<string, string | boolean | undefined>;

const inputCls = "h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";
const primaryBtn = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#02c0ce] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#02a3af] disabled:opacity-60";
const iconBtn = "flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition-colors hover:bg-[#02c0ce]/10 hover:text-[#02c0ce] dark:bg-[#252630] dark:text-slate-400";

const meta = {
  organization: { title: "Байгууллага", desc: "Байгууллагын лавлах", icon: Building2 },
  department: { title: "Алба, хэлтэс", desc: "Байгууллагын бүтэц, нэгж", icon: Network },
  position: { title: "Албан тушаал", desc: "Албан тушаалын лавлах", icon: BadgeCheck },
  person: { title: "Иргэн, хуулийн этгээд", desc: "Person бүртгэл", icon: IdCard },
  employee: { title: "Ажилтан", desc: "Person-тэй холбогдсон ажилтнууд", icon: UserCog },
} satisfies Record<Mode, { title: string; desc: string; icon: React.ElementType }>;

function emptyForm(mode: Mode): FormState {
  if (mode === "person") return { person_type: "citizen", register_no: "", last_name: "", first_name: "", legal_name: "", phone: "", email: "" };
  if (mode === "employee") return { person_id: "", person_label: "", new_person: false, person_type: "citizen", register_no: "", last_name: "", first_name: "", legal_name: "", organization_id: "", department_id: "", position_id: "", work_email: "", work_phone: "" };
  if (mode === "department") return { organization_id: "", name: "", code: "" };
  if (mode === "position") return { name: "", code: "" };
  return { name: "" };
}

function rowTitle(row: Row, mode: Mode) {
  if (mode === "person") {
    const p = row as Person;
    return p.person_type === "legal" ? p.legal_name || p.register_no : `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim();
  }
  if (mode === "employee") return (row as Employee).person_name || (row as Employee).person?.legal_name || (row as Employee).id;
  return (row as Organization | Department | Position).name;
}

// ── Жагсаалтын багануудын тодорхойлолт ──────────────────────────────────
// Лавлах бүр өөр өөр талбартай тул баганыг mode-оор тусад нь тодорхойлно.
// `mono` нь регистр/код/дугаар шиг тэмдэгтийн урттай өгөгдөлд.
type Column = {
  key: string;
  label: string;
  /** Мөр бүрээс баганын утгыг гаргана. null/"" → "—" гэж харагдана. */
  value: (row: Row) => React.ReactNode;
  mono?: boolean;
  /** Зөвхөн өргөн дэлгэцэд (md+) харагдана — жагсаалт хэт битүүрэхээс сэргийлнэ. */
  hideSm?: boolean;
};

const dash = (v: string | number | null | undefined): React.ReactNode =>
  v === null || v === undefined || v === "" ? <span className="text-slate-300 dark:text-slate-600">—</span> : v;

function personTypeBadge(type: Person["person_type"]) {
  const legal = type === "legal";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
        legal
          ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
          : "bg-[#02c0ce]/10 text-[#02a3af] dark:text-[#02c0ce]"
      }`}
    >
      {legal ? "Хуулийн этгээд" : "Иргэн"}
    </span>
  );
}

const columns: Record<Mode, Column[]> = {
  // sd_organization-д ЗӨВХӨН (id, name) багана байдаг. Регистр, тусгай
  // зөвшөөрөл зэрэг нэмэлт мэдээлэл нь ЗӨВХӨН үнэлгээний байгууллагад
  // хамаарах бөгөөд /valuation_org дэлгэц дээр бүртгэгдэнэ.
  organization: [
    { key: "name", label: "Нэр", value: (r) => (r as Organization).name },
  ],
  department: [
    { key: "name", label: "Нэр", value: (r) => (r as Department).name },
    { key: "code", label: "Код", value: (r) => dash((r as Department).code), mono: true },
    { key: "organization_name", label: "Байгууллага", value: (r) => dash((r as Department).organization_name) },
  ],
  position: [
    { key: "name", label: "Нэр", value: (r) => dash((r as Position).name) },
    { key: "code", label: "Код", value: (r) => dash((r as Position).code), mono: true },
  ],
  person: [
    { key: "name", label: "Нэр", value: (r) => dash(rowTitle(r, "person")) },
    { key: "person_type", label: "Төрөл", value: (r) => personTypeBadge((r as Person).person_type) },
    { key: "register_no", label: "Регистр / ТТД", value: (r) => dash((r as Person).register_no), mono: true },
    { key: "phone", label: "Утас", value: (r) => dash((r as Person).phone), mono: true, hideSm: true },
    { key: "email", label: "Имэйл", value: (r) => dash((r as Person).email), hideSm: true },
  ],
  employee: [
    { key: "person_name", label: "Ажилтан", value: (r) => dash(rowTitle(r, "employee")) },
    { key: "position_name", label: "Албан тушаал", value: (r) => dash((r as Employee).position_name) },
    { key: "department_name", label: "Алба, хэлтэс", value: (r) => dash((r as Employee).department_name) },
    { key: "organization_name", label: "Байгууллага", value: (r) => dash((r as Employee).organization_name), hideSm: true },
    { key: "work_email", label: "Ажлын имэйл", value: (r) => dash((r as Employee).work_email), hideSm: true },
  ],
};

export function HRRegistryPage({ mode }: { mode: Mode }) {
  const [ready, setReady] = useState(false);
  const [perms, setPerms] = useState({ view: false, create: false, update: false, del: false });
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(mode));
  const [personSearch, setPersonSearch] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const queryClient = useQueryClient();
  const m = meta[mode];
  const Icon = m.icon;

  useEffect(() => {
    setPerms({ view: canViewHr(), create: canAddHr(), update: canEditHr(), del: canRemoveHr() });
    setReady(true);
  }, []);

  const listQuery = useQuery({
    queryKey: ["hr", mode, search, orgFilter],
    queryFn: async () => {
      const params = { search: search.trim() || undefined, page_size: 100 };
      if (mode === "organization") return organizationApi.list(params);
      if (mode === "department") return departmentApi.list({ ...params, organization_id: orgFilter || undefined });
      if (mode === "position") return positionApi.list(params);
      if (mode === "person") return personApi.list(params);
      return employeeApi.list(params);
    },
    enabled: ready && perms.view,
  });

  const organizations = useQuery({ queryKey: ["hr", "organizations", "select"], queryFn: () => organizationApi.list({ page_size: 100 }), enabled: mode === "department" || mode === "employee" });
  const departments = useQuery({ queryKey: ["hr", "departments", "select", form.organization_id], queryFn: () => departmentApi.list({ organization_id: String(form.organization_id || ""), page_size: 100 }), enabled: mode === "employee" && !!form.organization_id });
  const positions = useQuery({ queryKey: ["hr", "positions", "select"], queryFn: () => positionApi.list({ page_size: 100 }), enabled: mode === "employee" });
  const people = useQuery({ queryKey: ["hr", "persons", "select", personSearch], queryFn: () => personApi.list({ search: personSearch.trim() || undefined, page_size: 50 }), enabled: mode === "employee" && formOpen && !form.new_person });

  const cols = columns[mode];
  // Жагсаалт нэг дор (page_size 100) ирдэг тул browser дээр эрэмбэлнэ.
  // Нэрийн багана нь rowTitle-аар (хүн/ажилтны нэр нийлмэл) харьцуулагдана.
  const { sorted: rows, sort, onSort } = useClientSort<Row>(
    listQuery.data?.data ?? [],
    (row, key) =>
      key === cols[0].key
        ? rowTitle(row, mode)
        : ((row as unknown as Record<string, string | number | null | undefined>)[key]),
  );
  // Үйлдлийн багана нь засах/устгах эрхгүй хэрэглэгчид хоосон харагдахгүй.
  const showActions = perms.update || perms.del;
  const colSpan = cols.length + (showActions ? 1 : 0);
  const closeForm = () => { setFormOpen(false); setEdit(null); setPersonSearch(""); setForm(emptyForm(mode)); };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["hr", mode] });

  const payload = (): OrganizationPayload | DepartmentPayload | PositionPayload | PersonPayload | EmployeePayload => {
    if (mode === "organization") return { name: String(form.name || "").trim() };
    if (mode === "department") return { organization_id: String(form.organization_id || ""), name: String(form.name || "").trim(), code: String(form.code || "") || undefined };
    if (mode === "position") return { name: String(form.name || "").trim(), code: String(form.code || "") || undefined };
    if (mode === "person") return { person_type: form.person_type === "legal" ? "legal" : "citizen", register_no: String(form.register_no || "").trim(), last_name: String(form.last_name || "") || undefined, first_name: String(form.first_name || "") || undefined, legal_name: String(form.legal_name || "") || undefined, phone: String(form.phone || "") || undefined, email: String(form.email || "") || undefined };
    const p: EmployeePayload = { organization_id: String(form.organization_id || ""), department_id: String(form.department_id || "") || undefined, position_id: String(form.position_id || ""), work_email: String(form.work_email || "") || undefined, work_phone: String(form.work_phone || "") || undefined };
    if (form.new_person) {
      p.person = { person_type: form.person_type === "legal" ? "legal" : "citizen", register_no: String(form.register_no || "").trim(), last_name: String(form.last_name || "") || undefined, first_name: String(form.first_name || "") || undefined, legal_name: String(form.legal_name || "") || undefined };
    } else {
      p.person_id = String(form.person_id || "");
    }
    return p;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = payload();
      if (edit) {
        if (mode === "organization") return organizationApi.update((edit as Organization).id, body as OrganizationPayload);
        if (mode === "department") return departmentApi.update((edit as Department).id, body as DepartmentPayload);
        if (mode === "position") return positionApi.update((edit as Position).id, body as PositionPayload);
        if (mode === "person") return personApi.update((edit as Person).id, body as PersonPayload);
        return employeeApi.update((edit as Employee).id, body as EmployeePayload);
      }
      if (mode === "organization") return organizationApi.create(body as OrganizationPayload);
      if (mode === "department") return departmentApi.create(body as DepartmentPayload);
      if (mode === "position") return positionApi.create(body as PositionPayload);
      if (mode === "person") return personApi.create(body as PersonPayload);
      return employeeApi.create(body as EmployeePayload);
    },
    onSuccess: () => { toast.success(edit ? "Хадгалагдлаа" : "Үүсгэлээ"); invalidate(); closeForm(); },
    onError: (err) => toast.error(getApiError(err, "Үйлдэл амжилтгүй боллоо")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (mode === "organization") return organizationApi.delete(id);
      if (mode === "department") return departmentApi.delete(id);
      if (mode === "position") return positionApi.delete(id);
      if (mode === "person") return personApi.delete(id);
      return employeeApi.delete(id);
    },
    onSuccess: () => { toast.success("Устгагдлаа"); invalidate(); },
    onError: (err) => toast.error(getApiError(err, "Устгах боломжгүй")),
  });

  const openEdit = (row: Row) => {
    setEdit(row);
    setFormOpen(true);
    if (mode === "organization") {
      const r = row as Organization; setForm({ name: r.name });
    } else if (mode === "department") {
      const r = row as Department; setForm({ organization_id: r.organization_id, name: r.name, code: r.code ?? "" });
    } else if (mode === "position") {
      const r = row as Position; setForm({ name: r.name, code: r.code ?? "" });
    } else if (mode === "person") {
      const r = row as Person; setForm({ person_type: r.person_type, register_no: r.register_no, last_name: r.last_name ?? "", first_name: r.first_name ?? "", legal_name: r.legal_name ?? "", phone: r.phone ?? "", email: r.email ?? "" });
    } else {
      const r = row as Employee; setForm({ person_id: r.person_id, person_label: r.person_name ?? "", new_person: false, organization_id: r.organization_id, department_id: r.department_id ?? "", position_id: r.position_id, work_email: r.work_email ?? "", work_phone: r.work_phone ?? "" });
    }
  };

  const formValid = useMemo(() => {
    if (mode === "organization" || mode === "position") return !!String(form.name || "").trim();
    if (mode === "department") return !!form.organization_id && !!String(form.name || "").trim();
    if (mode === "person") return !!form.register_no && (form.person_type === "legal" ? !!form.legal_name : !!form.last_name && !!form.first_name);
    return !!form.organization_id && !!form.position_id && (form.new_person ? !!form.register_no && (form.person_type === "legal" ? !!form.legal_name : !!form.last_name && !!form.first_name) : !!form.person_id);
  }, [form, mode]);

  if (!ready) return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-[#252630]" />;
  if (!perms.view) {
    return <div className="ap-card p-8 text-center text-[13px] font-medium text-slate-600 dark:text-slate-300">Хандах эрхгүй</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{m.title}</h1>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{m.desc}</p>
          </div>
          {perms.create && <button onClick={() => { setFormOpen((v) => !v); setEdit(null); setForm(emptyForm(mode)); }} className={primaryBtn}>{formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{formOpen ? "Болих" : "Нэмэх"}</button>}
        </div>

        <div className="ap-card flex flex-wrap items-center gap-2 p-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Хайх" className={`${inputCls} w-full pl-8`} />
          </div>
          {mode === "department" && (
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className={`${inputCls} w-full max-w-xs`}>
              <option value="">Бүх байгууллага</option>
              {(organizations.data?.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        {formOpen && (perms.create || (edit && perms.update)) && (
          <div className="ap-card p-5">
            <p className="mb-4 text-[13px] font-semibold text-slate-700 dark:text-white">{edit ? "Засварлах" : "Шинэ бүртгэл"}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {mode === "department" || mode === "employee" ? (
                <select value={String(form.organization_id || "")} onChange={(e) => setForm((f) => ({ ...f, organization_id: e.target.value, department_id: "" }))} className={inputCls}>
                  <option value="">Байгууллага *</option>
                  {(organizations.data?.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : null}

              {mode === "employee" && (
                <>
                  <select value={String(form.department_id || "")} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} className={inputCls}>
                    <option value="">Алба, хэлтэс</option>
                    {(departments.data?.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={String(form.position_id || "")} onChange={(e) => setForm((f) => ({ ...f, position_id: e.target.value }))} className={inputCls}>
                    <option value="">Албан тушаал *</option>
                    {(positions.data?.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input value={String(form.work_email || "")} onChange={(e) => setForm((f) => ({ ...f, work_email: e.target.value }))} placeholder="Ажлын имэйл" className={inputCls} />
                  <input value={String(form.work_phone || "")} onChange={(e) => setForm((f) => ({ ...f, work_phone: e.target.value }))} placeholder="Ажлын утас" className={inputCls} />
                  <label className="col-span-full flex w-fit items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={!!form.new_person} onChange={(e) => setForm((f) => ({ ...f, new_person: e.target.checked, person_id: "", person_label: "" }))} />
                    Шинэ иргэн бүртгэх
                  </label>
                  {!form.new_person && (
                    <div className="col-span-full grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input value={personSearch} onChange={(e) => setPersonSearch(e.target.value)} placeholder="Иргэн хайх" className={inputCls} />
                      <select value={String(form.person_id || "")} onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value }))} className={inputCls}>
                        <option value="">Иргэн сонгох *</option>
                        {(people.data?.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.person_type === "legal" ? p.legal_name : `${p.last_name ?? ""} ${p.first_name ?? ""}`} · {p.register_no}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {(mode === "organization" || mode === "department" || mode === "position") && (
                <>
                  <input value={String(form.name || "")} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Нэр *" className={inputCls} />
                  {mode !== "organization" && <input value={String(form.code || "")} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Код" className={inputCls} />}
                </>
              )}

              {(mode === "person" || (mode === "employee" && form.new_person)) && (
                <>
                  <select value={String(form.person_type || "citizen")} onChange={(e) => setForm((f) => ({ ...f, person_type: e.target.value }))} className={inputCls}>
                    <option value="citizen">Иргэн</option>
                    <option value="legal">Хуулийн этгээд</option>
                  </select>
                  <input value={String(form.register_no || "")} onChange={(e) => setForm((f) => ({ ...f, register_no: e.target.value }))} placeholder="Регистр / ТТД *" className={inputCls} />
                  {form.person_type === "legal" ? (
                    <input value={String(form.legal_name || "")} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} placeholder="Хуулийн этгээдийн нэр *" className={inputCls} />
                  ) : (
                    <>
                      <input value={String(form.last_name || "")} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="Овог *" className={inputCls} />
                      <input value={String(form.first_name || "")} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="Нэр *" className={inputCls} />
                    </>
                  )}
                </>
              )}

              <div className="col-span-full flex gap-2 pt-1">
                <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formValid} className={primaryBtn}>{edit ? "Хадгалах" : "Үүсгэх"}</button>
                <button onClick={closeForm} className="h-9 rounded-lg border border-slate-200 px-4 text-[13px] font-medium text-slate-600 dark:border-[#37394d] dark:text-slate-300">Болих</button>
              </div>
            </div>
          </div>
        )}

        <div className="ap-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-[#37394d] dark:bg-[#1a1d20]">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      aria-sort={ariaSort(sort, c.key)}
                      className={`px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 ${c.hideSm ? "hidden md:table-cell" : ""}`}
                    >
                      <SortButton label={c.label} sortKey={c.key} sort={sort} onSort={onSort} />
                    </th>
                  ))}
                  {showActions && <th className="w-24 px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Үйлдэл</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
                {listQuery.isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {[...Array(colSpan)].map((_, j) => (
                        <td key={j} className="px-5 py-4"><div className="h-4 rounded bg-slate-100 dark:bg-[#252630]" /></td>
                      ))}
                    </tr>
                  ))
                ) : listQuery.isError ? (
                  <tr>
                    <td colSpan={colSpan} className="px-5 py-12 text-center text-[13px] text-[#f1556c]">
                      Алдаа гарлаа: {getApiError(listQuery.error, "Сервертэй холбогдож чадсангүй")}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500">
                      <Icon className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      Бүртгэл олдсонгүй
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-[#252630]">
                      {cols.map((c, i) => (
                        <td
                          key={c.key}
                          className={`px-5 py-3.5 ${c.hideSm ? "hidden md:table-cell" : ""} ${
                            i === 0 ? "font-medium text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
                          } ${c.mono ? "font-mono text-[12px]" : ""}`}
                        >
                          {c.value(row)}
                        </td>
                      ))}
                      {showActions && (
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            {perms.update && <button onClick={() => openEdit(row)} title="Засварлах" className={iconBtn}><Pencil className="h-3.5 w-3.5" /></button>}
                            {perms.del && <button onClick={() => setPendingConfirm({ title: `"${rowTitle(row, mode)}" устгах уу?`, confirmLabel: "Устгах", confirmColor: "#f1556c", onConfirm: () => deleteMutation.mutate(row.id) })} title="Устгах" className="flex h-7 w-7 items-center justify-center rounded-md bg-red-50 text-red-400 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-400 dark:border-[#37394d] dark:text-slate-500">
              Нийт {rows.length} бүртгэл
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        confirmColor={pendingConfirm?.confirmColor}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onClose={() => setPendingConfirm(null)}
      />
    </>
  );
}
