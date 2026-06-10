import "server-only";
import type { Prisma } from "@prisma/client";
import { stageDbToPl } from "@/lib/jobs/stage-status";

const userBriefSelect = {
  select: { id: true, displayName: true, email: true },
} as const;

export const jobStageListInclude = {
  photos: true,
  completedBy: userBriefSelect,
  supervisor: userBriefSelect,
  submittedBy: userBriefSelect,
  approvedBy: userBriefSelect,
  rejectedBy: userBriefSelect,
  supervisorAssignedBy: userBriefSelect,
} as const satisfies Prisma.JobStageInclude;

export type StageWithPhotos = Prisma.JobStageGetPayload<{
  include: typeof jobStageListInclude;
}>;

export type StageUserAudit = {
  uid: string;
  displayName: string;
  email: string | null;
};

function serializeStageUser(
  userId: string | null,
  user: { id: string; displayName: string | null; email: string } | null
): StageUserAudit | null {
  if (!userId) return null;
  if (!user) return { uid: userId, displayName: "Usunięty użytkownik", email: null };

  const name = (user.displayName ?? "").trim();
  const email = (user.email ?? "").trim() || null;
  if (name) return { uid: user.id, displayName: name, email };
  if (email) return { uid: user.id, displayName: email, email };
  return { uid: user.id, displayName: "Nieznany użytkownik", email: null };
}

/** @deprecated use serializeStageUser */
export function serializeStageCompletedBy(
  completedByUserId: string | null,
  user: { id: string; displayName: string | null; email: string } | null
) {
  const v = serializeStageUser(completedByUserId, user);
  if (!v) return null;
  return { displayName: v.displayName, email: v.email };
}

function yyyyMmDd(d: Date | null) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function jobStageToPl(s: StageWithPhotos) {
  const status = stageDbToPl(s.status);
  return {
    id: s.id,
    nazwa_etapu: s.name,
    opis_etapu: s.description ?? "",
    planowana_data: yyyyMmDd(s.plannedDate),
    status,
    data_zakonczenia: s.completedAt ? yyyyMmDd(s.completedAt) : null,
    zakonczone_przez: serializeStageUser(s.completedByUserId, s.completedBy),
    notatka_pracownika: s.workerNote ?? "",
    lista_zdjec: s.photos.map((p) => p.objectKey),
    kierownik_etapu: serializeStageUser(s.supervisorUserId, s.supervisor),
    kierownik_moze_tworzyc_etapy: s.supervisorCanCreateStages,
    kierownik_przypisany_przez: serializeStageUser(
      s.supervisorAssignedByUserId,
      s.supervisorAssignedBy
    ),
    kierownik_przypisany_at: s.supervisorAssignedAt?.toISOString() ?? null,
    zgloszono_do_akceptacji_przez: serializeStageUser(s.submittedByUserId, s.submittedBy),
    zgloszono_do_akceptacji_at: s.submittedForApprovalAt?.toISOString() ?? null,
    zaakceptowano_przez: serializeStageUser(s.approvedByUserId, s.approvedBy),
    zaakceptowano_at: s.approvedAt?.toISOString() ?? null,
    odrzucono_przez: serializeStageUser(s.rejectedByUserId, s.rejectedBy),
    odrzucono_at: s.rejectedAt?.toISOString() ?? null,
    odrzucenie_komentarz: s.rejectionComment ?? "",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
