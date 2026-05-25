import type { AttendancePhotoView } from "@/lib/attendance/types";

export function AttendancePhotoCell({
  photo,
  label,
}: {
  photo: AttendancePhotoView;
  label: string;
}) {
  if (photo.url) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={label}
          className="w-14 h-14 rounded-md border object-cover bg-gray-100"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      <div className="w-14 h-14 rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-[10px] text-gray-500 text-center px-1">
        {photo.expired ? "Wygasło" : "Brak"}
      </div>
    </div>
  );
}
