import { db } from "@/lib/firebase/admin";

export async function requireActiveMember(companyId: string, uid: string) {
  const ref = db.collection("companies").doc(companyId).collection("members").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) throw new Error("NOT_MEMBER");
  const data = snap.data() as any;
  if (!data?.active) throw new Error("NOT_ACTIVE_MEMBER");

  return data;
}