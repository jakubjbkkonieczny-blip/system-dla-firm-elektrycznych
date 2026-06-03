import "server-only";
import type { JobStage, JobStagePhoto, Prisma } from "@prisma/client";

export const jobStageListInclude = {
  photos: true,
  completedBy: {
    select: { id: true, displayName: true, email: true },
  },
} as const satisfies Prisma.JobStageInclude;

export type StageWithPhotos = Prisma.JobStageGetPayload<{
  include: typeof jobStageListInclude;
}>;

export type StageCompletedByAudit = {
  displayName: string;
  email: string | null;
};

function yyyyMmDd(d: Date | null) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function serializeStageCompletedBy(
  completedByUserId: string | null,
  user: { displayName: string | null; email: string } | null
): StageCompletedByAudit | null {
  if (!completedByUserId) return null;

  if (!user) {
    return { displayName: "Usunięty użytkownik", email: null };
  }

  const name = (user.displayName ?? "").trim();
  const email = (user.email ?? "").trim() || null;

  if (name) return { displayName: name, email };
  if (email) return { displayName: email, email };
  return { displayName: "Nieznany użytkownik", email: null };
}

export function jobStageToPl(s: StageWithPhotos) {
  return {
    id: s.id,
    nazwa_etapu: s.name,
    opis_etapu: s.description ?? "",
    planowana_data: yyyyMmDd(s.plannedDate),
    status: s.status === "done" ? "zakonczony" : "do_wykonania",
    data_zakonczenia: s.completedAt ? yyyyMmDd(s.completedAt) : null,
    zakonczone_przez: serializeStageCompletedBy(
      s.completedByUserId,
      s.completedBy
    ),
    notatka_pracownika: s.workerNote ?? "",
    lista_zdjec: s.photos.map((p) => p.objectKey),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
