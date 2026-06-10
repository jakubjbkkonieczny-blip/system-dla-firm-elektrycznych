import "server-only";
import type { JobStage } from "@prisma/client";
import {
  canApproveOrRejectStage,
  canSubmitStageForApproval,
  stageDbToPl,
  type StagePlStatus,
} from "@/lib/jobs/stage-status";
import { isUserAssignedToJob } from "@/lib/server/jobs/job-assignments";

export type StageMemberRole = "owner" | "admin" | "staff";

export type StageAccessContext = {
  role: StageMemberRole;
  userId: string;
  companyId: string;
  jobId: string;
  stage: Pick<
    JobStage,
    | "supervisorUserId"
    | "supervisorCanCreateStages"
    | "status"
  >;
  isAssignedToJob: boolean;
};

export function isOwnerOrAdmin(role: StageMemberRole): boolean {
  return role === "owner" || role === "admin";
}

export function isStageSupervisor(ctx: StageAccessContext): boolean {
  return !!ctx.stage.supervisorUserId && ctx.stage.supervisorUserId === ctx.userId;
}

export function stagePlStatus(ctx: StageAccessContext): StagePlStatus {
  return stageDbToPl(ctx.stage.status);
}

export function canEditStageMeta(ctx: StageAccessContext): boolean {
  return isOwnerOrAdmin(ctx.role);
}

export function canDeleteStage(ctx: StageAccessContext): boolean {
  return isOwnerOrAdmin(ctx.role);
}

export function canAssignStageSupervisor(ctx: StageAccessContext): boolean {
  return isOwnerOrAdmin(ctx.role);
}

export function canCreateJobStage(ctx: StageAccessContext): boolean {
  if (isOwnerOrAdmin(ctx.role)) return true;
  if (!ctx.isAssignedToJob || !isStageSupervisor(ctx)) return false;
  return ctx.stage.supervisorCanCreateStages;
}

export function canEditStageNote(ctx: StageAccessContext): boolean {
  if (isOwnerOrAdmin(ctx.role)) return true;
  return ctx.isAssignedToJob && isStageSupervisor(ctx);
}

export function canAddStagePhotos(ctx: StageAccessContext): boolean {
  return canEditStageNote(ctx);
}

export function canSubmitStage(ctx: StageAccessContext): boolean {
  if (!canSubmitStageForApproval(stagePlStatus(ctx))) return false;
  if (isOwnerOrAdmin(ctx.role)) return true;
  return ctx.isAssignedToJob && isStageSupervisor(ctx);
}

export function canApproveStage(ctx: StageAccessContext): boolean {
  return isOwnerOrAdmin(ctx.role) && canApproveOrRejectStage(stagePlStatus(ctx));
}

export function canRejectStage(ctx: StageAccessContext): boolean {
  return canApproveStage(ctx);
}

export function canReopenStage(ctx: StageAccessContext): boolean {
  const pl = stagePlStatus(ctx);
  if (pl !== "zakonczony" && pl !== "oczekuje_na_akceptacje") return false;
  if (isOwnerOrAdmin(ctx.role)) return true;
  return ctx.isAssignedToJob && isStageSupervisor(ctx) && pl === "oczekuje_na_akceptacje";
}

export async function buildStageAccessContext(params: {
  role: StageMemberRole;
  userId: string;
  companyId: string;
  jobId: string;
  stage: Pick<JobStage, "supervisorUserId" | "supervisorCanCreateStages" | "status">;
}): Promise<StageAccessContext> {
  const isAssignedToJob = isOwnerOrAdmin(params.role)
    ? true
    : await isUserAssignedToJob(params.jobId, params.userId, params.companyId);

  return {
    ...params,
    isAssignedToJob,
  };
}
