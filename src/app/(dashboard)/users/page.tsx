"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, rolesApi } from "@/lib/api";
import { getApiError } from "@/lib/utils";
import {
  canAddUser,
  canEditUser,
  canEditUserRoles,
  canGrantRole,
  canRemoveUser,
  canToggleUserActive,
  canViewRoles,
  canViewUsers,
  getCurrentUserId,
} from "@/lib/role-utils";
import {
  UserPlus,
  Trash2,
  X,
  Users,
  Pencil,
  KeyRound,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Lock,
} from "lucide-react";
import type { Role, User } from "@/types";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ConfirmDialog, type PendingConfirm } from "@/components/ui/confirm-dialog";
import { EmployeeSelect } from "@/components/ui/employee-select";
import { searchOnEnter } from "@/components/ui/search-on-enter";
import { RefreshButton } from "@/components/ui/refresh-button";
import { SearchButton } from "@/components/ui/search-button";
import {
  SortableHeaderRow,
  nextSortState,
  type SortColumn,
  type SortState,
} from "@/components/ui/sortable-table-head";

const PAGE_SIZE = 20;

// Хайлтын шүүлтүүр — нэгж талбарын хуудастай ижил draft/apply флоу.
const EMPTY_FILTER = {
  search: "",
  role: "",
  is_active: "",
};
type UserFilter = typeof EMPTY_FILTER;

// Нууц үгийн дүрэм — backend-ийн `min=8` validate-тай нэг мөр байх ёстой.
// Backend 8-аас багыг татгалздаг тул frontend дээр илүү зөөлөн байвал
// хэрэглэгчид тайлбаргүй 400 харагдана.
const PASSWORD_MIN = 8;
const passwordField = z
  .string()
  .min(PASSWORD_MIN, `Нууц үг хамгийн багадаа ${PASSWORD_MIN} тэмдэгт`)
  .regex(/[a-z]/, "Нэг жижиг латин үсэг байх шаардлагатай")
  .regex(/[A-Z]/, "Нэг том латин үсэг байх шаардлагатай")
  .regex(/[0-9]/, "Нэг тоо байх шаардлагатай");

const createSchema = z
  .object({
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    username: z
      .string()
      .trim()
      .min(3, "Хэрэглэгчийн нэр хамгийн багадаа 3 тэмдэгт")
      .max(50, "Хэрэглэгчийн нэр 50 тэмдэгтээс их байж болохгүй")
      .regex(/^[a-zA-Z0-9_]+$/, "Зөвхөн англи үсэг, тоо, доогуур зураас (_)"),
    position: z.string().trim().max(120, "Албан тушаал хэт урт").optional(),
    email: z.string().trim().email("Имэйл буруу"),
    password: passwordField,
    confirm_password: z.string().min(1, "Нууц үгийг давтана уу"),
    is_active: z.boolean().default(true),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Нууц үг таарахгүй байна",
    path: ["confirm_password"],
  });
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({
  first_name: z.string().trim().min(1, "Нэр оруулна уу"),
  last_name: z.string().trim().min(1, "Овог оруулна уу"),
  username: z
    .string()
    .trim()
    .min(3, "Хэрэглэгчийн нэр хамгийн багадаа 3 тэмдэгт")
    .max(50, "Хэрэглэгчийн нэр 50 тэмдэгтээс их байж болохгүй")
    .regex(/^[a-zA-Z0-9_]+$/, "Зөвхөн англи үсэг, тоо, доогуур зураас (_)"),
  position: z.string().trim().max(120, "Албан тушаал хэт урт").optional(),
  email: z.string().trim().email("Имэйл буруу"),
  is_active: z.boolean().default(true),
});
type EditForm = z.infer<typeof editSchema>;

const pwSchema = z
  .object({
    new_password: passwordField,
    confirm_password: z.string().min(1, "Нууц үгийг давтана уу"),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "Нууц үг таарахгүй байна",
    path: ["confirm_password"],
  });
type PwForm = z.infer<typeof pwSchema>;

const inputCls =
  "w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 py-2 text-[13px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";

// Шүүлтүүрийн нягт оролт — нэгж талбарын хуудасны `inp`-тэй ижил
const filterInp =
  "h-9 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all";

