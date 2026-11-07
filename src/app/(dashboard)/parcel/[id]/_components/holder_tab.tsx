"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { landApi } from "@/lib/api";
import { profApi } from "@/lib/prof-api";
import { formatDate, getApiError } from "@/lib/utils";
import { UserCheck, UserPlus, Trash2, Users, Wallet, X, Landmark, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { isAdmin, isExternalSpecialRole, isProfessionalOrg } from "@/lib/role-utils";
import type { ParcelHolder, ParcelOwnership, RepresentativeInput } from "@/types";
import { NoticeSection } from "./notice_section";

function row(label: string, value?: React.ReactNode) {
  return (
    <div key={label} className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-[#37394d] last:border-0">
      <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 w-44">{label}</span>
      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{value || "—"}</span>
    </div>
  );
}

/** Хуулийн этгээд үед last_name хоосон, name-д байгууллагын бүтэн нэр байна */
function holderFullName(holder: ParcelHolder) {
  return [holder.last_name, holder.name].filter(Boolean).join(" ").trim();
}

/**
 * УБЕГ-ийн огноо YYYYMMDD хэлбэрээр (ж: "20110414") ирдэг — Date() үүнийг
 * уншиж чаддаггүй тул formatDate ХЭРЭГЛЭХГҮЙ, шууд задалж харуулна.
 */
function formatUbegDate(value?: string) {
  const digits = (value ?? "").trim();
  if (!/^\d{8}$/.test(digits)) return digits || "—";
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

/**
 * УБЕГ-ийн (Улсын бүртгэлийн ерөнхий газар) газар өмчлөлийн бүртгэл.
 *
 * ГУС-ийн эзэмшигчийн жагсаалттай ХОЛИХГҮЙ — тусдаа эх сурвалж (ХУР/XYP)
 * бөгөөд өмчлөлийн ТҮҮХ (өв залгамжлал, өмчлөгч өөрчлөгдөх) мөр мөрөөр ирдэг
 * тул нэг регистр хэд хэдэн огноотой давтагдана. Иймд мөрүүдийг ЯГ ирсэн
 * байдлаараа, огноогоор бүлэглэн харуулна (аль нь "одоогийн" гэдгийг эх
 * систем заадаггүй тул бид ТААМАГЛАХГҮЙ).
 */
function UbegOwnershipCard({
  items,
  onRefresh,
  refreshing = false,
}: {
  items: ParcelOwnership[];
  /** Тохируулаагүй бол (гадны хэрэглэгч / хаалттай чөлөөлөлт) товч гарахгүй */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  // Огноогоор бүлэглэнэ — шинэ бүртгэл эхэнд.
  const groups = new Map<string, ParcelOwnership[]>();
  for (const item of items) {
    const key = item.record_date || "";
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const ordered = Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  // Толгойн мэдээлэл (гэрчилгээ, зориулалт, хэмжээ, хаяг) мөр бүрт давтагдан
  // ирдэг тул ХАМГИЙН ШИНЭ бүртгэлээс нэг удаа харуулна.
  const latest = ordered[0]?.[1]?.[0];

  return (
    <div className="ap-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Landmark className="h-4 w-4 text-[#8b5cf6]" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          УБЕГ-ийн өмчлөлийн бүртгэл
        </p>
        {items.length > 0 && (
          <span className="rounded-full bg-[#8b5cf6]/10 px-2 py-0.5 text-[11px] font-semibold text-[#8b5cf6]">
            {items.length}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 px-3 text-[12px] font-semibold text-[#8b5cf6] transition-colors hover:bg-[#8b5cf6]/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Шинэчлэх
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-400 dark:border-[#37394d] dark:text-slate-500">
          УБЕГ-ийн өмчлөлийн мэдээлэл татагдаагүй байна.
        </div>
      ) : (
        <>
          {latest && (
            <div className="mb-4">
              {row("Гэрчилгээний дугаар", latest.certificate_no)}
              {row("Зориулалт", latest.landuse_name)}
              {row("Хэмжээ", latest.area ? `${latest.area.toLocaleString()} м²` : undefined)}
              {row("Хаяг", latest.full_address)}
            </div>
          )}

          <div className="space-y-4">
            {ordered.map(([date, rows]) => (
              <div key={date || "no-date"}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-[#252630] dark:text-slate-300">
                    {formatUbegDate(date)}
                  </span>
                  {/* Бүлгийн үйлчилгээ/өмчлөлийн хэлбэр мөр бүрт ижил ирдэг */}
                  <span className="min-w-0 break-words text-[11px] text-slate-400 dark:text-slate-500" title={rows[0].service_name}>
                    {rows[0].service_name || "—"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {rows.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-white/[0.06] dark:bg-[#191b22]"
                    >
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-white">
                        {[item.last_name, item.first_name].filter(Boolean).join(" ") || "—"}
                      </span>
                      {item.register_no && (
                        <span className="rounded-md bg-slate-200/70 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
                          {item.register_no}
                        </span>
                      )}
                      {item.ownership_type && (
                        <span className="ml-auto shrink-0 rounded-full bg-[#8b5cf6]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#8b5cf6]">
                          {item.ownership_type}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Нэг эзэмшигчийн мөр — үндсэн, хамтран эзэмшигч болон итгэмжлэгдсэн
 * төлөөлөгч ижил хэлбэрээр харагдана.
 *
 * selectable=true үед нөхөн төлбөрийг хэн авахыг сонгох radio гарна. Сонголт
 * нь parcel_holder.payment_recipient баганад хадгалагдах ба нэгж талбарт
 * ЗӨВХӨН НЭГ мөр TRUE байна.
 */
function HolderBlock({
  holder,
  selectable = false,
  onSelectPayee,
  selecting = false,
}: {
  holder: ParcelHolder;
  selectable?: boolean;
  onSelectPayee?: (holder: ParcelHolder) => void;
  selecting?: boolean;
}) {
  const name = holderFullName(holder);
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-800 dark:text-white">{name || "—"}</span>
        {holder.register_no && (
          <span className="rounded-md bg-slate-200/70 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {holder.register_no}
          </span>
        )}
        {holder.payment_recipient && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#0acf97]/12 px-2 py-0.5 text-[10.5px] font-semibold text-[#0acf97]">
            <Wallet className="h-3 w-3" /> Төлбөр авагч
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500 dark:text-slate-400">
        {holder.phone && <span>📞 {holder.phone}</span>}
        {holder.email && <span>✉ {holder.email}</span>}
        {holder.address && <span>📍 {holder.address}</span>}
        {holder.person_type && <span>{holder.person_type}</span>}
      </div>
      {holder.note && (
        <p className="text-[11px] italic text-slate-400 dark:text-slate-500">{holder.note}</p>
      )}
      {selectable && !holder.payment_recipient && (
        <button
          type="button"
          onClick={() => onSelectPayee?.(holder)}
          disabled={selecting}
          className="mt-1 inline-flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#02c0ce] transition-colors hover:bg-[#02c0ce]/10 disabled:opacity-50"
        >
          <Wallet className="h-3 w-3" /> Төлбөр олгох
        </button>
      )}
    </div>
  );
}

export function HolderTab({
  acqId,
  parcelId,
  isLocked = false,
  isAcqConfirmed = false,
}: {
  acqId: string;
  parcelId: string;
  isLocked?: boolean;
  isAcqConfirmed?: boolean;
}) {
  const isExternal = isExternalSpecialRole();
  const isProfOrg = isProfessionalOrg();
  const svc = isProfOrg
    ? {
        getParcel: (a: string, p: string) => profApi.profGetParcel(a, p),
        listRepresentatives: (a: string, p: string) => profApi.profListRepresentatives(a, p),
        createRepresentative: (a: string, p: string, body: RepresentativeInput) =>
          profApi.profCreateRepresentative(a, p, body),
        deleteRepresentative: (a: string, p: string, id: string) => profApi.profDeleteRepresentative(a, p, id),
        setPaymentRecipient: (a: string, p: string, h: string) => profApi.profSetPaymentRecipient(a, p, h),
      }
    : {
        getParcel: (a: string, p: string) => landApi.getParcel(a, p),
        listRepresentatives: (a: string, p: string) => landApi.listRepresentatives(a, p),
        createRepresentative: (a: string, p: string, body: RepresentativeInput) =>
          landApi.createRepresentative(a, p, body),
        deleteRepresentative: (a: string, p: string, id: string) =>
          landApi.deleteRepresentative(a, p, id).then(() => undefined),
        setPaymentRecipient: (a: string, p: string, h: string) =>
          landApi.setPaymentRecipient(a, p, h).then(() => undefined),
      };

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["parcel-full", acqId, parcelId],
    queryFn: () => svc.getParcel(acqId, parcelId),
    enabled: !!acqId,
  });
  // Төлөөлөгч ба төлбөр авагчийн сонголт хоёулаа parcel_holder-т байдаг тул
  // parcel-full дахин уншихад л хангалттай (тусдаа жагсаалтын хүсэлт хэрэггүй).
  const refetchHolders = () =>
    queryClient.invalidateQueries({ queryKey: ["parcel-full", acqId, parcelId] });

  const [repModalOpen, setRepModalOpen] = useState(false);
  const [repForm, setRepForm] = useState({ last_name: "", first_name: "", register_no: "", phone: "", email: "", address: "", note: "" });
  const [repFormErrors, setRepFormErrors] = useState<{ last_name?: boolean; first_name?: boolean }>({});
  const [repDeleteConfirm, setRepDeleteConfirm] = useState<string | null>(null);

  const createRepMutation = useMutation({
    mutationFn: () => svc.createRepresentative(acqId, parcelId, repForm),
    onSuccess: () => {
      toast.success("Итгэмжлэгдсэн төлөөлөгч бүртгэгдлээ");
      setRepModalOpen(false);
      setRepForm({ last_name: "", first_name: "", register_no: "", phone: "", email: "", address: "", note: "" });
      setRepFormErrors({});
      void refetchHolders();
    },
    onError: (err) => toast.error(getApiError(err, "Бүртгэхэд алдаа гарлаа")),
  });

  const deleteRepMutation = useMutation({
    mutationFn: (repId: string) => svc.deleteRepresentative(acqId, parcelId, repId),
    onSuccess: () => {
      toast.success("Устгагдлаа");
      setRepDeleteConfirm(null);
      void refetchHolders();
    },
    onError: (err) => toast.error(getApiError(err, "Устгахад алдаа гарлаа")),
  });

  // УБЕГ-ийн өмчлөлийн бүртгэлийг ХУР (XYP) гарцаас дахин татна. Нэгж талбарын
  // ДУГААРААР (UUID биш) хандана. Мөрүүд бүхэлдээ орлогддог тул дахин дарахад
  // давхардал үүсэхгүй. /prof маршрутад ийм гарц БАЙХГҮЙ тул товч нь зөвхөн
  // дотоод ажилтанд (isExternal биш) харагдана.
  const ownershipSyncMutation = useMutation({
    mutationFn: () => {
      if (!data?.parcel_id) throw new Error("Нэгж талбарын дугаар олдсонгүй");
      return landApi.syncParcelOwnerships(acqId, data.parcel_id);
    },
    onSuccess: (res) => {
      toast.success(
        res?.found
          ? `УБЕГ-ийн ${res.saved} бүртгэл шинэчлэгдлээ`
          : "УБЕГ-д өмчлөлийн бүртгэл олдсонгүй",
      );
      void refetchHolders();
    },
    onError: (err) => toast.error(getApiError(err, "УБЕГ-ийн мэдээлэл татахад алдаа гарлаа")),
  });

  // ГУС-ийн эзэмшигчийг татах — «Мэдээлэл дуудах» эцсийн төлөвт хаалттай тул
  // эзэмшигчийг татахаас ӨМНӨ эцсийн төлөвт орсон нэгж талбарын эзэмшигч
  // хоосон үлддэг. Энэ нь ЗАСВАР биш, эх системээс НӨХӨЖ татах тул эзэмшигч
  // хоосон үед эцсийн төлөвт ч зөвшөөрнө (баталгаажсан чөлөөлөлтөд backend 423).
  const holderSyncMutation = useMutation({
    mutationFn: () => {
      if (!data?.parcel_id) throw new Error("Нэгж талбарын дугаар олдсонгүй");
      return landApi.syncParcelHolders(acqId, data.parcel_id);
    },
    onSuccess: () => {
      toast.success("Эзэмшигчийн мэдээлэл татагдлаа");
      void refetchHolders();
    },
    onError: (err) => toast.error(getApiError(err, "Эзэмшигчийн мэдээлэл татахад алдаа гарлаа")),
  });

  const payeeMutation = useMutation({
    mutationFn: (holderRowId: string) => svc.setPaymentRecipient(acqId, parcelId, holderRowId),
    onSuccess: () => {
      toast.success("Нөхөн төлбөр авагч сонгогдлоо");
      void refetchHolders();
    },
    onError: (err) => toast.error(getApiError(err, "Сонгоход алдаа гарлаа")),
  });
  const canEditPayee = !isExternal && !isLocked;
  // УБЕГ-аас дахин татах нь мэдээлэл БИЧИХ үйлдэл — гадны хэрэглэгч
  // (мэрг. байгууллага, МИКА, санхүү) болон хаалттай чөлөөлөлтөд байхгүй.
  const canSyncOwnership = !isExternal && !isLocked;
  const canSendNotice = isAdmin() && !isLocked;

  const handleRepSubmit = () => {
    const errors = { last_name: !repForm.last_name.trim(), first_name: !repForm.first_name.trim() };
    setRepFormErrors(errors);
    if (errors.last_name || errors.first_name) return;
    createRepMutation.mutate();
  };

  if (isLoading)
    return (
      <div className="ap-card p-5 animate-pulse space-y-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-8 rounded bg-slate-100 dark:bg-[#252630]" />)}
      </div>
    );
  if (!data)
    return <div className="ap-card p-10 text-center text-[13px] text-slate-400">Мэдээлэл олдсонгүй</div>;

  // Эх системд нэгээс олон үндсэн өргөдөл гаргагч ирэх тохиолдол БАЙНА —
  // тиймээс "Эзэмшигч" хэсэг нэг бичлэг биш, ЖАГСААЛТ хэлбэртэй.
  const holders = data.holders ?? [];
  // УБЕГ-ийн өмчлөлийн бүртгэл — ХУР/XYP-ээс татагдаж хадгалагдсан мөрүүд
  const ownerships = data.ownerships ?? [];
  const isRep = (h: ParcelHolder) => h.holder_role === "representative";
  const mainHolders = holders.filter((h) => h.main_applicant && !isRep(h));
  const coHolders = holders.filter((h) => !h.main_applicant && !isRep(h));
  // Итгэмжлэгдсэн төлөөлөгч нь эзэмшигчийн НЭГ ТӨРӨЛ болж нэг хүснэгтэд хадгалагдана
  const representatives = holders.filter(isRep);
  // Нөхөн төлбөрийг ХЭНД олгохыг сонгох боломж: үндсэн эзэмшигч олон эсвэл
  // төлөөлөгч бүртгэгдсэн үед л утгатай (нэг л сонголт байвал сонгох зүйлгүй).
  const canChoosePayee = mainHolders.length + representatives.length > 1;
  // Эзэмшигчийн жагсаалт ирээгүй хуучин өгөгдөл дээр parcel_detail-д хуулагдсан
  // үндсэн эзэмшигчийн талбаруудаар нөхөж харуулна.
  const hasDetailHolder = !!(data.detail?.holder_last_name || data.detail?.holder_name);
  // Өмчлөх эрх (right_type=3) — гэрээгүй, улсын бүртгэлээр баталгаажина.
  const isOwnership = data.right_type === 3;
  const canFetchHolders =
    !isExternal && !isProfOrg && !isAcqConfirmed && mainHolders.length === 0 && coHolders.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid md:grid-cols-2 gap-5 items-start">
        {/* Зүүн багана: Эзэмшигч, түүний ДООД талд хамтран эзэмшигч */}
        <div className="flex flex-col gap-5">
        {/* Эзэмшигч (үндсэн өргөдөл гаргагч) */}
        <div className="ap-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Эзэмшигч, өмчлөгч</p>
              {mainHolders.length > 1 && (
                <span className="rounded-full bg-[#02c0ce]/10 px-2 py-0.5 text-[11px] font-semibold text-[#02c0ce]">
                  {mainHolders.length} эзэмшигч
                </span>
              )}
            </div>
            {/* Мэдэгдэх хуудас илгээх — ЗӨВХӨН товч. Дарахад илгээсэн түүх ба
                дээд талд шинээр илгээх (имэйл / Е-Монголиа) хэсэг гарна. */}
            {canSendNotice && <NoticeSection parcelId={parcelId} parcel={data} canSend={canSendNotice} />}
          </div>
          {mainHolders.length > 0 ? (
            <>
              <div className="divide-y divide-slate-100 dark:divide-[#37394d]">
                {mainHolders.map((holder) => (
                  <div key={holder.id} className="py-3 first:pt-0 last:pb-0">
                    <HolderBlock
                      holder={holder}
                      selectable={canEditPayee && canChoosePayee}
                      selecting={payeeMutation.isPending}
                      onSelectPayee={(h) => payeeMutation.mutate(h.id)}
                    />
                  </div>
                ))}
              </div>
              {/* Иргэний үнэмлэх зөвхөн parcel_detail-д ирдэг тул үндсэн эзэмшигч
                  ганц байхад л ямар хүнийх нь тодорхой — олон үед харуулахгүй. */}
              {mainHolders.length === 1 && data.detail?.holder_civil_id && (
                <div className="mt-3 border-t border-slate-100 pt-3 dark:border-[#37394d]">
                  {row("Иргэний үнэмлэх", data.detail.holder_civil_id)}
                </div>
              )}
            </>
          ) : hasDetailHolder && data.detail ? (
            <>
              {row("Овог нэр", `${data.detail.holder_last_name ?? ""} ${data.detail.holder_name ?? ""}`.trim())}
              {row("Регистрийн дугаар", data.detail.holder_register_no)}
              {row("Иргэний үнэмлэх", data.detail.holder_civil_id)}
              {row("Утас", data.detail.holder_phone)}
              {row("И-мэйл", data.detail.holder_email)}
              {row("Эзэмшигчийн төрөл", data.detail.holder_type)}
            </>
          ) : (
            <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center py-8">Байхгүй</p>
          )}
          {canFetchHolders && (
            <div className="mt-3 flex justify-center border-t border-slate-100 pt-3 dark:border-[#37394d]">
              <button
                type="button"
                onClick={() => holderSyncMutation.mutate()}
                disabled={holderSyncMutation.isPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#02c0ce]/10 px-3 text-[12px] font-semibold text-[#02c0ce] transition-colors hover:bg-[#02c0ce]/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${holderSyncMutation.isPending ? "animate-spin" : ""}`} />
                ГУС-аас эзэмшигч татах
              </button>
            </div>
          )}
        </div>

        {/* УБЕГ-ийн өмчлөлийн бүртгэл — ГУС-ийн эзэмшигчээс ТУСДАА эх сурвалж.
            "Мэдээлэл дуудах"-ын "Бусад" бүлгээс татагдана. */}
        <UbegOwnershipCard
          items={ownerships}
          onRefresh={canSyncOwnership ? () => ownershipSyncMutation.mutate() : undefined}
          refreshing={ownershipSyncMutation.isPending}
        />

        {/* Хамтран эзэмшигч, өмчлөгч — үндсэн бус өргөдөл гаргагчид.
            Хоосон байсан ч хэсэг нь ҮРГЭЛЖ харагдана. */}
        <div className="ap-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-[#02c0ce]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Хамтран эзэмшигч, өмчлөгч
            </p>
            {coHolders.length > 0 && (
              <span className="rounded-full bg-[#02c0ce]/10 px-2 py-0.5 text-[11px] font-semibold text-[#02c0ce]">
                {coHolders.length}
              </span>
            )}
          </div>
          {coHolders.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400 dark:text-slate-500">Байхгүй</p>
          ) : (
            <div className="space-y-2">
              {coHolders.map((holder) => (
                <div
                  key={holder.id}
                  className="rounded-xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/60 dark:bg-[#191b22] px-4 py-3"
                >
                  <HolderBlock holder={holder} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Итгэмжлэгдсэн төлөөлөгч */}
        <div className="ap-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-[#02c0ce]" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Итгэмжлэгдсэн төлөөлөгч
              </p>
            </div>
            {!isExternal && !isLocked && (
              <button
                onClick={() => { setRepModalOpen(true); setRepFormErrors({}); }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#02c0ce]/10 px-3 text-[12px] font-semibold text-[#02c0ce] hover:bg-[#02c0ce]/20 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Бүртгэх
              </button>
            )}
          </div>

          {representatives.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400 dark:text-slate-500">
              Байхгүй
            </p>
          ) : (
            <div className="space-y-2">
              {representatives.map((rep) => (
                <div key={rep.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/60 dark:bg-[#191b22] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <HolderBlock
                      holder={rep}
                      selectable={canEditPayee}
                      selecting={payeeMutation.isPending}
                      onSelectPayee={(h) => payeeMutation.mutate(h.id)}
                    />
                  </div>
                  {!isExternal && !isLocked && (
                    repDeleteConfirm === rep.id ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Устгах уу?</span>
                        <button
                          onClick={() => deleteRepMutation.mutate(rep.id)}
                          disabled={deleteRepMutation.isPending}
                          className="h-7 px-2.5 rounded-lg bg-red-500 text-[12px] font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                        >Тийм</button>
                        <button
                          onClick={() => setRepDeleteConfirm(null)}
                          className="h-7 px-2.5 rounded-lg text-[12px] text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252630] transition-colors"
                        >Үгүй</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRepDeleteConfirm(rep.id)}
                        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>

        {/* Өргөдөл & үнэлгээ — баруун */}
        <div className="ap-card p-5">
          {data.detail ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Өргөдлийн мэдээлэл</p>
              {row("Өргөдлийн дугаар", data.detail.app_no)}
              {row("Өргөдлийн огноо", data.detail.app_timestamp ? formatDate(data.detail.app_timestamp) : undefined)}
              {row("Өргөдлийн төрөл", data.detail.app_type)}
              {row("Өргөдлийн төлөв", data.detail.app_status)}
              {row("Шийдвэрийн дугаар", data.detail.decision_no)}
              {row("Шийдвэрийн огноо", data.detail.decision_date ? formatDate(data.detail.decision_date) : undefined)}

              {/* ӨМЧЛӨХ эрхтэй газарт гэрээ байдаггүй — улсын бүртгэлийн
                  (record_*) утгуудыг "Өмчлөл" нэрээр харуулна. Бусад эрхийн
                  төрөлд гэрээ, гэрчилгээ + улсын бүртгэл хоёулаа гарна. */}
              {isOwnership ? (
                <>
                  <div className="mt-5">
                    <div className="h-px w-full bg-[#e2e8f0] dark:bg-[#37394d]" />
                    <p className="pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Өмчлөл</p>
                  </div>
                  {row("Бүртгэлийн дугаар", data.detail.record_no)}
                  {row("Бүртгэлийн огноо", data.detail.record_date ? formatDate(data.detail.record_date) : undefined)}
                  {row("Гэрчилгээний дугаар", data.detail.record_certificate_no)}
                  {row("Төлөв", data.detail.record_status)}
                </>
              ) : (
                <>
                  <div className="mt-5">
                    <div className="h-px w-full bg-[#e2e8f0] dark:bg-[#37394d]" />
                    <p className="pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Гэрээ, гэрчилгээ</p>
                  </div>
                  {row("Гэрээний дугаар", data.detail.contract_no)}
                  {row("Гэрээний огноо", data.detail.contract_date ? formatDate(data.detail.contract_date) : undefined)}
                  {row(
                    "Гэрээний хугацаа",
                    data.detail.contract_begin || data.detail.contract_end
                      ? `${data.detail.contract_begin ? formatDate(data.detail.contract_begin) : "—"} — ${data.detail.contract_end ? formatDate(data.detail.contract_end) : "—"}`
                      : undefined,
                  )}
                  {row("Гэрээний төлөв", data.detail.contract_status)}
                  {row("Гэрээний үл хөдлөхийн дугаар", data.detail.contract_property_no)}
                  {row("Гэрчилгээний дугаар", data.detail.certificate_no)}
                  {row("Гэрчилгээний огноо", data.detail.certificate_date ? formatDate(data.detail.certificate_date) : undefined)}

                  {(data.detail.record_no || data.detail.record_date || data.detail.record_certificate_no || data.detail.record_status) && (
                    <>
                      <div className="mt-5">
                        <div className="h-px w-full bg-[#e2e8f0] dark:bg-[#37394d]" />
                        <p className="pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Улсын бүртгэл</p>
                      </div>
                      {row("Бүртгэлийн дугаар", data.detail.record_no)}
                      {row("Бүртгэлийн огноо", data.detail.record_date ? formatDate(data.detail.record_date) : undefined)}
                      {row("Бүртгэлийн гэрчилгээ", data.detail.record_certificate_no)}
                      {row("Бүртгэлийн төлөв", data.detail.record_status)}
                    </>
                  )}
                </>
              )}
              {(data.detail.valuation_zone || data.detail.base_price_per_ha != null || data.detail.auction_price != null) && (
                <>
                  <div className="mt-5">
                    <div className="h-px w-full bg-[#e2e8f0] dark:bg-[#37394d]" />
                    <p className="pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Газрын үнэлгээ</p>
                  </div>
                  {row("Үнэлгээний бүс / зэрэглэл", data.detail.valuation_zone)}
                  {row("Газрын суурь үнэ /1га/", data.detail.base_price_per_ha != null ? data.detail.base_price_per_ha.toLocaleString() : undefined)}
                  {row("Дуудлагын анхны үнийн итгэлцүүр", data.detail.auction_coeff != null ? String(data.detail.auction_coeff) : undefined)}
                  {row("Дуудлагын анхны үнэ", data.detail.auction_price != null ? `${data.detail.auction_price.toLocaleString()} ₮` : undefined)}
                </>
              )}
            </>
          ) : (
            <p className="text-[13px] text-slate-400 dark:text-slate-500 text-center py-8">Мэдээлэл байхгүй</p>
          )}
        </div>
      </div>

      {/* Төлөөлөгч бүртгэх modal */}
      {repModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1e1f27] shadow-2xl border border-slate-100 dark:border-white/[0.06] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#37394d]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#02c0ce]/10">
                  <UserPlus className="h-4 w-4 text-[#02c0ce]" />
                </div>
                <p className="text-[14px] font-semibold text-slate-800 dark:text-white">Итгэмжлэгдсэн төлөөлөгч бүртгэх</p>
              </div>
              <button onClick={() => setRepModalOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#252630] transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Овог <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={repForm.last_name}
                    onChange={(e) => { setRepForm(f => ({ ...f, last_name: e.target.value })); setRepFormErrors(e2 => ({ ...e2, last_name: false })); }}
                    placeholder="Овог"
                    className={`h-9 w-full rounded-lg border px-3 text-[13px] outline-none transition-all dark:bg-[#1e1f27] dark:text-slate-200 ${repFormErrors.last_name ? "border-red-400 bg-red-50/30 focus:ring-red-400/20" : "border-slate-200 dark:border-white/[0.08] bg-white focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15"}`}
                  />
                  {repFormErrors.last_name && <p className="mt-0.5 text-[11px] text-red-400">Заавал бөглөнө</p>}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Нэр <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={repForm.first_name}
                    onChange={(e) => { setRepForm(f => ({ ...f, first_name: e.target.value })); setRepFormErrors(e2 => ({ ...e2, first_name: false })); }}
                    placeholder="Нэр"
                    className={`h-9 w-full rounded-lg border px-3 text-[13px] outline-none transition-all dark:bg-[#1e1f27] dark:text-slate-200 ${repFormErrors.first_name ? "border-red-400 bg-red-50/30 focus:ring-red-400/20" : "border-slate-200 dark:border-white/[0.08] bg-white focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15"}`}
                  />
                  {repFormErrors.first_name && <p className="mt-0.5 text-[11px] text-red-400">Заавал бөглөнө</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Регистрийн дугаар</label>
                  <input type="text" value={repForm.register_no} onChange={(e) => setRepForm(f => ({ ...f, register_no: e.target.value }))} placeholder="АА99999999" className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Утас</label>
                  <input type="text" value={repForm.phone} onChange={(e) => setRepForm(f => ({ ...f, phone: e.target.value }))} placeholder="9999 9999" className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">И-мэйл</label>
                <input type="email" value={repForm.email} onChange={(e) => setRepForm(f => ({ ...f, email: e.target.value }))} placeholder="example@email.mn" className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Хаяг</label>
                <input type="text" value={repForm.address} onChange={(e) => setRepForm(f => ({ ...f, address: e.target.value }))} placeholder="Хаяг оруулах..." className="h-9 w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Тэмдэглэл</label>
                <textarea
                  value={repForm.note}
                  onChange={(e) => setRepForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  placeholder="Нэмэлт тэмдэглэл..."
                  className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1e1f27] px-3 py-2 text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#02c0ce] focus:ring-2 focus:ring-[#02c0ce]/15 transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-[#37394d]">
              <button onClick={() => setRepModalOpen(false)} className="h-9 px-4 rounded-xl text-[13px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252630] transition-colors">
                Болих
              </button>
              <button
                onClick={handleRepSubmit}
                disabled={createRepMutation.isPending}
                className="h-9 px-5 rounded-xl bg-[#02c0ce] text-[13px] font-semibold text-white hover:bg-[#02c0ce]/90 disabled:opacity-50 transition-colors"
              >
                {createRepMutation.isPending ? "Хадгалж байна..." : "Бүртгэх"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
