import "server-only";

/** Authenticated user derived from the signed session (Prisma-backed). */
export type AuthContextUser = {
  id: string;
  /** Same as `id`; legacy name for API compatibility. */
  uid: string;
  email: string;
  displayName: string | null;
};
