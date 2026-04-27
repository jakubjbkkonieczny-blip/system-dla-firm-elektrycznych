import "server-only";
import type { JobStage, JobStagePhoto } from "@prisma/client";

export type StageWithPhotos = JobStage & { photos: JobStagePhoto[] };

function yyyyMmDd(d: Date | null) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function jobStageToPl(s: StageWithPhotos) {
  return {
    id: s.id,
    nazwa_etapu: s.name,
    opis_etapu: s.description ?? "",
    planowana_data: yyyyMmDd(s.plannedDate),
    status: s.status === "done" ? "zakonczony" : "do_wykonania",
    data_zakonczenia: s.completedAt ? yyyyMmDd(s.completedAt) : null,
    zakonczone_przez: s.completedByUserId,
    notatka_pracownika: s.workerNote ?? "",
    lista_zdjec: s.photos.map((p) => p.objectKey),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
