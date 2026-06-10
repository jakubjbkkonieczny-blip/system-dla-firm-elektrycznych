import {
  canApproveOrRejectStage,
  canSubmitStageForApproval,
  type StagePlStatus,
} from "@/lib/jobs/stage-status";
import type { JobStageCardPermissions } from "@/components/jobs/JobStageCard";

type Role = "owner" | "admin" | "staff";

export function computeStagePermissions(params: {
  role: Role;
  userId: string;
  isAssignedToJob: boolean;
  stageStatus: StagePlStatus;
  supervisorUid: string | null;
  supervisorCanCreateStages: boolean;
}): JobStageCardPermissions {
  const isOwnerOrAdmin = params.role === "owner" || params.role === "admin";
  const isSupervisor = !!params.supervisorUid && params.supervisorUid === params.userId;

  const canEditMeta = isOwnerOrAdmin;
  const canDelete = isOwnerOrAdmin;
  const canAssignSupervisor = isOwnerOrAdmin;
  const canEditNote = isOwnerOrAdmin || (params.isAssignedToJob && isSupervisor);
  const canSubmit =
    canSubmitStageForApproval(params.stageStatus) &&
    (isOwnerOrAdmin || (params.isAssignedToJob && isSupervisor));
  const canApprove =
    isOwnerOrAdmin && canApproveOrRejectStage(params.stageStatus);
  const canReject = canApprove;
  const canReopen =
    (params.stageStatus === "zakonczony" && isOwnerOrAdmin) ||
    (params.stageStatus === "oczekuje_na_akceptacje" &&
      (isOwnerOrAdmin || (params.isAssignedToJob && isSupervisor)));

  return {
    canEditMeta,
    canDelete,
    canAssignSupervisor,
    canEditNote,
    canSubmit,
    canApprove,
    canReject,
    canReopen,
  };
}

export function canCreateJobStageClient(params: {
  role: Role;
  userId: string;
  isAssignedToJob: boolean;
  stages: Array<{ kierownik_etapu?: { uid: string } | null; kierownik_moze_tworzyc_etapy?: boolean }>;
}): boolean {
  if (params.role === "owner" || params.role === "admin") return true;
  if (!params.isAssignedToJob) return false;
  return params.stages.some(
    (s) =>
      s.kierownik_etapu?.uid === params.userId && Boolean(s.kierownik_moze_tworzyc_etapy)
  );
}
