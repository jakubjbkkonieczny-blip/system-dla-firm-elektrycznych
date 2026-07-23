export const LEGACY_ACTIVE_COMPANY_ID_KEY = "activeCompanyId";
/** @deprecated Use scoped keys via scopedActiveCompanyKey(); kept for legacy detection. */
export const ACTIVE_COMPANY_ID_KEY = LEGACY_ACTIVE_COMPANY_ID_KEY;
export const ACTIVE_COMPANY_ID_CHANGE_EVENT = "activeCompanyIdChange";

export function scopedActiveCompanyKey(userId: string): string {
  return `activeCompanyId:${userId}`;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readScopedActiveCompanyId(
  storage: StorageLike,
  userId: string
): string {
  if (!userId) return "";
  return storage.getItem(scopedActiveCompanyKey(userId)) || "";
}

export function writeScopedActiveCompanyId(
  storage: StorageLike,
  userId: string,
  companyId: string
): void {
  if (!userId) return;
  const key = scopedActiveCompanyKey(userId);
  if (!companyId) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, companyId);
}

export function removeLegacyActiveCompanyId(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(LEGACY_ACTIVE_COMPANY_ID_KEY);
}

export type ResolveActiveCompanyInput = {
  userId: string;
  storedCompanyId: string;
  legacyGlobalCompanyId: string;
  accessibleCompanyIds: string[];
};

export type ResolveActiveCompanyResult = {
  activeCompanyId: string | null;
  persistCompanyId: string | null;
  discardLegacy: boolean;
};

/** Validates stored company against accessible companies; never assigns legacy global id. */
export function resolveActiveCompanyId(
  input: ResolveActiveCompanyInput
): ResolveActiveCompanyResult {
  const { userId, storedCompanyId, legacyGlobalCompanyId, accessibleCompanyIds } = input;
  const discardLegacy = legacyGlobalCompanyId.length > 0;

  if (!userId || accessibleCompanyIds.length === 0) {
    return { activeCompanyId: null, persistCompanyId: null, discardLegacy };
  }

  if (storedCompanyId && accessibleCompanyIds.includes(storedCompanyId)) {
    return {
      activeCompanyId: storedCompanyId,
      persistCompanyId: null,
      discardLegacy,
    };
  }

  if (accessibleCompanyIds.length === 1) {
    const only = accessibleCompanyIds[0]!;
    return {
      activeCompanyId: only,
      persistCompanyId: only,
      discardLegacy,
    };
  }

  return { activeCompanyId: null, persistCompanyId: null, discardLegacy };
}

export function clearActiveCompanySessionState(storage: StorageLike): void {
  removeLegacyActiveCompanyId(storage);
}
