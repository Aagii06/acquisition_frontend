export const EVALUATION_STATUS_NAME = "Үнэлгээ хийх";

export const ACCESS_ROLE_CODES = {
  ADMIN: "admin",
  PROFESSIONAL_ORG: "professional_org",
  MIKA: "mika",
  FINANCE_SPECIALIST: "finance_specialist",
  SENIOR_SPECIALIST: "senior_specialist",
} as const;

export const ACCESS_ROLE_NAMES = {
  PROFESSIONAL_ORG: "Мэргэжлийн байгууллага",
  PROFESSIONAL_ORG_SHORT: "Мэргэжлийн байгуулл...",
  MIKA: "МИКА",
  FINANCE_SPECIALIST: "Санхүүгийн мэргэжилтэн",
  FINANCE: "Санхүү",
  SENIOR_SPECIALIST: "Ахлах мэргэжилтэн",
} as const;

export type AccessRole = string;

export type AccessActor = {
  userId?: string | null;
  /**
   * JWT-ийн `org_id` claim — хэрэглэгчийн ХАРЬЯА байгууллага (ажилтны
   * бүртгэлээр тогтоогддог).
   *
   * Мэргэжлийн/хараат бус байгууллагын хандалт ҮҮГЭЭР шалгагдана: чөлөөлөлт
   * эсвэл нэгж талбарт оноогдсон байгууллагын аль ч ажилтан ажиллаж чадна.
   * Өмнө нь userId-тай шууд тулгадаг байсан тул нэг байгууллагад ганц
   * хэрэглэгч байж чаддаг байв.
   */
  orgId?: string | null;
  /** JWT-ийн `valuation_org` claim. Appdb ажилтан системийн role ашиглахгүй. */
  valuationOrg?: boolean | null;
  roles?: AccessRole[] | null;
  /** JWT-ийн `permissions` claim. Байхгүй бол эрх шалгалт бүр false. */
  permissions?: string[] | null;
};

export type AccessAcquisition = {
  professional_org_id?: string | null;
  assigned_users?: { user_id: string }[] | null;
};

export type AccessParcel = {
  status_name?: string | null;
  independent_org_id?: string | null;
  /**
   * Төлөв нь «Үнэлгээний шат» (parcel_status.is_valuation_stage) эсэх —
   * бүртгэлийн тохиргооноос. Өгөөгүй бол өмнөх шиг НЭРЭЭР ("Үнэлгээ хийх").
   */
  is_valuation_stage?: boolean | null;
};

function isValuationStage(parcel?: AccessParcel | null): boolean {
  if (parcel?.is_valuation_stage != null) return parcel.is_valuation_stage;
  return parcel?.status_name === EVALUATION_STATUS_NAME;
}

// Чөлөөлөлтийн дэлгэрэнгүйн табууд — acquisition/[id]/page.tsx-ийн Tab-тай ижил
export type AcquisitionTabKey =
  | "general"
  | "attachments"
  | "parcels"
  | "financing"
  | "progress"
  | "assignees"
  | "map"
  | "survey";

// Нэгж талбарын дэлгэрэнгүйн табууд — parcel/[id]/_components/constants Tab-тай ижил
export type ParcelTabKey =
  | "general"
  | "holder"
  | "progress"
  | "realEstate"
  | "documents"
  | "finance"
  | "decree"
  | "print"
  | "survey";

export type ValuationSubTabKey = "asset" | "independent" | "mika";

function roles(actor: AccessActor): AccessRole[] {
  return actor.roles ?? [];
}

export function hasAccessRole(
  actor: AccessActor,
  ...acceptedRoles: string[]
): boolean {
  return roles(actor).some((role) => acceptedRoles.includes(role));
}

export function isProfessionalOrgActor(actor: AccessActor): boolean {
  if (actor.valuationOrg) return true;
  return hasAccessRole(
    actor,
    ACCESS_ROLE_CODES.PROFESSIONAL_ORG,
    ACCESS_ROLE_NAMES.PROFESSIONAL_ORG,
    ACCESS_ROLE_NAMES.PROFESSIONAL_ORG_SHORT,
  );
}

export function isMikaActor(actor: AccessActor): boolean {
  return hasAccessRole(actor, ACCESS_ROLE_CODES.MIKA, ACCESS_ROLE_NAMES.MIKA);
}

