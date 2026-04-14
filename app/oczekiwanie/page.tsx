import { redirect } from "next/navigation";
import { getMyCompanies } from "@/lib/server/me/get-my-companies";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";
import OczekiwanieClient from "@/components/OczekiwanieClient";

export default async function OczekiwaniePage() {
  const user = await getCurrentUser();
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

  return <OczekiwanieClient />;
}