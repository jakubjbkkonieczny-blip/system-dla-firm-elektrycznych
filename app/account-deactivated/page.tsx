import { redirect } from "next/navigation";

import { DeactivatedAccountClient } from "@/components/deactivation/DeactivatedAccountClient";
import { getDeactivatedAccountStateFromAccess } from "@/lib/server/deactivation/get-deactivated-account-state";

export default async function AccountDeactivatedPage() {
  const state = await getDeactivatedAccountStateFromAccess();
  if (!state) {
    redirect("/login");
  }

  return <DeactivatedAccountClient initialState={state} />;
}
