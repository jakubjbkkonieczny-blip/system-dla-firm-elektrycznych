"use client";

export {
  ACTIVE_COMPANY_ID_CHANGE_EVENT,
  ACTIVE_COMPANY_ID_KEY,
  LEGACY_ACTIVE_COMPANY_ID_KEY,
} from "@/lib/activeCompanyStorage";

import { useActiveCompany } from "@/components/ActiveCompanyProvider";

export function useActiveCompanyId(): string {
  return useActiveCompany().activeCompanyId;
}