export function isFinanceSpecialistActor(actor: AccessActor): boolean {
  return hasAccessRole(
    actor,
    ACCESS_ROLE_CODES.FINANCE_SPECIALIST,
    ACCESS_ROLE_NAMES.FINANCE_SPECIALIST,
    ACCESS_ROLE_NAMES.FINANCE,
  );
}

export function isSeniorSpecialistActor(actor: AccessActor): boolean {
  if (isAdminActor(actor)) return true;
  return hasAccessRole(
    actor,
    ACCESS_ROLE_CODES.SENIOR_SPECIALIST,
    ACCESS_ROLE_NAMES.SENIOR_SPECIALIST,
  );
}

export function isAdminActor(actor: AccessActor): boolean {
  return hasAccessRole(actor, ACCESS_ROLE_CODES.ADMIN, "Админ");
}

/**
 * Хуучин мэдээллийн импорт (`/legacy_import`). Системийн хүснэгтүүдэд
 * (чөлөөлөлт, нэгж талбар, нөхөх олговор) бөөнөөр бичдэг тул ЗӨВХӨН админ.
 * Server талд `/api/legacy-import` proxy нь ижил ролийг backend-ээр шалгана.
 */
export const LEGACY_IMPORT_ROLES = [ACCESS_ROLE_CODES.ADMIN, "Админ"];

export function canImportLegacyDataForActor(actor: AccessActor): boolean {
  return isAdminActor(actor);
}

export function canCancelValuationForActor(
  actor: AccessActor,
  acquisition: AccessAcquisition | null | undefined,
  valuationStatus: string,
  acquisitionLocked: boolean,
): boolean {
  if (!acquisition || acquisitionLocked || valuationStatus !== "approved") {
    return false;
  }
  if (isSeniorSpecialistActor(actor) || isFinanceSpecialistActor(actor)) {
    return true;
  }
  if (isProfessionalOrgActor(actor) || isMikaActor(actor)) return false;
  return (
    !!actor.userId &&
    (acquisition.assigned_users ?? []).some(
      (assignee) => assignee.user_id === actor.userId,
    )
  );
}

/**
 * Нэгж талбарын "Трас зураг" хэвлэх — хэвлэхэд «Трас зураг» хавсралтыг
 * ДАРЖ бичдэг тул зөвхөн АДМИН ба тухайн чөлөөлөлтийг ХАРИУЦСАН ажилтан
 * (assigned_users). Ахлах/санхүү/гадны байгууллага ч хэвлэхгүй.
 */
export function canPrintParcelTraceForActor(
  actor: AccessActor,
  acquisition: AccessAcquisition | null | undefined,
): boolean {
  if (isAdminActor(actor)) return true;
  return (
    !!actor.userId &&
    (acquisition?.assigned_users ?? []).some(
      (assignee) => assignee.user_id === actor.userId,
    )
  );
}

export function isExternalSpecialActor(actor: AccessActor): boolean {
  if (isAdminActor(actor) || isSeniorSpecialistActor(actor)) return false;
  return (
    isProfessionalOrgActor(actor) ||
    isMikaActor(actor) ||
    isFinanceSpecialistActor(actor)
  );
}

export function canAccessAcquisitionForActor(
  actor: AccessActor,
  acquisition?: AccessAcquisition | null,
  parcels?: AccessParcel[] | null,
): boolean {
  if (!isExternalSpecialActor(actor)) return true;
  if (isMikaActor(actor) || isFinanceSpecialistActor(actor)) return true;
  if (!isProfessionalOrgActor(actor) || !actor.orgId) return false;

  return (
    acquisition?.professional_org_id === actor.orgId ||
    (parcels ?? []).some((parcel) => parcel.independent_org_id === actor.orgId)
  );
}

export function canAccessParcelForActor(
  actor: AccessActor,
  parcel?: AccessParcel | null,
  acquisition?: AccessAcquisition | null,
): boolean {
  if (!isExternalSpecialActor(actor)) return true;
  if (isFinanceSpecialistActor(actor)) return true;
  if (!parcel || !isValuationStage(parcel)) return false;

  if (isProfessionalOrgActor(actor)) {
    if (!actor.orgId) return false;
    return (
      acquisition?.professional_org_id === actor.orgId ||
      parcel.independent_org_id === actor.orgId
    );
  }

  return isMikaActor(actor) || isFinanceSpecialistActor(actor);
}

