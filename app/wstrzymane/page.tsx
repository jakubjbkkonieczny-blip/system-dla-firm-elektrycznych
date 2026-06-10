import { redirect } from "next/navigation";
import WorkerSuspendedClient from "@/components/WorkerSuspendedClient";
import { getUserFromSession } from "@/lib/server/auth/getUserFromSession";
import { getWorkerMembershipState } from "@/lib/server/me/get-worker-membership-state";

export default async function WstrzymanePage() {
  const user = await getUserFromSession();
  if (!user) {
    redirect("/login");
  }

  try {
    const state = await getWorkerMembershipState();
    if (state === "ACTIVE") {
      redirect("/dashboard");
    }
    if (state === "ORPHAN") {
      redirect("/oczekiwanie");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message !== "MISSING_AUTH") {
      console.error("[wstrzymane/page] getWorkerMembershipState failed:", error);
    }
  }

  return <WorkerSuspendedClient displayName={user.displayName} />;
}
