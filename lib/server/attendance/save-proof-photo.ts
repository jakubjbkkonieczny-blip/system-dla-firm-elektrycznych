import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { attendancePhotoExpiresAt } from "@/lib/server/attendance/photo-retention";

const MAX_BYTES = 200_000;

export async function saveOptionalProofPhoto(
  sessionId: string,
  dataUrlOrBase64: string
): Promise<{ url: string; expiresAt: Date } | null> {
  const raw = dataUrlOrBase64.trim();
  if (!raw) return null;

  let base64 = raw;
  let ext = "webp";
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(raw);
  if (match) {
    ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    base64 = match[2];
  }

  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    throw new Error("PHOTO_TOO_LARGE");
  }

  const dir = path.join(process.cwd(), "public", "attendance-proofs");
  await mkdir(dir, { recursive: true });
  const filename = `${sessionId}-${Date.now()}.${ext}`;
  await writeFile(path.join(dir, filename), buf);

  return {
    url: `/attendance-proofs/${filename}`,
    expiresAt: attendancePhotoExpiresAt(),
  };
}