export function canViewAcquisitionTabForActor(
  actor: AccessActor,
  tab: AcquisitionTabKey,
): boolean {
  // «Газрын судалгаа» — нэгж талбарын «Судалгаа» табтай ижил дүрэм.
  if (tab === "survey") {
    return !isExternalSpecialActor(actor) && actorHasPermission(actor, "land:read");
  }
  if (!isExternalSpecialActor(actor)) return true;
  // САНХҮҮГИЙН мэргэжилтэн — "Санхүүжилт" табыг нэмж харна: санхүүжилтийн
  // эх үүсвэр, захирамжийн төсөв, олговрын гүйцэтгэлийн үзүүлэлт нь түүний
  // үндсэн ажил (бусад гадаад роль хэвээр хаалттай).
  if (tab === "financing") return isFinanceSpecialistActor(actor);
  return tab === "general" || tab === "parcels";
}

export function canViewParcelTabForActor(
  actor: AccessActor,
  tab: ParcelTabKey,
): boolean {
  // "Захирамж" таб нь захирамжийн төслийн өгөгдлийг татдаг (decision:read)
  // — эрхгүй ажилтанд хоосон, 403-той таб харуулахгүй.
  if (tab === "decree") return canViewDecisionDraftsForActor(actor);
  // «Судалгаа» — backend нь land:read шаарддаг; гадаад ролиудад хаалттай.
  if (tab === "survey") {
    return !isExternalSpecialActor(actor) && actorHasPermission(actor, "land:read");
  }
  if (!isExternalSpecialActor(actor)) return true;
  // Мэргэжлийн байгууллага эзэмшигчийн мэдээллийг нэмж харна
  if (isProfessionalOrgActor(actor) && tab === "holder") return true;
  return tab === "general" || tab === "realEstate";
}

export function canViewValuationSubTabForActor(
  actor: AccessActor,
  subTab: ValuationSubTabKey,
  parcel?: AccessParcel | null,
  acquisition?: AccessAcquisition | null,
): boolean {
  if (!isExternalSpecialActor(actor)) return true;

  if (subTab === "mika") {
    return isMikaActor(actor) || isFinanceSpecialistActor(actor);
  }

  if (subTab === "independent") {
    // MIKA / санхүү — харах эрхтэй (хяналт шалгалт)
    if (isMikaActor(actor) || isFinanceSpecialistActor(actor)) return true;
    // Мэргэжлийн байгуулл... — зөвхөн тухайн парцелийн independent_org-оор томилогдсон бол
    if (isProfessionalOrgActor(actor)) {
      return (
        !!actor.orgId &&
        !!parcel?.independent_org_id &&
        parcel.independent_org_id === actor.orgId
      );
    }
    return false;
  }

  // "asset" — MIKA / санхүү эсвэл үндсэн мэргэжлийн байгуулга (professional_org_id) л харна
  if (isMikaActor(actor) || isFinanceSpecialistActor(actor)) return true;
  if (isProfessionalOrgActor(actor)) {
    if (!actor.orgId) return false;
    // Acquisition мэдээлэл байвал professional_org_id-тэй тулгана
    if (acquisition !== undefined && acquisition !== null) {
      return acquisition.professional_org_id === actor.orgId;
    }
    // Мэдээлэл байхгүй бол зөвшөөрнө (graceful fallback)
    return true;
  }
  return false;
}

export function canEditValuationSubTabForActor(
  actor: AccessActor,
  subTab: ValuationSubTabKey,
  parcel?: AccessParcel | null,
  acquisition?: AccessAcquisition | null,
): boolean {
  if (!parcel || !isValuationStage(parcel)) return false;

  if (subTab === "asset") {
    return (
      isProfessionalOrgActor(actor) &&
      !!actor.orgId &&
      acquisition?.professional_org_id === actor.orgId
    );
  }

  if (subTab === "independent") {
    return (
      isProfessionalOrgActor(actor) &&
      !!actor.orgId &&
      parcel.independent_org_id === actor.orgId
    );
  }

  return isMikaActor(actor);
}

