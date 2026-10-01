export class JobPhotoClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobPhotoClientError";
  }
}

export function displayPhotoName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!base) return "zdjęcie";
  return base.length > 80 ? `${base.slice(0, 77)}...` : base;
}

export const PHOTO_BATCH_TOO_MANY = "Możesz dodać maksymalnie 10 zdjęć.";

export function photoTooLargeMessage(fileName: string): string {
  return `Zdjęcie „${displayPhotoName(fileName)}” jest zbyt duże.`;
}

export function photoFormatMessage(fileName: string): string {
  return `Nie udało się przetworzyć formatu zdjęcia „${displayPhotoName(fileName)}”. Wybierz JPEG, PNG lub inny obsługiwany obraz.`;
}

export function photoEncodeMessage(fileName: string): string {
  return `Nie udało się przetworzyć zdjęcia „${displayPhotoName(fileName)}”. Spróbuj ponownie.`;
}

export function photoUploadMessage(fileName: string): string {
  return `Nie udało się przesłać zdjęcia „${displayPhotoName(fileName)}”. Spróbuj ponownie.`;
}

export function uploadingPhotoLabel(current: number, total: number): string {
  return `Przesyłanie zdjęcia ${current} z ${total}...`;
}

export function partialUploadHint(done: number, total: number): string {
  return `Przesłano ${done} z ${total}. Ponowienie pominie już wysłane zdjęcia.`;
}

const SECRET_LEAK = /https?:\/\/|uploadIntent|objectKey|eyJ/i;

export function stageFinishErrorMessage(error: unknown): string {
  if (error instanceof JobPhotoClientError) return error.message;
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && !SECRET_LEAK.test(message)) return message;
  }
  return "Nie udało się zapisać etapu. Spróbuj ponownie.";
}
