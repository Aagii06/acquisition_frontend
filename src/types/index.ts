export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  code: number;
  data: T[];
  message: string;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface User {
  id: string;
  username?: string;
  email: string;
  full_name?: string;
  first_name: string;
  last_name: string;
  position?: string;
  employee_id?: string;
  employee?: Employee;
  is_active?: boolean;
  roles: Role[];
}

export interface Role {
  id: string;
  code?: string;
  name: string;
  resource?: string;
  description?: string;
  permissions: Permission[];
  menus?: Menu[];
}

export interface Permission {
  id: string;
  code?: string;
  name: string;
  action?: string;
  description?: string;
  resource?: string;
}

export interface Menu {
  id: string;
  code: string;
  name: string;
  parent_id?: string;
  parent_code?: string;
  menu_url?: string;
  menu_icon?: string;
  sort_order?: number;
  permissions?: Permission[];
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_name: string;
  actor_position: string;
  actor_roles: string[];
  action: string;
  resource_type: string;
  resource_id: string;
  acquisition_id?: string;
  parcel_id?: string;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export interface Plan {
  id?: string;
  plan_code: string;
  name: string;
  area_m2?: number;
  status?: number;
  /**
   * Хилийн геометр (WGS84 WKT). Backend анхдагчаар буцаахгүй — ЗӨВХӨН
   * `planApi.search(code, { withBoundary: true })` үед дүүрнэ (хилийг газрын
   * зураг дээр зурахад). Том тул шаардлагагүй үед бүү хүс.
   */
  boundary_wkt?: string;
  /**
   * Төлөвлөгөөнд хил бүртгэгдсэн эсэх (/plans/search л буцаана).
   *
   * Чөлөөлөлтийн хил нь төлөвлөгөөний хилээс ХУУЛАГДДАГ тул false үед
   * чөлөөлөлт үүсгэх/хил солих боломжгүй — дэлгэц үүнийг урьдчилан
   * анхааруулна (backend мөн 422 буцаана).
   */
  has_boundary?: boolean;
  // Дундын сервисийн (middleware /plan/project) нэмэлт талбарууд
  code?: string;
  project_id?: string;
  plan_type_name?: string;
  /** Төлөвлөгөөний нэгж талбарын дугаар — төлөвлөгөөг ҮҮГЭЭР хайна */
  parcel_id?: string;
  /** Бүтээн байгуулалтын ажил, ж: "Дамбадаржаа дэд төвийн бүтээн байгуулалтын ажил" */
  gazner?: string;
  start_date?: string | null;
  end_date?: string | null;
  approved_date?: string | null;
}

export interface ConstructionType {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

export interface AcquisitionCategory {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  /** Хариуцсан албаны дугаар (hr_department.department_id). Алба нь ГУС-ийн
   *  өөр сангийн бүртгэл тул зөвхөн дугаар ирнэ — нэрийг /departments
   *  жагсаалтаас тааруулна. null = тодорхойлоогүй. */
  department_id?: number | null;
  /**
   * Энэ ангилалд холбогдсон ЧӨЛӨӨЛӨЛТИЙН тоо (ерөнхий ангилалд дэд
   * ангилалуудаараа дамжсан нь ч орно).
   *
   * Устгахын ӨМНӨ анхааруулахад хэрэглэнэ: FK зөрчигдөж ойлгомжгүй алдаа
   * гарахаас сэргийлнэ.
   */
  acquisition_count?: number;
  /** Дэд ангилалын тоо (зөвхөн ерөнхий ангилалд утгатай). */
  sub_count?: number;
}

export interface DocumentType {
  id: number;
  type: string;
  name: string;
  target: "acquisition" | "parcel" | "both";
  description?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// HR лавлахууд нь ГУС-ийн sdplatform схем дээр шууд буудаг. Тэр схемд байхгүй
// талбарыг (short_name, register_no, sort_order, external_id ...) энд бүү нэм —
// backend буцаахгүй тул дэлгэц дээр үргэлж хоосон харагдана. Байгууллагын
// нэмэлт мэдээлэл ЗӨВХӨН үнэлгээний байгууллагад хамаарах ба ValuationOrg
// дээр байдаг (аппын өөрийн valuation_org_profile хүснэгт).
export interface Organization {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  organization_id: string;
  organization_name?: string;
  parent_id?: string;
  code?: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface Position {
  id: string;
  code?: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Үнэлгээний (мэргэжлийн) байгууллага — байгууллагын мэдээлэл + ажилтнууд.
 *
 * `id` нь `land_acquisition.professional_org_id` / `parcel.independent_org_id`
 * -д хадгалагдах утга (хэрэглэгчийн ID БИШ).
 */
export interface ValuationOrg {
  id: string;
  name: string;
  short_name: string;
  register_no: string;
  license_no: string;
  license_issued_at?: string;
  license_expires_at?: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  is_active: boolean;
  employee_count: number;
  /** Зөвхөн дэлгэрэнгүй (GET /valuation-orgs/:id) хариултад ирнэ. */
  employees?: Employee[];
  created_at?: string;
  updated_at?: string;
}

/** Байгууллагатай ХАМТ бүртгэгдэх ажилтны маягтын утга. */
export interface ValuationOrgEmployeeInput {
  /** Утгатай бол одоо байгаа ажилтныг засна. */
  id?: string;
  last_name: string;
  first_name: string;
  register_no: string;
  phone: string;
  email: string;
  position_name: string;
  /** Хоосон бол нэвтрэх эрх үүсгэхгүй / хуучныг нь хэвээр үлдээнэ. */
  username?: string;
  /** Зөвхөн шинэ эрх үүсгэх эсвэл нууц үг солиход. */
  password?: string;
}

export interface ValuationOrgPayload {
  name: string;
  short_name?: string;
  register_no?: string;
  license_no?: string;
  license_issued_at?: string | null;
  license_expires_at?: string | null;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  is_active?: boolean;
  /** Байхгүй бол ажилтнуудад хүрэхгүй; хоосон массив = бүгдийг идэвхгүй болгох. */
  employees?: ValuationOrgEmployeeInput[];
}

export interface Person {
  id: string;
  person_type: "citizen" | "legal";
  register_no: string;
  last_name?: string;
  first_name?: string;
  legal_name?: string;
  civil_id?: string;
  birth_date?: string;
  gender?: "M" | "F";
  phone?: string;
  email?: string;
  address?: string;
  external_id?: string;
  source?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Employee {
  id: string;
  person_id: string;
  /**
   * Ажилтны нэвтрэх эрх (hr_employee.user_id). Нэвтрэх эрхгүй ажилтанд байхгүй.
   *
   * Чөлөөлөлтөд ажилтан хуваарилах / ажилтнаар шүүх нь
   * `land_acquisition_assignee.user_id`-тай ажилладаг тул тэдгээр газарт
   * ажилтны биш ЭНЭ ID-г дамжуулна.
   */
  user_id?: string;
  /**
   * Нэвтрэх нэр (sd_user.username). ЗӨВХӨН үнэлгээний байгууллагын ажилтны
   * хариултад ирнэ — HR-ийн ерөнхий жагсаалт нь өөр сангийн sd_user-ийг join
   * хийж чаддаггүй. Нэвтрэх эрхгүй ажилтанд байхгүй.
   */
  username?: string;
  person?: Person;
  person_name?: string;
  organization_id: string;
  organization_name?: string;
  department_id?: string;
  department_name?: string;
  position_id: string;
  position_name?: string;
  work_email?: string;
  work_phone?: string;
  hired_at?: string;
  released_at?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AcquisitionAssignee {
  user_id: string;
  user_name: string;
  user_position?: string;
  assigned_by: string;
  assigned_by_name: string;
  assigned_at: string;
}

export interface FundingSource {
  id: string;
  acquisition_id: string;
  organization_name: string;
  source_type: string;
  amount?: number;
  currency?: string;
  note?: string;
  created_at: string;
  created_by?: string;
}

export interface LandAcquisition {
  id: string;
  plan_code: string;
  plan_name: string;
  geometry_wkt: string;
  area_m2: number;
  status: number;
  start_date?: string;
  end_date?: string;
  acquisition_name: string;
  implementing_org: string;
  reason: string;
  responsible_org: string;
  funding_source: string;
  general_category_id?: number;
  general_category_name: string;
  sub_category_id?: number;
  sub_category_name: string;
  decree_number: string;
  decree_date?: string;
  /**
   * НИТХ (Нийслэлийн иргэдийн Төлөөлөгчдийн Хурал) тогтоолын дугаар ба тогтоолын
   * хавсралтын бүлэг жагсаалтын дугаар. decree_number нь НЗД-ын ЗАХИРАМЖ —
   * өөр баримт, хоёулаа зэрэгцэн хадгалагдана. "" = бүртгээгүй.
   */
  nith_decree_number?: string;
  group_list_number?: string;
  created_at: string;
  created_by: string;
  parcel_count: number;
  /** Эцсийн төлөвт (Нөлөөлөгдсөн гарсан/Татгалзсан/Чөлөөлсөн) шилжсэн талбар */
  final_parcel_count?: number;
  /**
   * БАЙРШЛААР давхардсан нэгж талбарын тоо. 0-ээс их бол чөлөөлөлт "Хээрийн
   * судалгаа" төлөв рүү шилжихгүй — жагсаалт дээр улаанаар анхааруулна.
   */
  overlapping_parcel_count?: number;
  /** Чөлөөлөлтийн явц 0-100 (backend бодно — жагсаалт/дашбоард нэг тоо). */
  progress_percent?: number;
  aus: AU[];
  parcels?: Parcel[];
  assigned_users?: AcquisitionAssignee[];
  // Professional org assigned to perform the primary valuation
  professional_org_id?: string;
  professional_org_name?: string;
  // Дэлгэрэнгүй (getById) дээр л ирнэ — тусдаа funding-sources GET API байхгүй
  funding_sources?: FundingSource[];
  /* Төлөвлөгөөний ДЭЛГЭРЭНГҮЙ — мөн зөвхөн getById дээр (plan хүснэгтээс).
     plan_code нь төлөвлөгөөний КОД (ж: "2026-04-011-9878"), харин
     plan_parcel_id нь түүний НЭГЖ ТАЛБАРЫН дугаар (ж: "5029776") — хоёр
     өөр зүйл тул тусад нь харуулна. */
  plan_parcel_id?: string;
  plan_type_name?: string;
  plan_gazner?: string;
  plan_area_m2?: number;
  plan_start_date?: string | null;
  plan_end_date?: string | null;
  plan_approved_date?: string | null;
}

/**
 * PUT /land-acquisitions/:id-ийн хариулт.
 *
 * Хил солиход ЗӨВХӨН чөлөөлөлтийн хил өөрчлөгдөнө — нэгж талбарт юу ч
 * хийгдэхгүй (нөлөөлөлд өртсөн хил/талбай ч дахин бодогдохгүй). warning нь
 * хил солигдсон үед л ирнэ.
 */
export interface LandAcquisitionUpdateResult extends LandAcquisition {
  warning?: string;
}

/**
 * Нийгэм, эдийн засгийн судалгааны бүртгэл (чөлөөлөлтөд НЭГ).
 *
 * Судалгааны эх баримт нь ЗААВАЛ PDF — олон файл сонгосон бол browser дээр
 * НЭГ PDF болж нэгтгэгдэн хадгалагдана. file_url нь /api/files харьцангуй зам.
 */
/** Шилжин суурьшсан байршил: Гэр хороолол | Орон сууц */
export type RelocationType = "ger_district" | "apartment";

/**
 * Чөлөөлөгдсөн газрын судалгаа — нэгж талбарт НЭГ бүртгэл. Нэгж талбар
 * үүсэхэд хоосон бүртгэл backend-д автоматаар үүснэ.
 * Тоон хариулт 1 | 2 | 3 (3 = «3+»), хариулаагүй бол null.
 */
export interface ParcelSurvey {
  id: string;
  /** parcel.id (uuid) */
  parcel_id: string;
  /** Утаат яндангийн тоо */
  chimney_count: number | null;
  /** Нүхэн жорлон гаргасан тоо */
  toilet_count: number | null;
  /** Гэр сууцанд хамтран амьдрагчийн тоо */
  cohabitant_count: number | null;
  relocation_type: RelocationType | "";
  relocation_address: string;
  note: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export type ParcelSurveyInput = Pick<
  ParcelSurvey,
  "chimney_count" | "toilet_count" | "cohabitant_count" | "relocation_type" | "relocation_address" | "note"
>;

export interface ParcelSurveyRow extends ParcelSurvey {
  /** Нэгж талбарын дугаар */
  parcel_code: string;
  acquisition_id: string;
  acquisition_name: string;
  au3_code: string;
}

/** Асуулт бүрийн хариултын тоо — түлхүүр нь хариулт ("1" | "2" | "3" эсвэл RelocationType). */
export interface ParcelSurveySummary {
  /** Бүх нэгж талбарын судалгаа (хоосон нь орно) */
  total: number;
  /** Бөглөсөн судалгаа — хариултын хувийг үүнээс бодно */
  answered: number;
  chimney_counts: Record<string, number>;
  toilet_counts: Record<string, number>;
  cohabitant_counts: Record<string, number>;
  relocation_counts: Record<string, number>;
}

export interface AcquisitionSocioSurvey {
  id: string;
  acquisition_id: string;
  /** Зөвшөөрсөн иргэн, хуулийн этгээдийн тоо */
  agreed_count: number;
  /** Татгалзсан иргэн, хуулийн этгээдийн тоо */
  rejected_count: number;
  note: string;
  file_url: string;
  file_name: string;
  size_bytes: number;
  updated_at: string;
  updated_by: string;
}

/**
 * Урьдчилан мэдэгдэх хуудсыг имэйлээр илгээсэн НЭГ бичлэг (түүх).
 *
 * status: "sent" — SMTP хүлээн авсан, "failed" — илгээгдээгүй (error_message-д
 * шалтгаан). Амжилтгүй оролдлого ч бүртгэгддэг тул "илгээсэн гэж бодох"
 * эндүүрэл гарахгүй.
 */
export interface ParcelNoticeEmail {
  id: string;
  parcel_id: string;
  to_email: string;
  subject: string;
  /** Илгээсэн ЯГ ТЭР PDF (/api/files харьцангуй зам) */
  file_url: string;
  file_name: string;
  status: "sent" | "failed";
  error_message?: string;
  sent_at: string;
  sent_by: string;
}

/**
 * Мэдэгдэх хуудсыг E-Mongolia-гаар хүргүүлсэн НЭГ бичлэг (түүх).
 *
 * status: "sent" — гадаад систем хүлээн авсан, "mocked" — гадаад холболт
 * байхгүй тул ТҮР бүртгэсэн (иргэнд хүрсэн гэж тооцохгүй), "failed" — алдаа.
 */
export interface ParcelEMongoliaNotice {
  id: string;
  parcel_id: string;
  /** Хүлээн авагчийн регистрийн дугаар (E-Mongolia-ийн танигч) */
  register_no: string;
  recipient_name?: string;
  subject: string;
  file_url: string;
  file_name: string;
  status: "sent" | "mocked" | "failed";
  /** Гадаад системийн лавлагааны дугаар (мок үед MOCK-…) */
  external_ref?: string;
  error_message?: string;
  sent_at: string;
  sent_by: string;
}

// Шүүлтүүрийн dropdown-ы хөнгөн бүтэц (GET /land-acquisitions/filter-options).
// Үндсэн LandAcquisition-ы 25+ талбарын оронд зөвхөн 4 талбар — dropdown-д
// хэрэгтэй нь тэр л. Дэлгэрэнгүйг landApi.filterOptions тайлбарт.
export interface LandAcquisitionOption {
  id: string;
  acquisition_name: string;
  plan_code: string;
  plan_name: string;
}

export interface AU {
  au1_code: string;
  au1_name: string;
  au2_code: string;
  au2_name: string;
  au3_code: string;
  au3_name: string;
}

export const RIGHT_TYPE_LABELS: Record<number, string> = {
  1: "Ашиглах",
  2: "Эзэмших",
  3: "Өмчлөх",
};

export interface ParcelStatus {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  /**
   * `#rrggbb` — бүртгэлээс ирэх ӨНГӨ. Төлөвийн өнгөний ЭХ СУРВАЛЖ нь энэ:
   * жагсаалтын тэмдэглэгээ, дашбоардын диаграм, газрын зургийн давхарга
   * бүгд эндээс авна. Хоосон (шинэ төлөв өнгө сонгоогүй) байж болно —
   * тэр үед доорх хатуу хүснэгт/саарал өгөгдмөл рүү уначихна.
   */
  color?: string;
  /** Төлөвийн дүрэм («Нэгж талбарын төлөв» тохиргоо). */
  is_final?: boolean;
  locks_progress?: boolean;
  is_valuation_stage?: boolean;
  is_released?: boolean;
  requires_reason?: boolean;
}

/** Нэгж талбарын төлөвийн дүрэм — бүртгэлийн (parcel_status) тохиргоо. */
export interface ParcelStatusRules {
  /** Эцсийн: нэгж талбарын засвар түгжигдэнэ; чөлөөлөлт баталгаажуулахад шаардлагатай. */
  is_final: boolean;
  /** Энэ төлөвөөс цааш явц солихгүй. */
  locks_progress: boolean;
  /** Үнэлгээний шат: гадаад байгууллага харж, үнэлгээ засна. */
  is_valuation_stage: boolean;
  /** Захирамжид холбогдоно: захирамжийн төсөлд холбогдоно, батлагдсан олговор шаардана, чөлөөлөлт устгах / хил өөрчлөхийг хаана. */
  is_released: boolean;
  /** Энэ төлөвт шилжихэд шалтгаан заавал. */
  requires_reason: boolean;
}

/** Анхны төлөв (parcel.status-ийн DEFAULT). id нь code-той ижил (101–109). */
export const PARCEL_STATUS_INITIAL_ID = 101;

/** Өнгө тохируулаагүй төлөвийн саарал (бүртгэлд өнгөгүй эсвэл бүртгэл ачаалагдаагүй). */
export const PARCEL_STATUS_FALLBACK_COLOR = "#94a3b8";

/**
 * Төлөвийн өнгө — ЗӨВХӨН backend-ийн бүртгэлээс (`parcel_status.color`).
 * Код дотор төлөвийн id/нэрээр хатуу өнгө БАЙХГҮЙ: id, нэр, өнгийг админ
 * «Нэгж талбарын төлөв» тохиргооноос удирдана. Өнгө авахдаа
 * `useParcelStatusStyle` / `useParcelStatusColors` (lib/use-parcel-status-style).
 */
export function getParcelStatusStyle(color?: string | null) {
  const c = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : PARCEL_STATUS_FALLBACK_COLOR;
  return { color: c, bg: `${c}1f` };
}

/**
 * Нөхөх олговрын олголтын гүйцэтгэл — «Нөхөх олговор олгосон баримт»-аас
 * (60% / 40% / бүрэн). Огноо нь YYYY-MM-DD; олгоогүй бол null.
 */
export interface CompensationPaymentInfo {
  compensation_paid_60?: boolean;
  compensation_paid_40?: boolean;
  compensation_paid_full?: boolean;
  compensation_paid_60_at?: string | null;
  compensation_paid_40_at?: string | null;
  compensation_paid_full_at?: string | null;
  /** 0 | 40 | 60 | 100 */
  compensation_paid_percent?: number;
}

export interface Parcel extends CompensationPaymentInfo {
  id: string;
  parcel_id: string;
  au1_code: string;
  au2_code: string;
  au3_code: string;
  /** Засаг захиргааны нэгжийн нэр (au1/au2/au3) — жагсаалтын «Хаяг». */
  au1_name?: string;
  au2_name?: string;
  au3_name?: string;
  landuse_name?: string;
  /** Гудамж, хашаа — жагсаалтын «Хаяг»-т залгана. */
  address_streetname?: string;
  address_khashaa?: string;
  right_type: number;
  status: number;
  /** Жагсаалтын API төлөвийн дугаарыг ЭНЭ нэрээр буцаадаг (status биш). */
  status_id?: number;
  status_name: string;
  landuse: string;
  area_m2: number;
  acquisition_area_m2: number;
  cash_amount?: number;
  land_grant_amount?: number;
  land_grant_count?: number;
  remaining_area_m2?: number;
  compensation_paid: boolean;
  db_changed: string;
  changed_parcel_id: string;
  geometry_wkt?: string;
  independent_org_id?: string;
  independent_org_name?: string;
  /**
   * Газар өмчлөгч/эзэмшигчийн бүтэн нэр — ҮНДСЭН хүсэлт гаргагч
   * (parcel_holder.main_applicant). Нэг нэгж талбар дээр олон эзэмшигч байж
   * болох тул нийт тоо нь holder_count.
   */
  holder_name?: string;
  holder_count?: number;
  /**
   * Өөр нэгж талбартай БАЙРШЛААР давхцаж байгаа эсэх (parcel_overlap).
   * Давхардал нь нэг газрын нөхөх олговрыг хоёр удаа бодох эрсдэл тул
   * жагсаалт/дэлгэрэнгүй дээр УЛААНААР анхааруулна. Давхардалтай хэвээр бол
   * чөлөөлөлт "Хээрийн судалгаа" төлөв рүү шилжихгүй.
   */
  has_overlap?: boolean;
  overlap_count?: number;
  // Урсгал бүрийн нөхөх олговрын илгээх төлөв (valuation_type → status).
  // Санхүүгийн мэргэжилтэнд зөвхөн илгээсэн/баталгаажсан урсгалтай нэгж талбар харагдана.
  valuation_statuses?:
    Partial<Record<ValuationType, ValuationStatus>> | ParcelValuationStatus[];
}

/** Нэгж талбарын БАЙРШЛЫН давхардал (нэг мөр = нэг давхцаж буй талбар). */
export interface ParcelOverlap {
  /** Давхцаж байгаа нэгж талбарын UUID (дэлгэц түүн рүү холбоно) */
  other_parcel_uuid: string;
  /** Давхцаж байгаа нэгж талбарын ДУГААР */
  other_parcel_id: string;
  /** Давхцах хэсгийн талбай, м² */
  overlap_area_m2: number;
  other_status_id: number;
  other_status_name: string;
  detected_at: string;
  /** Давхцаж байгаа нэгж талбарын хил (WKT, EPSG:4326) */
  other_geometry_wkt?: string;
  /** Хоёр талбарын огтлолцох хэсэг (WKT, EPSG:4326) */
  overlap_geometry_wkt?: string;
}

export interface StatusOption {
  id: number;
  label: string;
}

export interface AcquisitionProgress {
  id: string;
  from_status: number;
  to_status: number;
  note: string;
  changed_by: string;
  changed_at: string;
}

export interface BoundaryHistory {
  id: string;
  land_acquisition_id: string;
  old_geometry_wkt: string;
  new_geometry_wkt: string;
  /**
   * Хуучин/шинэ хилийн ТАЛБАЙ (м²). Backend нь хадгалсан геометрээс
   * public.calculate_area_utm-ээр бодож өгдөг (нэгж талбартай ижил аргачлал)
   * — browser дээр дахин тооцохгүй.
   */
  old_area_m2: number;
  new_area_m2: number;
  changed_by: string;
  changed_at: string;
}

/**
 * Гараас оруулах хилийн файлыг ХАДГАЛАЛГҮЙ шалгасан үр дүн
 * (POST /land-acquisitions/:id/boundary-preview).
 */
export interface BoundaryPreview {
  /** Файлаас уншсан хил (WGS84 WKT) — газрын зураг дээр харуулна. */
  geometry_wkt: string;
  area_m2: number;
  /** Жишиг (төлөвлөгөөний) хилийн талбай. 0 = жишиг байхгүй. */
  reference_area_m2: number;
  deviation_percent: number;
  max_deviation_percent: number;
  /** false бол хадгалах үед сервер татгалзана. */
  accepted: boolean;
  /** Шинэ хилтэй ОГТ давхцахгүй болох нэгж талбарууд (устгагдахгүй). */
  outside_parcels?: BoundaryOutsideParcel[];
}

export interface BoundaryOutsideParcel {
  parcel_id: string;
  status_name: string;
  released: boolean;
  geometry_wkt: string;
}

export interface Document {
  id: string;
  name: string;
  file_type: string;
  file_url: string;
  size_bytes: number;
  note: string;
  uploaded_by: string;
  uploaded_at: string;
  document_type_id?: number;
  /**
   * Эх системийн (ГУС) баримтын дугаар.
   * - утгатай → эх системээс ТАТАГДСАН хавсралт (устгах боломжгүй, дараагийн
   *   татахад буцаж орж ирнэ)
   * - хоосон/байхгүй → хэрэглэгч ГАРААР оруулсан
   */
  source_doc_id?: string;
  /**
   * ГУС-ийн баримтын үүргийн код (ж: "1"=Өргөдөл, "11"=Кадастрын зураг).
   * Хавсралтыг Кадастр/Төлбөр/Мониторинг гэж бүлэглэхэд ашиглана.
   * document_type_id-тай ХАМААРАЛГҮЙ — дугаарлалт нь огт өөр.
   */
  source_doc_code?: string;
  /** «Нөхөх олговор олгосон баримт»: 60 | 40 | 100 (бүрэн), олгосон огноо (YYYY-MM-DD). */
  payment_stage?: number;
  payment_date?: string;
}

/**
 * Нэгж талбарын хавсралт татсаны үр дүн.
 * Татах нь ЗӨВХӨН НЭМЭХ үйлдэл — юу ч устгагдахгүй, дарагдахгүй тул дахин
 * дахин дарж болно (2 дахь удаад saved=0, skipped=N).
 */
/** Эзэмшигчийн мэдээлэл татсаны үр дүн */
export interface ParcelHolderSyncResult {
  /** ГУС-аас ирсэн нийт */
  found: number;
  /** Хадгалагдсан (регистрийн давхардал хассаны дараах) */
  saved: number;
  /** Регистр давхцсан тул алгасагдсан */
  skipped: number;
}

/**
 * Газрын суурь үнэ + үнэлгээний хүчин зүйлийн задаргаа
 * (ГУС data_cama, /parcel/base-price/{parcel}/factors).
 */
export interface ParcelBasePrice {
  status: boolean;
  parcel_id: string;
  base_price: number;
  factor_values: ParcelBasePriceFactor[];
}

/** Үнэлгээний нэг хүчин зүйлийн утга */
export interface ParcelBasePriceFactor {
  factor_id: number;
  factor_code: string;
  factor_name: string;
  factor_data_type: string;
  factor_value: number | null;
  year_value: number | null;
  in_active: boolean | null;
  /** closets_parcel_id — эх системийн баганын нэр (closets ≠ closest), засаагүй */
  closets_parcel_id: string;
}

/**
 * Газрын ТӨЛБӨРИЙН БОДОЛТ бүсээр (ГУС POST /parcel/fee).
 * Нийт төлбөр нь мөрүүдийн payment-ийн НИЙЛБЭР.
 */
export interface ParcelFeeItem {
  zone_id: string;
  zone_type: string;
  zone_no: string;
  zone_name: string;
  area: number;
  landuse_area: number;
  zone_area: number;
  base_fee_id: string;
  resolution_id: string;
  confidence_percent: number;
  subsidized_area: number;
  subsidized_fee_rate: number;
  base_price_m2: number;
  base_fee_per_m2: number;
  landuses: string;
  value: number;
  payment: number;
}

/**
 * Төлбөр татсаны үр дүн. status=false бол ГУС төлбөрийг бодож ЧАДААГҮЙ —
 * шалтгаан msg-д монголоор ирнэ (алдаа биш).
 */
export interface ParcelFeeSyncResult {
  found: number;
  status: boolean;
  msg: string;
  area_m2: number;
  total_payment: number;
  items: ParcelFeeItem[];
}

/** Газрын төлбөрийн нэхэмжлэл */
export interface ParcelInvoice {
  invoice_no: string;
  description: string;
  amount: number;
  paid_amount: number;
  status_id: number;
  status_name: string;
}

export interface ParcelInvoiceSyncResult {
  found: number;
  invoices: ParcelInvoice[];
}

/** Барьцаа. source_parent_id утгатай бол ДАВХАР барьцаа */
export interface ParcelMortgage {
  id: string;
  source_id: string;
  source_parent_id: string;
  app_no: string;
  start_mortgage_period: string;
  end_mortgage_period: string;
  loan_contract_no: string;
  mortgage_contract_no: string;
  loan_contract_amount: number;
  monetary_unit_value: number;
  unit_type: string;
  mortgage_type: string;
  status_id: string;
  status_name: string;
}

/** Шүүхийн шийдвэр */
export interface ParcelCourtDecision {
  id: string;
  source_id: string;
  app_no: string;
  start_period: string;
  end_period: string;
  court_status: string;
  status_name: string;
  court_decision_no: string;
}

/** Хянан баталгааны мэдээлэл */
export interface ParcelMonitoring {
  id: string;
  monitoring_id: string;
  page_no: string;
  status_name: string;
  company_name: string;
  created_at: string;
}

/**
 * УБЕГ-ийн газар өмчлөлийн бүртгэлийн НЭГ мөр (ХУР/XYP гарц).
 *
 * ГУС-ийн эзэмшигч (ParcelHolder)-ээс ТУСДАА эх сурвалж: нэг нэгж талбар дээр
 * хамтран өмчлөгчид болон өмчлөлийн ТҮҮХ (өв залгамжлал, өмчлөгч өөрчлөгдөх)
 * мөр мөрөөр ирдэг тул нэг register_no хэд хэдэн огноотой давтагдаж болно.
 */
export interface ParcelOwnership {
  id: string;
  /** УБЕГ дээрх нэгж талбарын дугаар (prprty_parcel_id) */
  source_parcel_id: string;
  /** Бүртгэлийн огноо — YYYYMMDD (эх системийн хэлбэрээр) */
  record_date: string;
  /** Улсын бүртгэл/гэрчилгээний дугаар (ubd) */
  certificate_no: string;
  landuse_name: string;
  /** Хэмжээ (м²). Эх системд текстээр ирдэг тул хөрвүүлж чадаагүй үед 0 */
  area: number;
  register_no: string;
  first_name: string;
  last_name: string;
  /** Өмчлөлийн хэлбэр (ж: "Өмчилсөн", "Өв залгамжлуулсан") */
  ownership_type: string;
  ownership_code: string;
  /** Бүртгэлийг үүсгэсэн улсын бүртгэлийн үйлчилгээ */
  service_name: string;
  service_code: string;
  aimag_city_name: string;
  aimag_code: string;
  soum_district_name: string;
  soum_code: string;
  bag_khoroo_name: string;
  bag_code: string;
  address_street_name: string;
  bair_number: string;
  toot: string;
  full_address: string;
}

/** Татаж хадгалсан бичлэгийн тоо */
export interface ParcelSyncCountResult {
  found: number;
  saved: number;
}

export interface ParcelDocumentSyncResult {
  /** Эх системд олдсон нийт */
  found: number;
  /** Шинээр нэмэгдсэн */
  saved: number;
  /** Өмнө нь татагдсан тул алгасагдсан */
  skipped: number;
  /** Татсаны дараах ЭЦСИЙН бүх хавсралт — жагсаалтыг үүгээр шууд шинэчилнэ */
  documents: Document[];
}

/**
 * Дроны зургийг файлын систем руу ШУУД байршуулах зөвшөөрөл.
 *
 * Backend-ээс гардаг presigned URL — browser файлыг API-аар дамжуулахгүйгээр
 * тавьдаг тул файлын хэмжээ хязгаарлагдахгүй.
 */
export interface DroneUploadTicket {
  /** Browser ЭНЭ URL руу PUT хийнэ (зөвшөөрөл нь URL дотор) */
  url: string;
  method: string;
  /** Байршуулалт бүтсэний дараа DB-д бичигдэх зам */
  file_url: string;
  /** Хадгалалтад үүсэх файлын нэр — бүртгүүлэхэд буцааж явуулна */
  stored_name: string;
  expires_in_seconds: number;
}

/**
 * Дроны ортофото (.tif). Зураг тус бүр GeoServer дээр ӨӨРИЙН давхаргатай
 * (`layer_name`, ж: "land:drone_orto_ab12cd34"). GeoServer растрыг файлын
 * системээс HTTP Range хүсэлтээр шууд уншдаг тул backend дээр хуулбар байхгүй.
 */
export interface DroneImage {
  id: string;
  acquisition_id: string;
  /** Файлын системд хадгалагдсан нэр (давхаргын нэр эндээс тооцогдоно) */
  file_name: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  /** GeoServer-ээс уншсан WGS84 хүрээ — "зураг дээр очих"-д. Байхгүй байж болно. */
  min_x?: number;
  min_y?: number;
  max_x?: number;
  max_y?: number;
  /** Мозайкийн индекст granule болж бүртгэгдсэн эсэх */
  published: boolean;
  uploaded_at: string;
  uploaded_by?: string;
  /** WMS-д явуулах давхаргын нэр — зураг тус бүрт ӨӨР */
  layer_name: string;
  /**
   * GeoServer-т давхарга үүсгэхэд гарсан алдаа (бүртгэх үед л ирнэ).
   * Зураг хадгалалтад бүтэн орсон тул алдаа биш — гэхдээ шалтгааныг
   * хэрэглэгчид харуулж, "Шинэчлэх"-ээр дахин оролдох боломж үлдээнэ.
   */
  publish_error?: string;
}

export interface ParcelStatusHistory {
  id: number;
  parcel_id: string;
  acquisition_id: string;
  status_id: number;
  status_name: string;
  status_date: string;
  created_by: string;
  /** Төлөв солих ШАЛТГААН. Нөлөөлөгдсөн гарсан / Татгалзсан үед заавал,
   *  бусад төлөвт хоосон байж болно. */
  reason?: string;
  /** Тухайн шилжилтийн ХАВСРАЛТ. "Татгалзсан" үед заавал; хоосон = байхгүй.
   *  Файл нь нэгж талбарын баримт болж мөн бүртгэгддэг тул "Хавсралт"
   *  хэсэгт ч харагдана. */
  attachment_url?: string;
  attachment_name?: string;
}

// Нөхөх олговрын үнэлгээний илгээх/зөвшөөрөх төлөв (нэгж талбар бүрт).
// "rejected" — өөр урсгал баталгаажихад автоматаар татгалзагдсан (эцсийн).
export type ValuationStatus =
  "draft" | "submitted" | "approved" | "returned" | "rejected";

export interface ParcelValuationStatus {
  valuation_type: ValuationType;
  status: ValuationStatus;
  count?: number;
}

export interface ValuationSubmission {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  valuation_type: ValuationType;
  status: ValuationStatus;
  submitted_by: string;
  submitted_at: string | null;
  reviewed_by: string;
  reviewed_at: string | null;
  last_note: string;
  /**
   * СҮҮЛИЙН үйлдлийн хавсралт (`/api/files` харьцангуй зам). Хоосон =
   * хавсралтгүй. Хавсралт нь ЗААВАЛ БИШ ба зөвхөн буцаалтад хамаарна.
   */
  attachment_url: string;
  attachment_name: string;
  /**
   * БАТАЛГААЖААГҮЙ үнэлгээний тайлан — ИЛГЭЭХ үед хавсаргана (PDF/Word).
   * Буцаах/цуцлах хавсралтаас ТУСДАА хадгалагддаг тул хяналтын бүх шатанд
   * уншигдана. Солих нь зөвхөн дахин илгээх замаар.
   */
  draft_report_url: string;
  draft_report_name: string;
  created_at: string;
  updated_at: string;
}

/**
 * ТӨСӨӨЛЛИЙН үнэлгээний өөрчлөлтийн түүх (нэг мөр = нэг өөрчлөлт).
 *
 * `parcel` дээр зөвхөн ХАМГИЙН СҮҮЛИЙН утга хадгалагддаг тул үнэлгээ хэрхэн
 * бүрдсэнийг ЗӨВХӨН эндээс уншина.
 */
export interface ParcelEstimatedValueHistory {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  /** null = тэр үйлдлээр үнэлгээ АРИЛГАГДСАН. */
  value: number | null;
  /** null = итгэлцүүр хэрэглээгүй (өмчлөх эрхийн газар). */
  confidence_percent: number | null;
  /** Гараар оруулсан суурь/жишиг үнэ (₮/м²). null = ГУС-ийн бүсийн төлбөрөөр. */
  base_fee_per_m2: number | null;
  /** Тооцоололд хэрэглэсэн нөлөөлөлд өртсөн талбай (м²). */
  area_m2: number;
  /** Хавсралт. Хоосон = хавсралтгүй. */
  attachment_url: string;
  attachment_name: string;
  created_by: string;
  created_at: string;
}

export interface ValuationSubmissionHistory {
  id: number;
  acquisition_id: string;
  parcel_id: string;
  action: "submit" | "approve" | "return" | "reject" | "cancel";
  from_status: string;
  to_status: string;
  note: string;
  /** Тухайн үйлдлийн хавсралт. Хоосон = хавсралтгүй. */
  attachment_url: string;
  attachment_name: string;
  created_by: string;
  created_at: string;
}

export interface ValuationSnapshot {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  valuation_type: ValuationType;
  submission_id?: string;
  note: string;
  cancelled_by: string;
  cancelled_at: string;
  submitted_by: string;
  submitted_at: string | null;
  reviewed_by: string;
  reviewed_at: string | null;
  land_valuation: Partial<LandValuation> | Record<string, never>;
  assets: Array<
    Partial<Asset> & {
      specs?: Array<Partial<AssetSpec>>;
      calculations?: Array<Partial<AssetCalculation>>;
    }
  >;
  compensations: Array<Partial<Compensation>>;
  total_amount: number;
  /**
   * Цуцлах үед хүчинтэй байсан ҮНЭЛГЭЭНИЙ ТАЙЛАН. Цуцлалтын дараа тайлан нь
   * нэгж талбарын хавсралтаас хасагддаг тул зөвхөн эндээс татагдана
   * (файл нь хадгалалтад хэвээр үлдэнэ). Хуучин snapshot-д хоосон байж болно.
   */
  report_url?: string;
  report_name?: string;
  /** Цуцлах үед хавсралтаас хасагдсан эх хүснэгт (Excel) — түүхээс татагдана. */
  source_url?: string;
  source_name?: string;
  /**
   * Цуцлах мөчид ЭНЭ үнэлгээнд хамаарч байсан файлуудын бүрэн жагсаалт
   * (Баталгаажсан тайлан, Тайлан, Үнэлгээний хүснэгт). Зөвхөн түүхийн
   * дэлгэрэнгүйд харагдана. Хуучин snapshot-д хоосон — тэр үед
   * report_url/source_url руу ухарна.
   */
  files?: ValuationSnapshotFile[];
}

/** Архивын нэг файлын холбоос. */
export interface ValuationSnapshotFile {
  label: string;
  name?: string;
  url?: string;
}

export const VALUATION_STATUS_LABELS: Record<ValuationStatus, string> = {
  draft: "Хүлээгдэж буй",
  submitted: "Илгээсэн",
  approved: "Баталгаажсан",
  returned: "Буцаагдсан",
  rejected: "Татгалзсан",
};

// Үнэлгээний урсгалын төрөл — дэд табын түлхүүрүүдтэй ижил (asset/independent/mika)
export type ValuationType = "asset" | "independent" | "mika";

export const VALUATION_TYPE_LABELS: Record<ValuationType, string> = {
  asset: "Үндсэн үнэлгээ",
  independent: "Хөндлөнгийн үнэлгээ",
  mika: "МИКА үнэлгээ",
};

/** Ажлын урсгалын шилжилтэд ЗААВАЛ байх хавсралтын төрөл. */
export interface WorkflowRequiredDocument {
  document_type_id: number;
  document_type_code: string;
  document_type_name: string;
}

/** Тухайн нэгж талбарт шаардлагатай хавсралт орсон эсэх (явц солих цонх). */
export interface ParcelStatusRequirement {
  document_type_id: number;
  document_type_code: string;
  document_type_name: string;
  present: boolean;
  /** Орсон (хамгийн сүүлийн) баримтын нэр, холбоос; байхгүй бол хоосон. */
  document_name: string;
  document_url: string;
}

export interface ParcelWorkflow {
  id: number;
  from_status_id: number | null;
  to_status_id: number;
  from_status_name: string;
  to_status_name: string;
  sort_order: number;
  /** Энэ шилжилтэд ЗААВАЛ байх хавсралт (хоосон = шаардлагагүй). */
  required_documents: WorkflowRequiredDocument[];
}

export interface AcquisitionWorkflow {
  id: number;
  from_status_id: number | null;
  to_status_id: number;
  from_status_name: string;
  to_status_name: string;
  sort_order: number;
}

export interface AcquisitionStatusItem {
  id: number;
  name: string;
}

/**
 * Чөлөөлөх хилээр ГУС-аас нэгж талбарын ДУГААР татаж бүртгэсний үр дүн
 * (POST /land-acquisitions/:id/parcels/by-acquisition).
 *
 * skipped — өөр чөлөөлөлтөд аль хэдийн бүртгэгдсэн тул алгасагдсан дугаарууд
 * (нэгж талбарын дугаар систем даяар давхардахгүй).
 */
export interface ParcelDiscoveryResult {
  total: number;
  created: number;
  existing: number;
  skipped: number;
  parcel_ids: string[];
}

export interface ParcelFull extends Parcel {
  acquisition_id: string;
  old_parcel_id?: string;
  valid_from?: string;
  valid_till?: string;
  // ГУС-аас татагддаг ч урьд нь дэлгэцэд гардаггүй байсан талбарууд
  landuse_name?: string;
  address_khashaa?: string;
  address_streetname?: string;
  property_no?: string;
  /** Бүх эзэмшигч (үндсэн + хамтран). detail.holder_* нь зөвхөн үндсэнийг заана. */
  holders?: ParcelHolder[];
  /** ГУС-аас татагдсан барьцаа. source_parent_id утгатай нь ДАВХАР барьцаа */
  mortgages?: ParcelMortgage[];
  /** Шүүхийн шийдвэрүүд */
  court_decisions?: ParcelCourtDecision[];
  /** Газрын төлбөрийн нэхэмжлэлүүд */
  invoices?: ParcelInvoice[];
  /** Газрын төлбөрийн бодолт бүсээр. Нийт төлбөр = payment-ийн нийлбэр */
  fees?: ParcelFeeItem[];
  /** Суурь үнийн үнэлгээний хүчин зүйлүүд */
  base_price_factors?: ParcelBasePriceFactor[];
  /** Хянан баталгааны мэдээлэл */
  monitorings?: ParcelMonitoring[];
  /** УБЕГ-ийн газар өмчлөлийн бүртгэл (ХУР/XYP гарцаас татагдсан) */
  ownerships?: ParcelOwnership[];
  /**
   * БАЙРШЛААР давхцаж байгаа бусад нэгж талбарууд. Хоосон биш бол дэлгэрэнгүй
   * дээр УЛААНААР анхааруулна — давхардал арилтал чөлөөлөлт "Хээрийн судалгаа"
   * төлөв рүү шилжихгүй.
   */
  overlaps?: ParcelOverlap[];
  /**
   * ТӨСӨӨЛЛИЙН үнэлгээ (₮) — мэргэжилтэн/админ ГААРАС оруулна. Албан ёсны
   * үнэлгээ (land_valuation, assets) хийгдэхээс өмнөх урьдчилсан тооцоо.
   * null = оруулаагүй (0-ээс ЯЛГААТАЙ). Мэргэжлийн байгууллагад зөвхөн
   * ХАРАГДАНА.
   */
  estimated_value?: number | null;
  estimated_confidence_percent?: number | null;
  estimated_base_fee_per_m2?: number | null;
  estimated_value_at?: string;
  estimated_value_by?: string;
  geometry_wkt: string;
  acquisition_geom_wkt: string;
  status_id: number;
  status_name: string;
  selected_valuation_type?: ValuationType | null;
  created_at: string;
  created_by: string;
  detail?: ParcelDetail;
  // computed parcel meta
  remaining_area_m2?: number;
  db_changed: string;
  changed_parcel_id: string;
  // Independent org assigned to this parcel for independent valuation (Хөндлөнгийн үнэлгээ)
  independent_org_id?: string;
  independent_org_name?: string;
}

// Чөлөөлөлтийн (acquisition) статусын ID-ууд.
// Role тогтмолуудыг lib/access-policy.ts (ACCESS_ROLE_CODES / ACCESS_ROLE_NAMES)-д
// төвлөрүүлсэн тул энд давхардуулахгүй — тэндээс import хийж ашиглана.
export const ACQ_STATUS = {
  NEW: 1, // Шинэ — нэгж талбарын БҮРДЭЛ хийгдэж буй шат (явц/үнэлгээ бичихгүй)
  FIELD_SURVEY: 2, // Хээрийн судалгаа — санхүүгийн мэргэжилтэнд зөвхөн энэ төлөвтэй чөлөөлөлт харагдана
  CONFIRMED: 3, // Баталгаажсан — цаашид засвар/устгал хийх боломжгүй (locked)
} as const;

export interface ParcelDetail {
  right_type: number;
  holder_last_name: string;
  holder_name: string;
  holder_register_no: string;
  holder_phone: string;
  holder_email: string;
  holder_type: string;
  holder_civil_id: string;
  app_no: string;
  // Өргөдлийн дэлгэрэнгүй — ГУС-аас татагддаг ч урьд нь дэлгэцэд гардаггүй байсан
  app_timestamp?: string;
  app_type?: string;
  app_status?: string;
  decision_no: string;
  decision_date?: string;
  contract_no: string;
  contract_date?: string;
  contract_begin?: string;
  contract_end?: string;
  contract_property_no?: string;
  contract_status?: string;
  certificate_no: string;
  certificate_date?: string;
  // Улсын бүртгэлийн мэдээлэл
  record_no?: string;
  record_date?: string;
  record_certificate_no?: string;
  record_status?: string;
  valuation_zone: string;
  base_price_per_ha?: number;
  auction_coeff?: number;
  auction_price?: number;
}

/**
 * Нэгж талбарын эзэмшигч — нэг хүсэлт (app_no) дээр олон хүн байж болно.
 * main_applicant нь үндсэн өргөдөл гаргагчийг заана; эх системд нэгээс олон
 * үндсэн өргөдөл гаргагч ирэх тохиолдол БАЙНА.
 */
export interface ParcelHolder {
  id: string;
  main_applicant: boolean;
  last_name: string;
  name: string;
  register_no: string;
  phone: string;
  email: string;
  /** Жишээ нь "3: Монгол улсын хуулийн этгээд" — хуулийн этгээд үед last_name хоосон */
  person_type: string;
  app_no: string;
  /** holder = ГУС-аас татагдсан, representative = гараар бүртгэсэн итгэмжлэгдсэн төлөөлөгч */
  holder_role: ParcelHolderRole;
  /** Нөхөн төлбөр хүлээн авах эзэмшигч — нэгж талбарт зөвхөн НЭГ мөр true */
  payment_recipient: boolean;
  note?: string;
  address?: string;
}

export type ParcelHolderRole = "holder" | "representative";

/** Итгэмжлэгдсэн төлөөлөгч бүртгэх маягтын утга (backend first_name = right_holder.name) */
export interface RepresentativeInput {
  last_name: string;
  first_name: string;
  register_no: string;
  phone: string;
  email: string;
  address: string;
  note: string;
}

export interface GlobalParcel extends CompensationPaymentInfo {
  id: string;
  parcel_id: string;
  au1_code: string;
  au2_code: string;
  au3_code: string;
  right_type: number;
  landuse: string;
  area_m2: number;
  acquisition_area_m2: number;
  compensation_paid: boolean;
  status: number;
  status_id: number;
  status_name: string;
  acquisition_id: string;
  acquisition_name: string;
  plan_code: string;
  acquisition_status: number;
  start_date?: string;
  end_date?: string;
  cash_amount: number;
  land_grant_amount: number;
  land_grant_count: number;
  /** Идэвхтэй захирамжийн холбоос — холбоогүй бол ирэхгүй. */
  linked_decision_id?: string;
  /** Захирамжийн дугаар (эсвэл саналын хуудасны дугаар). */
  linked_decision_no?: string;
  linked_decision_status?: number;
}

export interface ReportParcelRow {
  parcel_id: string;
  area_m2: number;
  acquisition_area_m2: number;
  remaining_area_m2: number;
  right_type: number;
  db_changed: string;
  changed_parcel_id: string;
  /** Аймаг/хот, сум/дүүрэг, баг/хорооны нэр, гудамж, хашаа (", "-ээр залгасан). */
  address: string;
  status: number;
  status_name: string;
  status_date?: string;
  acquisition_id: string;
  acquisition_name: string;
  plan_code: string;
  general_category_name: string;
  sub_category_name: string;
  decree_number: string;
  decree_date?: string;
  holder_last_name: string;
  holder_name: string;
  holder_register_no: string;
  land_comp: number;
  real_state_comp: number;
  property_comp: number;
  total_comp: number;
}

export interface ReportStatusStat {
  status: number;
  status_name: string;
  count: number;
}

export interface ReportYearStat {
  year: number;
  count: number;
}

// ReportSummary — тайлангийн жагсаалтын дээд хэсгийн статистикийн карт (бүх
// хуудаслагдсан үр дүнгээр, backend дээр нэг л дуудлагаар тооцоологдоно).
export interface ReportSummary {
  acquisition_count: number;
  parcel_count: number;
  total_area_m2: number;
  total_parcel_area_m2: number;
  total_compensation: number;
  land_compensation: number;
  real_state_compensation: number;
  property_compensation: number;
  other_compensation: number;
  status_breakdown: ReportStatusStat[];
  year_breakdown: ReportYearStat[];
}

export interface Asset {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  asset_number: string;
  asset_type: "real_state" | "property";
  valuation_type: ValuationType;
  asset_name: string;
  floor_count: number;
  area_m2: number;
  owner_name: string;
  address: string;
  notes: string;
  unit: string;
  capacity: string;
  description: string;
  unit_price: number;
  photo_pdf_url?: string;
  photo_pdf_name?: string;
  created_at: string;
  updated_at: string;
}

// Газрын үнэлгээ upsert хийх body — Excel импортын нэмэлт талбарууд заавал биш.
export interface LandValuationUpsert {
  parcel_id: string;
  valuation_type?: ValuationType;
  land_area_m2: number;
  base_price_per_m2: number;
  ownership_cert_no?: string;
  appraiser_org_name?: string;
  appraiser_reg_no?: string;
  appraiser_state_reg_no?: string;
  appraiser_director?: string;
  appraiser_license?: string;
  appraiser_address?: string;
  appraiser_contact?: string;
  source_file_name?: string;
  source_file_hash?: string;
}

// Үнэлгээний хүснэгт (3.1–5.1) бүрийн ТАЙЛБАР.
// section_key нь src/lib/valuation-import-ийн ValuationSectionKey-тэй ижил утгатай.
export interface ValuationSectionNote {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  valuation_type: ValuationType;
  section_key: string;
  note: string;
  // Excel дэх хүснэгтийн таних мэдээлэл — дэлгэц дугаар/нэр/дарааллыг үүнээс авна
  section_no?: string; // "3.3"
  table_label?: string; // "Хүснэгт-3"
  title?: string; // "Газрын үнэлгээ"
  sort_order?: number;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

// Тайлбар хадгалах body — мапад ОРООГҮЙ хэсгийн тайлбар хэвээр үлдэнэ,
// хоосон бичвэр нь тухайн хэсгийн тайлбарыг устгана.
export interface ValuationNotesPayload {
  parcel_id: string;
  valuation_type?: ValuationType;
  notes: Record<string, string>;
}

// Excel-ээс бүхэл үнэлгээг нэг хүсэлтээр (нэг транзакц) оруулах payload.
export interface ValuationImportAssetPayload {
  asset_number?: string;
  asset_type: "real_state" | "property";
  asset_name: string;
  area_m2: number;
  floor_count?: number; // "Давхрын тоо" үзүүлэлтээс
  unit?: string;
  capacity?: string;
  description?: string;
  owner_name?: string;
  notes?: string;
  unit_price?: number;
  compensation_amount?: number; // >0 бол cash нөхөн олговор үүснэ
  specs?: { spec_type_id: number; value: string }[];
  // calc_type_id байвал шууд, байхгүй бол name-ээр backend төрлийг олж/үүсгэнэ. group — бүлгийн нэр.
  calculations?: {
    calc_type_id?: number;
    name?: string;
    group?: string;
    unit: string;
    value: number;
  }[];
}

export interface ValuationImportPayload {
  parcel_id: string;
  valuation_type?: ValuationType;
  replace: boolean; // true бол хуучин хөрөнгө/олговрыг эхлээд устгана
  land: {
    land_area_m2: number;
    base_price_per_m2: number;
    ownership_cert_no?: string;
    appraiser_org_name?: string;
    appraiser_reg_no?: string;
    appraiser_state_reg_no?: string;
    appraiser_director?: string;
    appraiser_license?: string;
    appraiser_address?: string;
    appraiser_contact?: string;
    source_file_name?: string;
    source_file_hash?: string;
  };
  assets: ValuationImportAssetPayload[];
  // Excel-ийн "ТАЙЛБАР:" мөрүүд (section_key → бичвэр)
  section_notes?: Record<string, string>;
  // Хүснэгт бүрийн тайлбар + дугаар/нэр/дараалал (Excel-ийнхээр харуулахад)
  sections?: {
    key: string;
    note: string;
    section_no: string;
    table_label: string;
    title: string;
    sort_order: number;
  }[];
}

export interface ValuationImportResult {
  deleted_assets: number;
  deleted_comps: number;
  created_assets: number;
  created_comps: number;
}

export interface AssetSpec {
  id: string;
  asset_id: string;
  spec_type_id: number;
  spec_code: string;
  spec_name: string;
  value: string;
}

export interface AssetCalculation {
  id: string;
  asset_id: string;
  calc_type_id: number;
  calc_code: string;
  calc_name: string;
  calc_group?: string;
  unit: string;
  value: number;
}

export interface AssetSpecType {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

export interface AssetCalcType {
  id: number;
  code: string;
  name: string;
  default_unit: string;
  sort_order: number;
  grp?: string;
}

export interface LandValuation {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  valuation_type?: ValuationType;
  land_area_m2: number;
  base_price_per_m2: number;
  total_value: number;
  ownership_cert_no?: string;
  appraiser_org_name?: string;
  appraiser_reg_no?: string;
  appraiser_state_reg_no?: string;
  appraiser_director?: string;
  appraiser_license?: string;
  appraiser_address?: string;
  appraiser_contact?: string;
  source_file_name?: string;
  source_file_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface CompensationGrant {
  id: string;
  acquisition_id: string;
  compensation_id: string;
  amount: number;
  grant_date?: string;
  note?: string;
  land_area_m2: number;
  land_price: number;
  land_location: string;
  land_purpose: string;
  land_use_type: string;
  parcel_number: string;
  decree_number: string;
  created_at: string;
  updated_at: string;
}

export interface Compensation {
  id: string;
  acquisition_id: string;
  target_type: "parcel" | "asset";
  valuation_type?: ValuationType;
  parcel_id: string;
  asset_id?: string;
  compensation_type: "cash" | "land_grant";
  coverage_percent: number;
  amount: number;
  compensation_date?: string;
  note?: string;
  grant?: CompensationGrant;
  status: "pending" | "approved" | "rejected";
  review_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  valuation_report_url?: string;
  valuation_report_name?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
}

export interface GlobalCompensation extends Compensation {
  acquisition_name: string;
  holder_name: string;
  holder_last_name: string;
  holder_register_no: string;
  holder_phone: string;
}

export interface CompensationHistory {
  id: string;
  compensation_id: string;
  compensation_type: "cash" | "land_grant";
  coverage_percent: number;
  amount: number;
  compensation_date?: string;
  note?: string;
  status: string;
  review_note?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  archived_at: string;
}

export interface AuthorizedRepresentative {
  id: string;
  acquisition_id: string;
  parcel_id: string;
  last_name: string;
  first_name: string;
  register_no: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  created_at: string;
  created_by: string;
}

export interface ParcelPayment {
  id: string;
  parcel_id: string;
  amount: number;
  currency: string;
  paid_at?: string;
  note: string;
  created_at: string;
  created_by: string;
}

/** Санхүүгийн хяналтын самбар — нэгтгэлийн НЭГ мөр (он / дүүрэг / хороо). */
export interface FinanceBucket {
  key: string;
  name: string;
  amount: number;
  granted: number;
  pending: number;
  parcels: number;
  /** Мөрийн тоо — төлөв/төсвийн задаргаанд чөлөөлөлтийн тоо. */
  count: number;
}

/** Нэгж талбарын гүйцэтгэлийн НЭГ шат (тоо + мөнгөн дүн). */
export interface FinanceStage {
  count: number;
  amount: number;
}

export interface FinanceDashboardData {
  total_amount: number;
  granted_amount: number;
  pending_amount: number;
  total_parcels: number;
  by_year: FinanceBucket[];
  by_district: FinanceBucket[];
  by_khoroo: FinanceBucket[];
  /** Үнэлгээний бүтэц — чөлөөлөлтийн "Санхүүжилт" табтай ижил задаргаа. */
  land_amount: number;
  real_state_amount: number;
  property_amount: number;
  /** Нэгж талбарын гүйцэтгэлийн дөрвөн тасархай шат. */
  stage_granted: FinanceStage;
  stage_approved: FinanceStage;
  stage_submitted: FinanceStage;
  stage_pending: FinanceStage;
  funding_by_type: FinanceBucket[];
  funding_total: number;
  /** ЯВЖ БУЙ (баталгаажаагүй) чөлөөлөлтүүд — дүнгээр буурахаар. */
  top_acquisitions: FinanceBucket[];
  total_acquisitions: number;
  /** Чөлөөлөлтийн төлөв ба захирамжийн төсвөөр задаргаа (картад). */
  acquisition_status: FinanceBucket[];
  acquisition_budgets: FinanceBucket[];
  /** Шүүлтүүрийн сонголтууд (дүүрэг бүрэн, хороо нь сонгосон дүүргээр). */
  district_options: FinanceOption[];
  khoroo_options: FinanceOption[];
  /** Шүүлтүүрт харуулах бүх он (шүүлтээс үл хамааран). */
  years: number[];
}

export interface FinanceOption {
  code: string;
  name: string;
}

export interface FinanceDashboardFilter {
  years?: number[];
  au2_code?: string;
  au3_code?: string;
  acquisition_id?: string;
}

export interface LandAcquisitionFilter {
  plan_code?: string;
  acquisition_name?: string;
  /** Нэгж талбарын дугаар — тухайн талбар багтсан чөлөөлөлтүүдийг олно. */
  parcel_id?: string;
  status?: number;
  /** Сум/дүүргийн код — чөлөөлөлтийн хилээр тодорхойлогдож
   *  land_acquisition_au-д хадгалагдсан утгаар шүүнэ. */
  au2_code?: string;
  au3_code?: string;
  general_category_id?: number;
  sub_category_id?: number;
  assigned_user_id?: string;
  years?: number[];
  /** Эрэмбэлэх багана (backend-ийн зөвшөөрөгдсөн түлхүүр) ба чиглэл. */
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

/** Шүүлтүүрийн сум/дүүргийн сонголт (GET /land-acquisitions/districts) */
export interface AU2Option {
  code: string;
  name: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

export const STATUS_LABELS: Record<number, string> = {
  1: "Шинэ",
  2: "Хээрийн судалгаа",
  3: "Баталгаажсан",
  4: "Цуцлагдсан",
};

export const STATUS_COLORS: Record<number, string> = {
  1: "bg-blue-100 text-blue-800",
  2: "bg-amber-100 text-amber-800",
  3: "bg-green-100 text-green-800",
  4: "bg-red-100 text-red-800",
};

// ── Мэдэгдэл ─────────────────────────────────────────
export interface AppNotification {
  id: string;
  recipient_id: string;
  actor_id?: string;
  actor_name: string;
  type: string;
  title: string;
  body: string;
  resource_type: "acquisition" | "parcel" | "compensation" | "";
  resource_id: string;
  acquisition_id?: string;
  parcel_id?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

// ── Захирамжийн төсөл ────────────────────────────────
export const DECISION_DRAFT_STATUS_DRAFT = 1;
export const DECISION_DRAFT_STATUS_CONFIRMED = 2;

export const DECISION_DRAFT_STATUS_LABELS: Record<number, string> = {
  [DECISION_DRAFT_STATUS_DRAFT]: "Төсөл",
  [DECISION_DRAFT_STATUS_CONFIRMED]: "Баталгаажсан",
};

// Жагсаалт/дэлгэрэнгүй дээрх төлөвийн badge — parcel-ийн STATUS_CFG-тэй адил
// өнгөний схем (улбар шар = хүлээгдэж буй, ногоон = дууссан).
export const DECISION_DRAFT_STATUS_STYLES: Record<
  number,
  { color: string; bg: string }
> = {
  [DECISION_DRAFT_STATUS_DRAFT]: { color: "#f59e0b", bg: "#f59e0b18" },
  [DECISION_DRAFT_STATUS_CONFIRMED]: { color: "#0acf97", bg: "#0acf9718" },
};

// Ажлын төрөл / Төсөв — Тохиргооноос удирдагдах сонголт (ижил бүтэцтэй)
export interface DecisionOption {
  id: number;
  code: string;
  name: string;
  sort_order: number;
}

/** Баталгаажсан захирамжийн хавсралт (захирамжийн эх баримт, «Захирамж» төрөл). */
export interface DecisionDraftDocument {
  id: string;
  name: string;
  file_type: string;
  file_url: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface DecisionDraft {
  id: string;
  proposal_no: string;
  decree_number: string;
  decision_date?: string;
  location: string;
  duration_year?: number;
  status: number;
  acquisition_id?: string;
  work_type_id?: number;
  budget_id?: number;
  current_progress_history_id?: string;
  confirmed_at?: string;
  confirmed_by: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  // JOIN-оос ирэх нэрс
  acquisition_name: string;
  plan_code: string;
  work_type_name: string;
  budget_name: string;
  parcel_count: number;
  parcel_area_m2: number;
  // Санхүүгийн эх үүсвэр — үүсгэсний ДАРАА олноор нэмнэ. Жагсаалтад тоо/нэрсийн
  // нийлбэр, дэлгэрэнгүйд бүтэн жагсаалт ирнэ.
  funding_source_count: number;
  funding_source_names: string;
  funding_local_amount: number;
  funding_international_amount: number;
  funding_source_amounts: Record<string, number>;
  funding_source_compensation_amounts: Record<string, number>;
  funding_source_parcel_counts: Record<string, number>;
  funding_source_parcel_areas: Record<string, number>;
  funding_sources?: DecisionDraftFundingLink[];
  /** Баталгаажуулахад хавсаргасан файл — зөвхөн дэлгэрэнгүйд ирнэ. */
  document?: DecisionDraftDocument;
  current_progress_type: string;
  current_progress_type_name: string;
  current_progress_recipient: string;
  current_progress_date?: string;
  current_progress_note: string;
}

// Захирамж ↔ санхүүгийн эх үүсвэрийн холбоос
export interface DecisionDraftFundingLink {
  id: string;
  decision_draft_id: string;
  funding_source_id: string;
  created_at: string;
  created_by: string;
  // funding_sources-оос JOIN-оор ирэх мэдээлэл
  acquisition_id: string;
  acquisition_name: string;
  organization_name: string;
  source_type: string;
  amount?: number;
  currency: string;
  note: string;
}

export const DECISION_DRAFT_PROGRESS_REVIEWING = "reviewing";
export const DECISION_DRAFT_PROGRESS_CONFIRMING = "confirming";

export const DECISION_DRAFT_PROGRESS_LABELS: Record<string, string> = {
  [DECISION_DRAFT_PROGRESS_REVIEWING]: "Хянагдаж буй",
  [DECISION_DRAFT_PROGRESS_CONFIRMING]: "Баталгаажуулах",
};

export interface DecisionDraftProgressHistory {
  id: string;
  decision_draft_id: string;
  progress_type: string;
  progress_type_name: string;
  /** «Хянагдаж буй газар»-ын нэр (хуучин бичлэгт чөлөөт текст). */
  recipient: string;
  /** Төсөл хянах нэгж (decision_review_unit); хуучин бичлэгт null. */
  review_unit_id?: number | null;
  progress_date: string;
  note: string;
  created_at: string;
  created_by: string;
}

// Захирамж ↔ нэгж талбарын холбоос. removed_at байвал хасагдсан (түүх).
export interface DecisionDraftParcel {
  id: string;
  decision_draft_id: string;
  parcel_uuid: string;
  linked_at: string;
  linked_by: string;
  removed_at?: string;
  removed_by: string;
  // Тухайн нэгж талбарыг санхүүжүүлэх эх үүсвэр (холбох үед сонгож, дараа нь солино)
  funding_link_id?: string;
  funding_source_id?: string;
  funding_organization?: string;
  funding_source_type?: string;
  // Нэгж талбарын мэдээлэл
  parcel_id: string;
  acquisition_id: string;
  acquisition_name: string;
  area_m2: number;
  acquisition_area_m2: number;
  compensation_amount: number;
  parcel_status: number;
  parcel_status_name: string;
  landuse: string;
  // Нэгж талбарын "Захирамж" таб дээр захирамжийн мэдээллийг хамт буцаана
  proposal_no?: string;
  decree_number?: string;
  decision_date?: string;
  decision_status?: number;
  work_type_name?: string;
  budget_name?: string;
  location?: string;
  duration_year?: number;
  current_progress_type?: string;
  current_progress_type_name?: string;
  current_progress_recipient?: string;
  current_progress_date?: string;
  current_progress_note?: string;
}

// Санхүүгийн эх үүсвэрийн сонголт (бүх чөлөөлөлтөөр)
export interface FundingSourceOption {
  id: string;
  acquisition_id: string;
  acquisition_name: string;
  plan_code: string;
  organization_name: string;
  source_type: string;
  amount?: number;
  currency: string;
}

// ── Буулгалтын мэдээлэл (land_release*, үндсэн нэгж талбараас тусдаа) ──
export const LAND_RELEASE_STATUS_PLANNING = 1;
export const LAND_RELEASE_STATUS_RELEASED = 2;
export const LAND_RELEASE_STATUS_CANCELLED = 3;

export const LAND_RELEASE_STATUS_LABELS: Record<number, string> = {
  1: "Төлөвлөж байгаа",
  2: "Захирамж гарч чөлөөлсөн",
  3: "Хүчингүй",
};

// Газрын зураг/график/шошгоны өнгө (dataviz validator — гэрэл, бараан хоёуланд PASS).
export const LAND_RELEASE_STATUS_COLORS: Record<number, string> = {
  1: "#d97706",
  2: "#0d9488",
  3: "#e11d48",
};

/** Системийн дугаар — «Б-00012». */
export function landReleaseNo(n: number): string {
  return `Б-${String(n).padStart(5, "0")}`;
}

/** Буулгасан байгууламжийн төрөл. */
export interface LandReleaseStructureType {
  id: number;
  name: string;
  created_at: string;
  created_by: string;
}

/** Газрын зураг — оруулсан зургуудыг нэгтгэсэн НЭГ PDF (зураг бүр нэг хуудас, JPEG). */
export interface LandReleasePhoto {
  id: string;
  file_name: string;
  file_url: string;
  size_bytes: number;
  page_count: number;
  created_at: string;
  created_by: string;
  /** Энэ зурагтай холбогдсон газрын тоо (олноор оруулсан бол > 1). */
  release_count: number;
}

export interface LandReleaseDecree {
  id: string;
  decree_number: string;
  decree_date?: string;
  file_name: string;
  file_type: string;
  file_url: string;
  size_bytes: number;
  created_at: string;
  created_by: string;
  release_count: number;
}

export interface LandReleaseHistory {
  id: string;
  from_status?: number;
  to_status: number;
  decree_number?: string;
  note: string;
  changed_at: string;
  changed_by: string;
}

export interface LandRelease {
  id: string;
  release_no: number;
  import_id?: string;
  name: string;
  description: string;
  status: number;
  status_name: string;
  /** Буулгасан байгууламжийн төрөл — өмнө оруулсанд байхгүй. */
  structure_type_id?: number;
  structure_type_name: string;
  /** Сум/дүүрэг, аймаг/хот — оруулахад байршлаар тодорхойлж хадгалсан (давхцаагүй бол хоосон). */
  au1_code: string;
  au1_name: string;
  au2_code: string;
  au2_name: string;
  area_m2: number;
  source_file: string;
  source_index: number;
  geometry_wkt?: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  decree?: LandReleaseDecree;
  photos?: LandReleasePhoto[];
  history?: LandReleaseHistory[];
}

export interface LandReleaseMapItem {
  id: string;
  release_no: number;
  name: string;
  status: number;
  geometry_wkt: string;
}

export interface LandReleaseStats {
  total: number;
  total_area_m2: number;
  decree_count: number;
  by_status: { status: number; count: number; area_m2: number }[];
  by_year: {
    year: number;
    planning: number;
    released: number;
    cancelled: number;
    area_m2: number;
    decrees: number;
  }[];
  /** Сум/дүүргээр — оруулахад хадгалсан сум/дүүргээр. */
  by_district: {
    /** Хоосон — ямар ч сум/дүүрэгтэй давхцаагүй. */
    code: string;
    name: string;
    au1_name: string;
    count: number;
    planning: number;
    released: number;
    cancelled: number;
    area_m2: number;
  }[];
  /** Сум/дүүрэг × он. */
  by_district_year: { code: string; year: number; count: number; area_m2: number }[];
  /** Газартай БҮХ сум/дүүрэг (шүүлтгүй, кодоор) — графикийн өнгийг тогтмол оноох. */
  districts: { code: string; name: string; au1_name: string }[];
  /** Бүх он (шүүлтгүй) — оны сонголтод. */
  years: number[];
}

export interface LandReleaseFeature {
  source_file: string;
  source_index: number;
  geometry_wkt: string;
  area_m2: number;
}

export interface LandReleaseFilter {
  search?: string;
  status?: number;
  year?: number;
  structure_type_id?: number;
  page?: number;
  page_size?: number;
}
