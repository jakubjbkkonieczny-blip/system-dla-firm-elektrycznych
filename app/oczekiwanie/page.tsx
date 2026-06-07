import { redirect } from "next/navigation";
import OczekiwanieClient from "@/components/OczekiwanieClient";
import { getUserFromSession } from "@/lib/server/auth/getUserFromSession";
import { getMyCompanies } from "@/lib/server/me/get-my-companies";

export default async function OczekiwaniePage() {
  const user = await getUserFromSession();
  if (!user) {
    redirect("/login");
  }

  try {
    const companies = await getMyCompanies();
    if (companies.length > 0) {
      redirect("/dashboard");
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message !== "MISSING_AUTH") {
      console.error("[oczekiwanie/page] getMyCompanies failed:", error);
    }
  }

  return (
    <OczekiwanieClient
      createdAt={user.createdAt.toISOString()}
      displayName={user.displayName}
    />
  );
}