// ── Хэрэглэгч / роль / эрхийн удирдлага ─────────────────────────────────────
// Эрхийн нэрс backend-ийн router.go-той нэг мөр байх ёстой. Frontend-ийн
// шалгалт нь ЗӨВХӨН UI-г цэвэрхэн болгох зорилготой — жинхэнэ хамгаалалт
// backend-ийн RequirePermission middleware дээр байна.
export const ADMIN_PERMISSIONS = {
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",
  PERMISSIONS_READ: "permissions:read",
} as const;

export const HR_PERMISSIONS = {
  HR_READ: "hr:read",
  HR_CREATE: "hr:create",
  HR_UPDATE: "hr:update",
  HR_DELETE: "hr:delete",
} as const;

export const SYSTEM10_PERMISSION_RESOURCES = [
  "land",
  "compensation",
  "decision",
] as const;

export const SYSTEM_SETTINGS_PERMISSIONS = {
  ADMIN_READ: "admin:read",
  ADMIN_CREATE: "admin:create",
  ADMIN_UPDATE: "admin:update",
  ADMIN_DELETE: "admin:delete",
} as const;

// Захирамжийн төсөл — тусдаа эрхийн бүлэг. Захирамжийн төсөлтэй ажиллах
// мэргэжилтэн ЗӨВХӨН эдгээрээр ажиллана; land:* эрх энд хүчинтэй БИШ
// (backend-ийн decision-drafts маршрутууд ч мөн decision:*-ийг шаардана).
export const DECISION_PERMISSIONS = {
  DECISION_READ: "decision:read",
  DECISION_CREATE: "decision:create",
  DECISION_UPDATE: "decision:update",
  DECISION_DELETE: "decision:delete",
} as const;

export function actorHasPermission(actor: AccessActor, name: string): boolean {
  return (actor.permissions ?? []).includes(name);
}

/**
 * Захирамжийн төслийн эрх. Гадаад ролиуд (мэрг. байгууллага, МИКА, санхүү)
 * зөвхөн нөхөх олговрын урсгалд ажилладаг тул эрх санамсаргүй олгогдсон ч
 * захирамжийн төсөлд хүрэхгүй.
 */
function canDoDecision(actor: AccessActor, permission: string): boolean {
  return (
    !isExternalSpecialActor(actor) && actorHasPermission(actor, permission)
  );
}

export function canViewDecisionDraftsForActor(actor: AccessActor): boolean {
  return canDoDecision(actor, DECISION_PERMISSIONS.DECISION_READ);
}

export function canCreateDecisionDraftForActor(actor: AccessActor): boolean {
  return canDoDecision(actor, DECISION_PERMISSIONS.DECISION_CREATE);
}

export function canUpdateDecisionDraftForActor(actor: AccessActor): boolean {
  return canDoDecision(actor, DECISION_PERMISSIONS.DECISION_UPDATE);
}

export function canDeleteDecisionDraftForActor(actor: AccessActor): boolean {
  return canDoDecision(actor, DECISION_PERMISSIONS.DECISION_DELETE);
}

/**
 * Гадаад ролиуд (мэрг. байгууллага, МИКА, санхүү) удирдлагын цэсэд хэзээ ч
 * хандахгүй — тэдэнд эрх санамсаргүй олгогдсон ч UI-д харагдахгүй.
 */
function canEnterAdminConsole(actor: AccessActor): boolean {
  return !isExternalSpecialActor(actor);
}

function canDo(actor: AccessActor, permission: string): boolean {
  return canEnterAdminConsole(actor) && actorHasPermission(actor, permission);
}

function canDoHr(actor: AccessActor, permission: string): boolean {
  return (
    canEnterAdminConsole(actor) &&
    isAdminActor(actor) &&
    actorHasPermission(actor, permission)
  );
}

export function canViewUsersPage(actor: AccessActor): boolean {
  return isAdminActor(actor) && canDo(actor, ADMIN_PERMISSIONS.USERS_READ);
}

export function canViewHrRegistry(actor: AccessActor): boolean {
  return canDoHr(actor, HR_PERMISSIONS.HR_READ);
}

export function canCreateHrRecord(actor: AccessActor): boolean {
  return canDoHr(actor, HR_PERMISSIONS.HR_CREATE);
}

export function canUpdateHrRecord(actor: AccessActor): boolean {
  return canDoHr(actor, HR_PERMISSIONS.HR_UPDATE);
}

