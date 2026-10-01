import "server-only";

import type { PhotoStorage } from "@/lib/server/storage/photo-storage";
import { vercelPhotoStorage } from "@/lib/server/storage/vercel-photo-storage";

/** Composition point for the current private photo provider. */
export function getPhotoStorage(): PhotoStorage {
  return vercelPhotoStorage;
}