const primaryBtn =
  "rounded-lg bg-[#02c0ce] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#02a3af] disabled:opacity-60 transition-colors";
const secondaryBtn =
  "rounded-lg border border-slate-200 dark:border-[#37394d] bg-white dark:bg-[#1e1f27] px-4 py-2 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 transition-colors";

// key — backend-ийн userSortColumns-ийн түлхүүр.
const HEADERS: SortColumn[] = [
  { label: "Хэрэглэгч", key: "name" },
  { label: "Хэрэглэгчийн нэр", key: "username" },
  { label: "Ажилтан", key: "employee" },
  { label: "Алба, хэлтэс", key: "department" },
  { label: "Албан тушаал", key: "position" },
  { label: "Имэйл", key: "email" },
  { label: "Роль" },
  { label: "Идэвхитэй", key: "is_active" },
  { label: "" },
];

/** Роль сонгогч — эрх нэмэгдүүлэлт хийж болох ролийг сонгуулахгүй. */
function RolePicker({
  roles,
  selected,
  onToggle,
  disabled,
  loading,
}: {
  roles: Role[];
  selected: string[];
  onToggle: (roleId: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-[#252630]"
          />
        ))}
      </div>
    );
  }
  if (!roles.length) {
    return (
      <p className="text-[12px] text-slate-400 dark:text-slate-500">
        Роль олдсонгүй
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {roles.map((role) => {
        const permNames = role.permissions?.map((p) => p.name) ?? [];
        // Өөрт байхгүй эрх агуулсан роль — backend 403 буцаах тул сонгуулахгүй.
        const grantable = canGrantRole(permNames);
        const checked = selected.includes(role.id);
        const blocked = disabled || !grantable;
        return (
          <label
            key={role.id}
            title={
              !grantable
                ? "Энэ рольд танд байхгүй эрх агуулагдсан тул олгох боломжгүй"
                : role.description || role.name
            }
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12px] transition-all ${
              blocked
                ? "cursor-not-allowed border-slate-200 dark:border-[#37394d] opacity-50"
                : "cursor-pointer border-slate-200 dark:border-[#37394d] hover:border-[#02c0ce]/40"
            } ${checked ? "border-[#02c0ce]/50 bg-[#02c0ce]/5" : ""}`}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={checked}
              disabled={blocked}
              onChange={() => onToggle(role.id)}
            />
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                checked
                  ? "border-[#02c0ce] bg-[#02c0ce] text-white"
                  : "border-slate-300 dark:border-[#4a4d63]"
              }`}
            >
              {checked ? "✓" : ""}
            </span>
            <span className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-snug text-slate-700 dark:text-slate-200">
              {role.name}
            </span>
            {!grantable && (
              <Lock className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
            )}
          </label>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState({ id: "", label: "" });
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [draft, setDraft] = useState<UserFilter>(EMPTY_FILTER);
  const [filter, setFilter] = useState<UserFilter>(EMPTY_FILTER);
  const [searchTick, setSearchTick] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState | null>(null);

  function applySort(key: string) {
    setSort((cur) => nextSortState(cur, key));
    setPage(1);
  }
  const queryClient = useQueryClient();

  function applySearch() {
    setFilter({ ...draft });
    setPage(1);
    setSearchTick((t) => t + 1);
  }

  function clearAll() {
    setDraft(EMPTY_FILTER);
    setFilter(EMPTY_FILTER);
    setPage(1);
    setSearchTick((t) => t + 1);
  }

  const hasFilter = !!(draft.search || draft.role || draft.is_active);

  // Эрх нь localStorage-ийн token-оос уншигддаг тул зөвхөн mount-ийн дараа
  // тодорхой болно. ready болтол хуудсыг зурахгүй — эрхгүй хэрэглэгчид агуулга
  // анивчиж харагдахаас сэргийлнэ.
  const [ready, setReady] = useState(false);
  const [perms, setPerms] = useState({
    view: false,
    create: false,
    update: false,
    readRoles: false,
  });
  const [selfId, setSelfId] = useState<string | null>(null);

  useEffect(() => {
    setPerms({
      view: canViewUsers(),
      create: canAddUser(),
      update: canEditUser(),
      readRoles: canViewRoles(),
    });
    setSelfId(getCurrentUserId());
    setReady(true);
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["users", filter, page, searchTick, sort],
    queryFn: () =>
      usersApi.list({
        page,
        page_size: PAGE_SIZE,
        search: filter.search || undefined,
        role: filter.role || undefined,
        is_active: filter.is_active ? filter.is_active === "true" : undefined,
        sort: sort?.by,
        order: sort?.dir,
      }),
    enabled: ready && perms.view,
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
    // roles:read эрхгүй бол 403 болох тул дуудахгүй (роль сонгогч ба
    // хайлтын Роль шүүлтүүр хоёулаа энэ жагсаалтаас хамаарна).
    enabled: ready && perms.view && perms.readRoles,
  });

  const roles = useMemo(() => rolesData?.data ?? [], [rolesData]);
  const roleById = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles],
  );

  /**
   * Дуудагч тухайн хэрэглэгчийг эрхийн хувьд "хамардаг" эсэх — backend-ийн
   * callerOutranksTarget-тай ижил дүрэм. Өөрөөсөө өндөр эрхтэй бүртгэлийн
   * нууц үг/имэйлийг өөрчлөх нь эрх нэмэгдүүлэх зам тул backend 403 буцаана;
   * товчийг эндээс нь хааж, шалтгааныг тайлбарлана.
   */
  const outranksTarget = (user: User) => {
    // Ролийн эрхийн жагсаалт татагдаагүй үед хориглохгүй — backend шалгана.
    if (!roles.length) return true;
    const targetPerms = (user.roles ?? []).flatMap(
      (r) => roleById.get(r.id)?.permissions?.map((p) => p.name) ?? [],
    );
    return canGrantRole(targetPerms);
  };

  function resetForms() {
    setShowCreate(false);
    setSelectedEmployee({ id: "", label: "" });
    setCreateRoles([]);
    setEditingUser(null);
    setEditRoles([]);
    setPwUser(null);
    reset();
    editReset();
    pwReset();
  }

  const createMutation = useMutation({
    mutationFn: async ({
      confirm_password: _confirm,
      ...body
    }: CreateForm) =>
      usersApi.create({
        ...body,
        employee_id: selectedEmployee.id,
        position: body.position || undefined,
        role_ids: createRoles.length ? createRoles : undefined,
      }),
    onSuccess: () => {
      toast.success("Хэрэглэгч үүслээ");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      resetForms();
    },
    onError: (err) => toast.error(getApiError(err, "Үүсгэхэд алдаа гарлаа")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success("Устгагдлаа");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => toast.error(getApiError(err, "Устгах боломжгүй")),
  });

  const pwMutation = useMutation({
    mutationFn: ({ password }: { password: string }) =>
      usersApi.changePassword(pwUser!.id, password),
    onSuccess: () => {
      toast.success(
        "Нууц үг шинэчлэгдлээ. Тухайн хэрэглэгч дахин нэвтрэх шаардлагатай.",
      );
      setPwUser(null);
      pwReset();
    },
    onError: (err) =>
      toast.error(getApiError(err, "Нууц үг солиход алдаа гарлаа")),
  });

  // Хэрэглэгчийн мэдээлэл + ролиудыг нэг үйлдлээр хадгална. Роль нь тусдаа
  // маршрутаар олгогддог тул зөвхөн ЗӨРҮҮГ (нэмэгдсэн/хасагдсаныг) илгээнэ.
  const updateMutation = useMutation({
    mutationFn: async (form: EditForm) => {
      const target = editingUser!;
      await usersApi.update(target.id, {
        ...form,
        position: form.position || "",
      });

      if (!canEditUserRoles(target.id)) return;
      const currentIds = (target.roles ?? []).map((r) => r.id);
      const added = editRoles.filter((id) => !currentIds.includes(id));
      const removed = currentIds.filter((id) => !editRoles.includes(id));

      for (const roleId of added) {
        await usersApi.assignRole(target.id, roleId);
      }
      for (const roleId of removed) {
        await usersApi.removeRole(target.id, roleId);
      }
      return { changedRoles: added.length + removed.length > 0 };
    },
    onSuccess: (result) => {
      toast.success(
        result?.changedRoles
          ? "Хадгалагдлаа. Роль өөрчлөгдсөн тул тухайн хэрэглэгч дахин нэвтэрнэ."
          : "Хадгалагдлаа",
      );
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
      setEditRoles([]);
      editReset();
    },
    onError: (err) => {
      toast.error(getApiError(err, "Хадгалахад алдаа гарлаа"));
      // Роль хэсэгчлэн шилжсэн байж мэдэх тул сервэрийн бодит төлөвийг татна.
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { is_active: true },
  });

  const {
    register: editRegister,
    handleSubmit: editHandleSubmit,
    reset: editReset,
    formState: { errors: editErrors },
  } = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const {
    register: pwRegister,
    handleSubmit: pwHandleSubmit,
    reset: pwReset,
    formState: { errors: pwErrors },
  } = useForm<PwForm>({ resolver: zodResolver(pwSchema) });

  function openEdit(user: User) {
    setEditingUser(user);
    setEditRoles((user.roles ?? []).map((r) => r.id));
    setShowCreate(false);
    setPwUser(null);
    editReset({
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username ?? "",
      position: user.position ?? "",
      email: user.email,
      is_active: user.is_active !== false,
    });
  }

  function toggleRole(
    list: string[],
    setList: (next: string[]) => void,
    roleId: string,
  ) {
    setList(
      list.includes(roleId)
        ? list.filter((id) => id !== roleId)
        : [...list, roleId],
    );
  }

  const fields: [keyof CreateForm, string, string, string][] = [
    ["last_name", "Овог", "text", "family-name"],
    ["first_name", "Нэр", "text", "given-name"],
    ["username", "Хэрэглэгчийн нэр (username)", "text", "off"],
    ["position", "Албан тушаал", "text", "off"],
    ["email", "Имэйл", "email", "off"],
  ];

  const editFields: [keyof EditForm, string, string, string][] = [
    ["last_name", "Овог", "text", "family-name"],
    ["first_name", "Нэр", "text", "given-name"],
    ["username", "Хэрэглэгчийн нэр (username)", "text", "off"],
    ["position", "Албан тушаал", "text", "off"],
    ["email", "Имэйл", "email", "off"],
  ];

  const totalPages = data?.total_pages ?? 1;

  if (!ready) {
    return (
      <div className="flex flex-col gap-5">
        <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-[#252630]" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-[#252630]" />
      </div>
    );
  }

  if (!perms.view) {
    return (
      <div className="ap-card p-8 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#37394d]" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Энэ хуудсыг харах эрх байхгүй байна.
        </p>
        <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
          Хэрэглэгчийн бүртгэл харахад <code>users:read</code> эрх шаардлагатай.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Page header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">
              Хэрэглэгчид
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
              Нийт {data?.total ?? 0} хэрэглэгч
            </p>
          </div>
          {perms.create && (
            <button
              onClick={() => {
                setShowCreate((v) => !v);
                setEditingUser(null);
                setPwUser(null);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#02c0ce] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#02a3af]"
            >
              {showCreate ? (
                <X className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {showCreate ? "Болих" : "Нэмэх"}
            </button>
          )}
        </div>

        {/* Filters — нэгж талбарын хуудасны хайх загвартай ижил */}
        <div className="ap-card p-4">
          <div className="flex flex-wrap items-center gap-3" {...searchOnEnter(applySearch)}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Нэр, овог, username, имэйл"
                value={draft.search}
                onChange={(e) =>
                  setDraft((f) => ({ ...f, search: e.target.value }))
                }
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                className={`${filterInp} w-64 pl-8`}
              />
            </div>

            {perms.readRoles && (
              <select
                value={draft.role}
                onChange={(e) =>
                  setDraft((f) => ({ ...f, role: e.target.value }))
                }
                disabled={rolesLoading}
                className={`${filterInp} w-48`}
              >
                <option value="">Роль</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={draft.is_active}
              onChange={(e) =>
                setDraft((f) => ({ ...f, is_active: e.target.value }))
              }
              className={`${filterInp} w-40`}
            >
              <option value="">Төлөв</option>
              <option value="true">Идэвхитэй</option>
              <option value="false">Идэвхгүй</option>
            </select>

            <SearchButton onClick={applySearch} />
            <RefreshButton />

            {hasFilter && (
              <button
                onClick={clearAll}
                className="flex h-9 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 text-[12px] font-medium text-rose-500 transition-colors hover:border-rose-400 hover:bg-rose-100 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-400 dark:hover:border-rose-400/60 dark:hover:bg-rose-400/20"
              >
                <X className="h-3.5 w-3.5" /> Цэвэрлэх
              </button>
            )}
          </div>
        </div>

        {/* Create form */}
        {showCreate && perms.create && (
          <div className="ap-card p-5">
            <p className="mb-4 text-[13px] font-semibold text-slate-700 dark:text-white">
              Шинэ хэрэглэгч
            </p>
            <form
              onSubmit={handleSubmit((d) => createMutation.mutate(d))}
              className="grid grid-cols-2 gap-4"
              autoComplete="off"
            >
              <div className="col-span-2">
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Ажилтан *
                </label>
                <EmployeeSelect
                  selectedId={selectedEmployee.id}
                  selectedLabel={selectedEmployee.label}
                  onSelect={(id, label) => setSelectedEmployee({ id, label })}
                  onClear={() => setSelectedEmployee({ id: "", label: "" })}
                  placeholder="Ажилтан хайх…"
                />
                {!selectedEmployee.id && (
                  <p className="mt-1 text-[11px] text-[#f1556c]">
                    Хэрэглэгч үүсгэхийн өмнө ажилтан сонгоно уу
                  </p>
                )}
              </div>
              {fields.map(([field, label, type, autoComplete]) => (
                <div key={field}>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                    {label}
                  </label>
                  <input
                    type={type}
                    autoComplete={autoComplete}
                    {...register(field)}
                    className={inputCls}
                  />
                  {errors[field] && (
                    <p className="mt-1 text-[11px] text-[#f1556c]">
                      {errors[field]?.message}
                    </p>
                  )}
                </div>
              ))}

              <div className="col-span-2 border-t border-slate-100 dark:border-[#37394d]" />

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Нууц үг
                </label>
                <input
                  type="password"
                  // Админ өөрийн хадгалсан нууц үгээ санамсаргүй бөглөхөөс сэргийлнэ.
                  autoComplete="new-password"
                  {...register("password")}
                  className={inputCls}
                />
                {errors.password ? (
                  <p className="mt-1 text-[11px] text-[#f1556c]">
                    {errors.password.message}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    Хамгийн багадаа {PASSWORD_MIN} тэмдэгт, том/жижиг үсэг, тоо
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Нууц үг давтах
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  {...register("confirm_password")}
                  className={inputCls}
                />
                {errors.confirm_password && (
                  <p className="mt-1 text-[11px] text-[#f1556c]">
                    {errors.confirm_password.message}
                  </p>
                )}
              </div>

              <div className="col-span-2 border-t border-slate-100 dark:border-[#37394d]" />

              <div className="col-span-2">
                <label className="mb-2 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Роль (эрх)
                </label>
                <RolePicker
                  roles={roles}
                  selected={createRoles}
                  loading={rolesLoading}
                  onToggle={(id) => toggleRole(createRoles, setCreateRoles, id)}
                />
              </div>

              <div className="col-span-2">
                <label className="flex w-fit cursor-pointer select-none items-center gap-3">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="sr-only peer"
                  />
                  <div className="relative h-5 w-9 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-[#02c0ce] peer-checked:after:translate-x-4 dark:bg-[#37394d]" />
                  <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                    Идэвхитэй
                  </span>
                </label>
              </div>

              <div className="col-span-2 flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending || !selectedEmployee.id}
                  className={primaryBtn}
                >
                  {createMutation.isPending ? "Үүсгэж байна…" : "Үүсгэх"}
                </button>
                <button type="button" onClick={resetForms} className={secondaryBtn}>
                  Болих
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit form */}
        {editingUser && perms.update && (
          <div className="ap-card p-5">
            <p className="mb-4 text-[13px] font-semibold text-slate-700 dark:text-white">
              Хэрэглэгч засах — {editingUser.last_name} {editingUser.first_name}
            </p>
            <form
              onSubmit={editHandleSubmit((d) => updateMutation.mutate(d))}
              className="grid grid-cols-2 gap-4"
              autoComplete="off"
            >
              {editFields.map(([field, label, type, autoComplete]) => (
                <div key={field}>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                    {label}
                  </label>
                  <input
                    type={type}
                    autoComplete={autoComplete}
                    {...editRegister(field)}
                    className={inputCls}
                  />
                  {editErrors[field] && (
                    <p className="mt-1 text-[11px] text-[#f1556c]">
                      {editErrors[field]?.message}
                    </p>
                  )}
                </div>
              ))}

              <div className="col-span-2 border-t border-slate-100 dark:border-[#37394d]" />

              <div className="col-span-2">
                <label className="mb-2 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Роль (эрх)
                </label>
                {canEditUserRoles(editingUser.id) ? (
                  <RolePicker
                    roles={roles}
                    selected={editRoles}
                    loading={rolesLoading}
                    onToggle={(id) => toggleRole(editRoles, setEditRoles, id)}
                  />
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="text-[12px] text-amber-700 dark:text-amber-400">
                      Өөрийн ролийг өөрөө өөрчлөх боломжгүй. Өөр админ хэрэглэгч
                      гүйцэтгэнэ.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(editingUser.roles ?? []).map((r) => (
                        <span
                          key={r.id}
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ color: "#777edd", background: "#777edd18" }}
                        >
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                {canToggleUserActive(editingUser.id) ? (
                  <label className="flex w-fit cursor-pointer select-none items-center gap-3">
                    <input
                      type="checkbox"
                      {...editRegister("is_active")}
                      className="sr-only peer"
                    />
                    <div className="relative h-5 w-9 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-[#02c0ce] peer-checked:after:translate-x-4 dark:bg-[#37394d]" />
                    <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      Идэвхитэй
                    </span>
                  </label>
                ) : (
                  <>
                    {/* Формын утга хадгалагдахын тулд hidden оруулна — өөрийгөө
                        идэвхгүй болгох боломжийг л хаана. */}
                    <input
                      type="checkbox"
                      {...editRegister("is_active")}
                      className="hidden"
                    />
                    <p className="text-[12px] text-slate-400 dark:text-slate-500">
                      Өөрийгөө идэвхгүй болгох боломжгүй.
                    </p>
                  </>
                )}
              </div>

              <div className="col-span-2 flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className={primaryBtn}
                >
                  {updateMutation.isPending ? "Хадгалж байна…" : "Хадгалах"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setEditRoles([]);
                    editReset();
                  }}
                  className={secondaryBtn}
                >
                  Болих
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Change password form */}
        {pwUser && perms.update && (
          <div className="ap-card p-5">
            <p className="mb-1 text-[13px] font-semibold text-slate-700 dark:text-white">
              Нууц үг сэргээх — {pwUser.last_name} {pwUser.first_name}
            </p>
            <p className="mb-4 text-[11px] text-slate-500 dark:text-slate-400">
              Нууц үг солигдсоны дараа тухайн хэрэглэгчийн нэвтэрсэн бүх сесс
              хүчингүй болно.
            </p>
            <form
              onSubmit={pwHandleSubmit((d) =>
                pwMutation.mutate({ password: d.new_password }),
              )}
              className="grid grid-cols-2 gap-4"
              autoComplete="off"
            >
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Шинэ нууц үг
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  {...pwRegister("new_password")}
                  className={inputCls}
                />
                {pwErrors.new_password ? (
                  <p className="mt-1 text-[11px] text-[#f1556c]">
                    {pwErrors.new_password.message}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    Хамгийн багадаа {PASSWORD_MIN} тэмдэгт, том/жижиг үсэг, тоо
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  Нууц үг давтах
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  {...pwRegister("confirm_password")}
                  className={inputCls}
                />
                {pwErrors.confirm_password && (
                  <p className="mt-1 text-[11px] text-[#f1556c]">
                    {pwErrors.confirm_password.message}
                  </p>
                )}
              </div>
              <div className="col-span-2 flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={pwMutation.isPending}
                  className={primaryBtn}
                >
                  {pwMutation.isPending ? "Хадгалж байна…" : "Хадгалах"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPwUser(null);
                    pwReset();
                  }}
                  className={secondaryBtn}
                >
                  Болих
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Table card */}
        <div className="ap-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <SortableHeaderRow
                  columns={HEADERS}
                  sort={sort}
                  onSort={applySort}
                  thClassName="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
                  className="border-b border-slate-100 bg-slate-50/50 dark:border-[#37394d] dark:bg-[#1a1d20]"
                />
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-[#37394d]">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {HEADERS.map((h, j) => (
                        <td key={h.label || `c-${j}`} className="px-5 py-4">
                          <div className="h-4 rounded bg-slate-100 dark:bg-[#252630]" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={HEADERS.length}
                      className="px-5 py-12 text-center text-[13px] text-[#f1556c]"
                    >
                      Алдаа гарлаа:{" "}
                      {getApiError(error, "Сервертэй холбогдож чадсангүй")}
                    </td>
                  </tr>
                ) : !data?.data?.length ? (
                  <tr>
                    <td
                      colSpan={HEADERS.length}
                      className="px-5 py-12 text-center text-[13px] text-slate-400 dark:text-slate-500"
                    >
                      <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      Хэрэглэгч олдсонгүй
                    </td>
                  </tr>
                ) : (
                  data.data.map((user) => {
                    const isSelf = !!selfId && user.id === selfId;
                    // Өөрийн бүртгэлээ засах нь зөвшөөрөгдөнө; бусдын хувьд
                    // эрхийн "хамрах" шалгалт хийгдэнэ.
                    const manageable = isSelf || outranksTarget(user);
                    return (
                      <tr
                        key={user.id}
                        className="transition-colors hover:bg-slate-50/60 dark:hover:bg-[#252630]"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ background: "#02c0ce" }}
                            >
                              {user.last_name?.[0]?.toUpperCase() ??
                                user.first_name?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 dark:text-white">
                                {user.last_name} {user.first_name}
                              </p>
                              {isSelf && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Та
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[12px] text-slate-500 dark:text-slate-400">
                          {user.username || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                          {user.employee?.person_name || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                          {user.employee?.department_name || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                          {user.employee?.position_name || user.position || "—"}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                          {user.email}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {user.roles?.length ? (
                              user.roles.map((r) => (
                                <span
                                  key={r.id}
                                  title={
                                    roleById.get(r.id)?.description || r.name
                                  }
                                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                  style={{
                                    color: "#777edd",
                                    background: "#777edd18",
                                  }}
                                >
                                  {r.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[12px] text-slate-400 dark:text-slate-500">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {user.is_active !== false ? (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{
                                color: "#02c0ce",
                                background: "#02c0ce18",
                              }}
                            >
                              Идэвхитэй
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{
                                color: "#f1556c",
                                background: "#f1556c18",
                              }}
                            >
                              Идэвхгүй
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {perms.update && (
                              <button
                                disabled={!manageable}
                                title={
                                  manageable
                                    ? "Засах"
                                    : "Өөрөөсөө өндөр эрхтэй хэрэглэгчийг засах боломжгүй"
                                }
                                onClick={() => openEdit(user)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition-colors hover:bg-[#02c0ce]/10 hover:text-[#02c0ce] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:text-slate-500 dark:bg-[#252630] dark:text-slate-400"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {perms.update && (
                              <button
                                disabled={!manageable}
                                title={
                                  manageable
                                    ? "Нууц үг сэргээх"
                                    : "Өөрөөсөө өндөр эрхтэй хэрэглэгчийн нууц үгийг сэргээх боломжгүй"
                                }
                                onClick={() => {
                                  setPwUser(user);
                                  setEditingUser(null);
                                  setShowCreate(false);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-50 disabled:hover:text-slate-500 dark:bg-[#252630] dark:text-slate-400 dark:hover:bg-amber-500/10"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canRemoveUser(user.id) && (
                              <button
                                title="Устгах"
                                onClick={() =>
                                  setPendingConfirm({
                                    title: "Хэрэглэгчийг устгах уу?",
                                    description: `${user.last_name} ${user.first_name} (${user.username || user.email}) устгагдаж, нэвтэрсэн сесс нь хүчингүй болно.`,
                                    confirmLabel: "Устгах",
                                    confirmColor: "#f1556c",
                                    onConfirm: () =>
                                      deleteMutation.mutate(user.id),
                                  })
                                }
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-500 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-[#37394d]">
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                {page} / {totalPages} хуудас
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:bg-[#252630] dark:text-slate-400"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:bg-[#252630] dark:text-slate-400"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
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
