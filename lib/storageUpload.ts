// TODO: storage imports removed with Firebase cleanup

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export async function uploadStagePhotos(opts: {
  companyId: string;
  jobId: string;
  stageId: string;
  uid: string;
  files: File[];
  onProgress?: (p: number) => void; // 0..100
}) {
  const { companyId, jobId, stageId, uid, files, onProgress } = opts;

  if (!files.length) return [];

  // upload sekwencyjnie (bezpieczniej na MVP)
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safe = sanitizeFileName(f.name || "zdjecie.jpg");
    const path = `companies/${companyId}/jobs/${jobId}/etapy_realizacji/${stageId}/${Date.now()}_${uid}_${safe}`;

    const r = ref(storage, path);

    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(r, f, { contentType: f.type || "image/jpeg" });

      task.on(
        "state_changed",
        (snap) => {
          const p = snap.totalBytes ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
          // progres pliku i w pętli – możesz to zrobić prościej:
          onProgress?.(Math.round(p));
        },
        (err) => reject(err),
        () => resolve()
      );
    });

    const url = await getDownloadURL(r);
    urls.push(url);
  }

  onProgress?.(100);
  return urls;
}