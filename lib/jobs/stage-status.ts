/** Canonical DB status values for JobStage.status */
export const STAGE_DB_STATUSES = [
  "todo",
  "in_progress",
  "pending_approval",
  "needs_changes",
  "done",
] as const;

export type StageDbStatus = (typeof STAGE_DB_STATUSES)[number];

/** Polish API / UI status keys (backward compatible + new) */
export type StagePlStatus =
  | "do_wykonania"
  | "w_realizacji"
  | "oczekuje_na_akceptacje"
  | "do_poprawy"
  | "zakonczony";

const DB_TO_PL: Record<StageDbStatus, StagePlStatus> = {
  todo: "do_wykonania",
  in_progress: "w_realizacji",
  pending_approval: "oczekuje_na_akceptacje",
  needs_changes: "do_poprawy",
  done: "zakonczony",
};

const PL_TO_DB: Record<StagePlStatus, StageDbStatus> = {
  do_wykonania: "todo",
  w_realizacji: "in_progress",
  oczekuje_na_akceptacje: "pending_approval",
  do_poprawy: "needs_changes",
  zakonczony: "done",
};

export const STAGE_STATUS_LABELS: Record<StagePlStatus, string> = {
  do_wykonania: "Do wykonania",
  w_realizacji: "W realizacji",
  oczekuje_na_akceptacje: "Oczekuje na akceptację",
  do_poprawy: "Do poprawy",
  zakonczony: "Zakończony",
};

/** Map legacy / unknown DB values to canonical status */
export function normalizeStageDbStatus(raw: string | null | undefined): StageDbStatus {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "done" || v === "zakonczony") return "done";
  if (v === "in_progress" || v === "w_realizacji") return "in_progress";
  if (v === "pending_approval" || v === "oczekuje_na_akceptacje") return "pending_approval";
  if (v === "needs_changes" || v === "do_poprawy") return "needs_changes";
  return "todo";
}

export function stageDbToPl(raw: string | null | undefined): StagePlStatus {
  return DB_TO_PL[normalizeStageDbStatus(raw)];
}

export function stagePlToDb(pl: StagePlStatus): StageDbStatus {
  return PL_TO_DB[pl];
}

export function isStageTerminalDone(pl: StagePlStatus): boolean {
  return pl === "zakonczony";
}

export function canSubmitStageForApproval(pl: StagePlStatus): boolean {
  return pl === "do_wykonania" || pl === "w_realizacji" || pl === "do_poprawy";
}

export function canApproveOrRejectStage(pl: StagePlStatus): boolean {
  return pl === "oczekuje_na_akceptacje";
}
