import "server-only";
import { prisma } from "@/lib/db/prisma";

export type StageHistoryEventType =
  | "supervisor_assigned"
  | "supervisor_cleared"
  | "submitted_for_approval"
  | "approved"
  | "rejected"
  | "reopened";

export async function recordStageHistory(params: {
  companyId: string;
  jobId: string;
  stageId: string;
  eventType: StageHistoryEventType;
  actorUserId: string;
  targetUserId?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.jobStageHistory.create({
    data: {
      companyId: params.companyId,
      jobId: params.jobId,
      stageId: params.stageId,
      eventType: params.eventType,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId ?? null,
      comment: params.comment?.trim() || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

export async function listStageHistory(params: {
  companyId: string;
  jobId: string;
  stageId: string;
  limit?: number;
}) {
  const rows = await prisma.jobStageHistory.findMany({
    where: {
      companyId: params.companyId,
      jobId: params.jobId,
      stageId: params.stageId,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(params.limit ?? 50, 100),
    include: {
      actor: { select: { id: true, displayName: true, email: true } },
      target: { select: { id: true, displayName: true, email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    comment: r.comment,
    metadata: r.metadata ? safeParseJson(r.metadata) : null,
    createdAt: r.createdAt.toISOString(),
    actor: userBrief(r.actor),
    target: r.target ? userBrief(r.target) : null,
  }));
}

function userBrief(u: { id: string; displayName: string | null; email: string }) {
  const name = (u.displayName ?? "").trim();
  const email = (u.email ?? "").trim();
  return {
    uid: u.id,
    displayName: name || email || "Nieznany użytkownik",
    email: email || null,
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
