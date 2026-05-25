import type {
  AttendanceDashboardRow,
  AttendanceEmployeeRef,
  AttendanceStatus,
} from "@/lib/attendance/types";

function isoAt(hour: number, minute: number, date: Date): string {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * In-memory demo rows for UI preview (?demo=1). Not persisted; not added to gallery.
 */
export function buildDemoAttendanceRows(
  employees: AttendanceEmployeeRef[],
  sessionDate: Date
): AttendanceDashboardRow[] {
  const patterns: {
    status: AttendanceStatus;
    startH: number;
    startM: number;
    endH?: number;
    endM?: number;
    location: string;
    withPhotos: boolean;
  }[] = [
    { status: "working", startH: 7, startM: 15, location: "Warszawa, ul. Kopernika 6", withPhotos: true },
    { status: "break", startH: 8, startM: 0, location: "Łódź, ul. Piotrkowska 12", withPhotos: true },
    {
      status: "finished",
      startH: 6,
      startM: 30,
      endH: 14,
      endM: 54,
      location: "Kraków, ul. Dietla 4",
      withPhotos: true,
    },
    { status: "absent", startH: 0, startM: 0, location: "", withPhotos: false },
  ];

  return employees.map((emp, i) => {
    const p = patterns[i % patterns.length];
    const startedAt =
      p.status === "absent" ? null : isoAt(p.startH, p.startM, sessionDate);
    const endedAt =
      p.status === "finished" && p.endH != null
        ? isoAt(p.endH, p.endM ?? 0, sessionDate)
        : null;
    const breakStartedAt = p.status === "break" && startedAt ? isoAt(10, 30, sessionDate) : null;

    let workDurationMs: number | null = null;
    if (startedAt && p.status === "finished" && endedAt) {
      workDurationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    } else if (startedAt && p.status === "working") {
      workDurationMs = Date.now() - new Date(startedAt).getTime();
    } else if (startedAt && p.status === "break" && breakStartedAt) {
      workDurationMs =
        new Date(breakStartedAt).getTime() - new Date(startedAt).getTime();
    }

    const demoPhoto =
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=120&h=120&fit=crop";

    return {
      userId: emp.userId,
      displayName: emp.displayName,
      email: emp.email,
      status: p.status,
      startedAt,
      endedAt,
      workDurationMs,
      locationText: p.location || null,
      checkInPhoto: {
        url: p.withPhotos && p.status !== "absent" ? demoPhoto : null,
        expired: false,
      },
      checkOutPhoto: {
        url:
          p.status === "finished" && p.withPhotos
            ? "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=120&h=120&fit=crop"
            : null,
        expired: false,
      },
      sessionId: `demo-${emp.userId}`,
    };
  });
}
