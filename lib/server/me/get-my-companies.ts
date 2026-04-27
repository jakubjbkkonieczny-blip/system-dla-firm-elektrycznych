import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";

export type MyCompany = {
  id: string;
  name: string;
};

export async function getMyCompanies(): Promise<MyCompany[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser?.uid) {
    throw new Error("MISSING_AUTH");
  }

  const uid = currentUser.uid;
  const idxSnap = await adminDb.collection("user_index").doc(uid).get();
  const companyIds: string[] =
    (idxSnap.exists && (idxSnap.data()?.companyIds as string[] | undefined)) || [];

  if (companyIds.length === 0) {
    return [];
  }

  const refs = companyIds.map((id) => adminDb.collection("companies").doc(id));
  const snaps = await adminDb.getAll(...refs);

  return snaps
    .filter((s: any) => s.exists)
.map((s: any) => ({ id: s.id, ...(s.data() as Record<string, unknown>) }))
    .filter((c: any) => !c.deletedAt)
    .map((c: any) => ({ id: String(c.id), name: String(c.name ?? "(no name)") }));
}
