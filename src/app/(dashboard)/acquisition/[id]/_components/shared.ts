import { authStorage } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Acquisition статусын өнгөний тохиргоо (status id 1..4)
export const STATUS_CFG: Record<number, { color: string; bg: string }> = {
  1: { color: "#02c0ce", bg: "#02c0ce18" },
  2: { color: "#f59e0b", bg: "#f59e0b18" },
  3: { color: "#0acf97", bg: "#0acf9718" },
  4: { color: "#f1556c", bg: "#f1556c18" },
};

// NOTE: доорх хоёр функц access token-г naive задалдаг (base64url normalize-гүй).
// Одоогийн зан төлвийг хадгалахын тулд яг хэвээр нь энд төвлөрүүлэв. Ирээдүйд
// lib/role-utils.ts (normalize-тэй hasPermission/isSeniorSpecialist) руу нэгтгэж болно.
export function hasPermission(name: string): boolean {
  const token = authStorage.getAccessToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (
      Array.isArray(payload.permissions) && payload.permissions.includes(name)
    );
  } catch (err) {
    logger.warn("hasPermission token decode failed", { error: String(err) });
    return false;
  }
}

export function isSeniorSpecialist(): boolean {
  const token = authStorage.getAccessToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (
      Array.isArray(payload.roles) &&
      payload.roles.some((r: string) =>
        r === "admin" || r === "Админ" || r === "senior_specialist" || r === "Ахлах мэргэжилтэн" || r === "department_head"
      )
    );
  } catch (err) {
    logger.warn("isSeniorSpecialist token decode failed", { error: String(err) });
    return false;
  }
}