export function canDeleteHrRecord(actor: AccessActor): boolean {
  return canDoHr(actor, HR_PERMISSIONS.HR_DELETE);
}

export function canCreateUser(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.USERS_CREATE);
}

export function canUpdateUser(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.USERS_UPDATE);
}

export function canDeleteUser(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.USERS_DELETE);
}

export function canViewRolesPage(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.ROLES_READ);
}

export function canCreateRole(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.ROLES_CREATE);
}

export function canUpdateRole(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.ROLES_UPDATE);
}

export function canDeleteRole(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.ROLES_DELETE);
}

/** Роль-д эрх нэмэх/хасах — roles:update эсвэл 10-р системийн admin. */
export function canManageRolePermissions(actor: AccessActor): boolean {
  return (
    canDo(actor, ADMIN_PERMISSIONS.ROLES_UPDATE) ||
    (canEnterAdminConsole(actor) && isAdminActor(actor))
  );
}

export function canViewPermissions(actor: AccessActor): boolean {
  return canDo(actor, ADMIN_PERMISSIONS.PERMISSIONS_READ);
}

export function canViewSystemSettings(actor: AccessActor): boolean {
  if (!canEnterAdminConsole(actor)) return false;
  if (isAdminActor(actor)) return true;
  return Object.values(SYSTEM_SETTINGS_PERMISSIONS).some((permission) =>
    actorHasPermission(actor, permission),
  );
}

function isSystem10PermissionName(name: string): boolean {
  const resource = name.includes(":")
    ? name.split(":", 1)[0]
    : name.includes(".")
      ? name.split(".", 1)[0]
      : "";
  return SYSTEM10_PERMISSION_RESOURCES.includes(
    resource as (typeof SYSTEM10_PERMISSION_RESOURCES)[number],
  );
}

/**
 * Эрх нэмэгдүүлэлтээс сэргийлэх (backend role.go/user.go-ийн
 * callerHasPermission-той ижил): дуудагч зөвхөн өөрт нь байгаа эрхийг л
 * бусдад олгож/хураана.
 */
export function canGrantPermissionForActor(
  actor: AccessActor,
  permissionName: string,
): boolean {
  if (isAdminActor(actor) && isSystem10PermissionName(permissionName)) {
    return true;
  }
  return actorHasPermission(actor, permissionName);
}

/**
 * Ролийг бүхэлд нь олгож/хураах боломжтой эсэх — ролийн эрх БҮГД дуудагчид
 * байх ёстой. 10-р системийн admin нь land/compensation/decision role-уудыг
 * олгож чадна.
 */
export function canGrantRoleForActor(
  actor: AccessActor,
  rolePermissionNames: string[] | null | undefined,
): boolean {
  const names = rolePermissionNames ?? [];
  if (
    names.length > 0 &&
    isAdminActor(actor) &&
    names.every(isSystem10PermissionName)
  ) {
    return true;
  }
  return names.every((name) => actorHasPermission(actor, name));
}

/**
 * Хэрэглэгчийн ролийг өөрчилж болох эсэх. Өөрийн ролийг өөрөө өөрчлөхийг
 * хориглоно — backend-тэй ижил (self-escalation / self-lockout).
 */
export function canManageUserRoles(
  actor: AccessActor,
  targetUserId: string | null | undefined,
): boolean {
  if (!canUpdateUser(actor)) return false;
  return !isSelfTarget(actor, targetUserId);
}

/** Өөрийгөө устгахыг хориглоно (backend Delete-ийн шалгалттай ижил). */
export function canDeleteUserRow(
  actor: AccessActor,
  targetUserId: string | null | undefined,
): boolean {
  if (!canDeleteUser(actor)) return false;
  return !isSelfTarget(actor, targetUserId);
}

/** Өөрийгөө идэвхгүй болгохыг хориглоно (backend Update-ийн шалгалттай ижил). */
export function canDeactivateUser(
  actor: AccessActor,
  targetUserId: string | null | undefined,
): boolean {
  if (!canUpdateUser(actor)) return false;
  return !isSelfTarget(actor, targetUserId);
}

function isSelfTarget(
  actor: AccessActor,
  targetUserId: string | null | undefined,
): boolean {
  return !!actor.userId && !!targetUserId && actor.userId === targetUserId;
}
