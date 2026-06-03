import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  getMemberDisplayName,
  getMemberRoleLabel,
} from "@/lib/company/member-labels";

const HISTORY_MAX_LIMIT = 50;
const HISTORY_DEFAULT_LIMIT = 20;

export function clampStageNoteHistoryLimit(raw: string | null | undefined): number {
  const n = Number(raw ?? String(HISTORY_DEFAULT_LIMIT));
  if (!Number.isFinite(n)) return HISTORY_DEFAULT_LIMIT;
  return Math.max(1, Math.min(HISTORY_MAX_LIMIT, Math.floor(n)));
}

function serializeEditor(
  user: {
    displayName: string | null;
    email: string;
    memberships: { role: string }[];
  } | null
) {
  if (!user) {
    return {
      displayName: "Usunięty użytkownik",
      email: null as string | null,
      roleLabel: null as string | null,
    };
  }

  const roleLabel = user.memberships[0]
    ? getMemberRoleLabel(user.memberships[0].role)
    : null;

  return {
    displayName: getMemberDisplayName(user),
    email: user.email,
    roleLabel,
  };
}

export async function updateStageWorkerNoteWithHistory(params: {
  companyId: string;
  jobId: string;
  stageId: string;
  userId: string;
  newNote: string;
}): Promise<{ changed: boolean }> {
  const stage = await prisma.jobStage.findFirst({
    where: {
      id: params.stageId,
      companyId: params.companyId,
      jobId: params.jobId,
    },
    select: { id: true, workerNote: true },
  });
  if (!stage) throw new Error("STAGE_NOT_FOUND");

  const previousNote = stage.workerNote ?? "";
  const newNote = params.newNote;
  if (previousNote === newNote) return { changed: false };

  await prisma.$transaction([
    prisma.jobStage.update({
      where: { id: params.stageId },
      data: { workerNote: newNote },
    }),
    prisma.jobStageNoteHistory.create({
      data: {
        companyId: params.companyId,
        jobId: params.jobId,
        stageId: params.stageId,
        editedByUserId: params.userId,
        previousNote,
        newNote,
      },
    }),
  ]);

  return { changed: true };
}

export async function getStageNoteHistory(params: {
  companyId: string;
  jobId: string;
  stageId: string;
  limit: number;
  cursor?: string;
}) {
  const stage = await prisma.jobStage.findFirst({
    where: {
      id: params.stageId,
      companyId: params.companyId,
      jobId: params.jobId,
    },
    select: { id: true, name: true },
  });
  if (!stage) throw new Error("STAGE_NOT_FOUND");

  const take = params.limit + 1;
  const rows = await prisma.jobStageNoteHistory.findMany({
    where: {
      companyId: params.companyId,
      jobId: params.jobId,
      stageId: params.stageId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    include: {
      editedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
          memberships: {
            where: { companyId: params.companyId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return {
    stageName: stage.name,
    items: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      previousNote: row.previousNote,
      newNote: row.newNote,
      editedBy: serializeEditor(row.editedBy),
    })),
    nextCursor,
    limit: params.limit,
  };
}
