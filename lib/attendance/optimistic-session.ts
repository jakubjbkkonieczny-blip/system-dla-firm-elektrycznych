import type {
  AttendanceAction,
  AttendanceEmployeeState,
  AttendanceMeResponse,
} from "@/lib/attendance/types";

function availableFor(state: AttendanceEmployeeState): AttendanceMeResponse["availableActions"] {
  if (state === "not_started") return ["start_work"];
  if (state === "working") return ["start_break", "finish_work"];
  if (state === "on_break") return ["end_break"];
  return [];
}

/** Lightweight optimistic patch after an action (replaced by server response on success). */
export function applyOptimisticAttendanceAction(
  prev: AttendanceMeResponse | null,
  action: AttendanceAction
): AttendanceMeResponse {
  const now = new Date().toISOString();
  const base: AttendanceMeResponse = prev ?? {
    sessionDate: now.slice(0, 10),
    state: "not_started",
    startedAt: null,
    breakStartedAt: null,
    endedAt: null,
    totalBreakMinutes: 0,
    totalWorkedMinutes: null,
    locationText: null,
    sessionId: "optimistic",
    availableActions: ["start_work"],
  };

  if (action === "start_work") {
    return {
      ...base,
      state: "working",
      startedAt: now,
      availableActions: availableFor("working"),
    };
  }
  if (action === "start_break") {
    return {
      ...base,
      state: "on_break",
      breakStartedAt: now,
      availableActions: availableFor("on_break"),
    };
  }
  if (action === "end_break") {
    return {
      ...base,
      state: "working",
      breakStartedAt: null,
      totalBreakMinutes: base.totalBreakMinutes + 1,
      availableActions: availableFor("working"),
    };
  }
  return {
    ...base,
    state: "finished",
    endedAt: now,
    breakStartedAt: null,
    availableActions: [],
  };
}
