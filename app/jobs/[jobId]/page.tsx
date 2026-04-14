"use client";



import { useAuth } from "@/components/AuthProvider";

import { apiFetch } from "@/lib/api";

import { useActiveCompanyId } from "@/lib/useActiveCompany";

import { useEffect, useMemo, useState } from "react";

import { useRouter, useParams } from "next/navigation";

import { storage } from "@/lib/firebase/client";

import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";





type Role = "owner" | "admin" | "staff";



type Stage = {

id: string;

nazwa_etapu: string;

opis_etapu?: string;

planowana_data?: string; // YYYY-MM-DD lub ""

status: "do_wykonania" | "zakonczony";

data_zakonczenia?: string | null; // YYYY-MM-DD

zakonczone_przez?: string | null;

notatka_pracownika?: string;

lista_zdjec?: string[];

};



function isYyyyMmDd(s: string) {

return /^\d{4}-\d{2}-\d{2}$/.test(s);

}



// prosta kompresja zdjęć w przeglądarce (MVP)

// - zmniejsza max bok do 1600px

// - JPEG quality 0.8

async function compressImage(file: File): Promise<Blob> {

// jak to nie obrazek, zwróć oryginał

if (!file.type.startsWith("image/")) return file;



const imgUrl = URL.createObjectURL(file);

try {

const img = await new Promise<HTMLImageElement>((resolve, reject) => {

const i = new Image();

i.onload = () => resolve(i);

i.onerror = reject;

i.src = imgUrl;

});



const maxSide = 1600;

const w = img.width;

const h = img.height;



let newW = w;

let newH = h;



if (w > h && w > maxSide) {

newW = maxSide;

newH = Math.round((h * maxSide) / w);

} else if (h >= w && h > maxSide) {

newH = maxSide;

newW = Math.round((w * maxSide) / h);

}



const canvas = document.createElement("canvas");

canvas.width = newW;

canvas.height = newH;

const ctx = canvas.getContext("2d");

if (!ctx) return file;



ctx.drawImage(img, 0, 0, newW, newH);



const blob = await new Promise<Blob>((resolve) => {

canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.8);

});



return blob;

} finally {

URL.revokeObjectURL(imgUrl);

}

}



export default function JobDetailsPage() {

const params = useParams();
const jobId = params.jobId as string;


const { user, loading } = useAuth();

const router = useRouter();

const companyId = useActiveCompanyId();



const [job, setJob] = useState<any>(null);

const [busy, setBusy] = useState(false);

const [err, setErr] = useState<string | null>(null);



// rola + etapy

const [role, setRole] = useState<Role>("staff");

const [stages, setStages] = useState<Stage[]>([]);

const [stagesErr, setStagesErr] = useState<string | null>(null);



// dodawanie etapu

const [addOpen, setAddOpen] = useState(false);

const [newName, setNewName] = useState("");

const [newDesc, setNewDesc] = useState("");

const [newPlanned, setNewPlanned] = useState("");



// edycja etapu

const [editId, setEditId] = useState<string | null>(null);

const [editName, setEditName] = useState("");

const [editDesc, setEditDesc] = useState("");

const [editPlanned, setEditPlanned] = useState("");



// zakończanie etapu (notatka + zdjęcia)

const [finishId, setFinishId] = useState<string | null>(null);

const [finishNote, setFinishNote] = useState("");

const [finishFiles, setFinishFiles] = useState<File[]>([]);

const [uploadPct, setUploadPct] = useState<number>(0);



// edycja notatki (ZAWSZE)

const [noteId, setNoteId] = useState<string | null>(null);

const [noteValue, setNoteValue] = useState("");



const isOwnerOrAdmin = role === "owner" || role === "admin";

const isAssignedToMe = useMemo(

() => Boolean(job?.assignedTo && user?.uid && job.assignedTo === user.uid),

[job?.assignedTo, user?.uid]

);



// staff może pracować tylko jak przypisane

const canStaffWork = role === "staff" ? isAssignedToMe : true;

const canMarkDone = isOwnerOrAdmin || (role === "staff" && isAssignedToMe);



async function loadJob() {

if (!companyId) return;

setBusy(true);

setErr(null);

try {

const data = await apiFetch(`/api/companies/${companyId}/jobs/${jobId}`);

setJob(data.job);

} catch (e: any) {

setErr(e?.message ?? "LOAD_ERROR");

} finally {

setBusy(false);

}

}



async function loadRole() {

if (!companyId || !user) return;

try {

const data = await apiFetch(`/api/companies/${companyId}/members`);

const me = (data.members || []).find((m: any) => m.uid === user.uid);

setRole((me?.role as Role) || "staff");

} catch {

setRole("staff");

}

}



async function loadStages() {

if (!companyId) return;

setStagesErr(null);

try {

const data = await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji`);

setStages((data.stages || []) as Stage[]);

} catch (e: any) {

setStagesErr(e?.message ?? "LOAD_STAGES_ERROR");

}

}



useEffect(() => {

if (!loading && !user) router.replace("/login");

}, [loading, user, router]);



useEffect(() => {

if (user && companyId) {

loadJob();

loadRole();

loadStages();

}

// eslint-disable-next-line react-hooks/exhaustive-deps

}, [user, companyId, jobId]);



async function updateJob(patch: any) {

if (!companyId) return;

setBusy(true);

setErr(null);

try {

await apiFetch(`/api/companies/${companyId}/jobs/${jobId}`, {

method: "PATCH",

body: JSON.stringify(patch),

});

await loadJob();

} catch (e: any) {

setErr(e?.message ?? "UPDATE_ERROR");

} finally {

setBusy(false);

}

}



// ---------- ETAPY: CRUD ----------

async function addStage() {

if (!companyId) return;

const nazwa_etapu = newName.trim();

const opis_etapu = newDesc.trim();

const planowana_data = newPlanned.trim();



if (!nazwa_etapu) return setStagesErr("Podaj nazwę etapu.");

if (planowana_data && !isYyyyMmDd(planowana_data)) return setStagesErr("Data musi mieć format YYYY-MM-DD.");



setBusy(true);

setStagesErr(null);

try {

await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji`, {

method: "POST",

body: JSON.stringify({ nazwa_etapu, opis_etapu, planowana_data }),

});

setAddOpen(false);

setNewName("");

setNewDesc("");

setNewPlanned("");

await loadStages();

} catch (e: any) {

setStagesErr(e?.message ?? "ADD_STAGE_ERROR");

} finally {

setBusy(false);

}

}



function openEdit(s: Stage) {

setEditId(s.id);

setEditName(s.nazwa_etapu || "");

setEditDesc(s.opis_etapu || "");

setEditPlanned(s.planowana_data || "");

}



function closeEdit() {

setEditId(null);

setEditName("");

setEditDesc("");

setEditPlanned("");

}



async function saveEdit() {

if (!companyId || !editId) return;

const nazwa_etapu = editName.trim();

const opis_etapu = editDesc.trim();

const planowana_data = editPlanned.trim();



if (!nazwa_etapu) return setStagesErr("Podaj nazwę etapu.");

if (planowana_data && !isYyyyMmDd(planowana_data)) return setStagesErr("Data musi mieć format YYYY-MM-DD.");



setBusy(true);

setStagesErr(null);

try {

await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji/${editId}`, {

method: "PATCH",

body: JSON.stringify({ nazwa_etapu, opis_etapu, planowana_data }),

});

closeEdit();

await loadStages();

} catch (e: any) {

setStagesErr(e?.message ?? "EDIT_STAGE_ERROR");

} finally {

setBusy(false);

}

}



async function deleteStage(stageId: string) {

if (!companyId) return;

if (!confirm("Usunąć etap na stałe? Tej akcji nie da się cofnąć.")) return;



setBusy(true);

setStagesErr(null);

try {

await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji/${stageId}`, {

method: "DELETE",

});

await loadStages();

} catch (e: any) {

setStagesErr(e?.message ?? "DELETE_STAGE_ERROR");

} finally {

setBusy(false);

}

}



// ---------- NOTATKA: ZAWSZE EDYTOWALNA ----------

function openNoteEdit(s: Stage) {

// staff: tylko jeśli przypisane do niego

if (role === "staff" && !isAssignedToMe) {

setStagesErr("Jako pracownik możesz edytować notatki tylko, gdy zlecenie jest przypisane do Ciebie.");

return;

}

setStagesErr(null);

setNoteId(s.id);

setNoteValue(s.notatka_pracownika || "");

}



function closeNoteEdit() {

setNoteId(null);

setNoteValue("");

}



async function saveNote() {

if (!companyId || !noteId) return;



// staff: tylko jeśli przypisane do niego

if (role === "staff" && !isAssignedToMe) {

setStagesErr("Brak dostępu do zapisu notatki (zlecenie nie jest przypisane do Ciebie).");

return;

}



setBusy(true);

setStagesErr(null);

try {

await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji/${noteId}`, {

method: "PATCH",

body: JSON.stringify({ notatka_pracownika: noteValue }),

});

closeNoteEdit();

await loadStages();

} catch (e: any) {

setStagesErr(e?.message ?? "SAVE_NOTE_ERROR");

} finally {

setBusy(false);

}

}



// ---------- ZAKOŃCZ / COFNIJ ----------

function openFinish(stageId: string) {

if (!canMarkDone) return;

setFinishId(stageId);

setFinishNote("");

setFinishFiles([]);

setUploadPct(0);

setStagesErr(null);

}



function closeFinish() {

setFinishId(null);

setFinishNote("");

setFinishFiles([]);

setUploadPct(0);

}



async function uploadOne(stageId: string, file: File): Promise<string> {

if (!companyId || !user) throw new Error("NOT_LOGGED_IN");



// kompresja (dużo przyspiesza)

const blob = await compressImage(file);



const safeName = `${Date.now()}_${file.name}.replace(/[^\w.\-]+/g, "_")`;

const path = `companies/${companyId}/jobs/${jobId}/etapy_realizacji/${stageId}/${safeName}`;

const r = ref(storage, path);



return await new Promise<string>((resolve, reject) => {

const task = uploadBytesResumable(r, blob, { contentType: "image/jpeg" });



task.on(

"state_changed",

(snap) => {

const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);

setUploadPct((prev) => Math.max(prev, pct));

},

(error) => reject(error),

async () => {

const url = await getDownloadURL(task.snapshot.ref);

resolve(url);

}

);

});

}



async function finishStage() {

if (!companyId || !finishId) return;



// staff: tylko jeśli przypisane do niego

if (role === "staff" && !isAssignedToMe) {

setStagesErr("Nie możesz zakończyć etapu, jeśli zlecenie nie jest przypisane do Ciebie.");

return;

}



setBusy(true);

setStagesErr(null);

setUploadPct(0);



try {

const urls: string[] = [];



// wysyłamy po kolei (stabilniej w MVP)

for (let i = 0; i < finishFiles.length; i++) {

setUploadPct(0);

const url = await uploadOne(finishId, finishFiles[i]);

urls.push(url);

}



await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji/${finishId}/zakoncz`, {

method: "POST",

body: JSON.stringify({

notatka_pracownika: finishNote,

lista_zdjec: urls,

}),

});



closeFinish();

await loadStages();

} catch (e: any) {

// tu zobaczysz prawdziwy błąd uploadu (np. 403 z Storage)

setStagesErr(e?.message ?? "FINISH_STAGE_ERROR");

} finally {

setBusy(false);

setUploadPct(0);

}

}



async function reopenStage(stageId: string) {

if (!companyId) return;



// staff: tylko jeśli przypisane do niego

if (role === "staff" && !isAssignedToMe) {

setStagesErr("Nie możesz cofnąć zakończenia, jeśli zlecenie nie jest przypisane do Ciebie.");

return;

}



if (!confirm("Cofnąć zakończenie etapu?")) return;



setBusy(true);

setStagesErr(null);

try {

await apiFetch(`/api/companies/${companyId}/jobs/${jobId}/etapy_realizacji/${stageId}/cofnij`, {

method: "POST",

});

await loadStages();

} catch (e: any) {

setStagesErr(e?.message ?? "REOPEN_STAGE_ERROR");

} finally {

setBusy(false);

}

}



// ---------- UI ----------

if (loading) return <div className="p-6">Ładowanie...</div>;

if (!user) return null;

if (!companyId) return <div className="p-6">Wybierz firmę w Panelu głównym.</div>;



if (err) return <div className="p-6 text-red-600">{err}</div>;

if (!job) return <div className="p-6">Ładowanie zlecenia...</div>;



return (

<div className="space-y-6 max-w-3xl">

<h1 className="text-2xl font-semibold">Zlecenie #{job.id}</h1>



{/* DANE KLIENTA */}

<div className="border rounded-xl p-4 bg-white space-y-2">

<div>

<b>Klient:</b> {job.customerName} • {job.customerPhone}

</div>

<div>

<b>Adres:</b> {job.addressCity}, {job.addressStreet} {job.addressZip}

</div>

{job.addressNotes ? (

<div>

<b>Uwagi:</b> {job.addressNotes}

</div>

) : null}

<div>

<b>Opis:</b> {job.description}

</div>

{job.preferredFrom || job.preferredTo ? (

<div>

<b>Preferowany termin:</b> {job.preferredFrom} {job.preferredTo ? `→ ${job.preferredTo}` : ""}

</div>

) : null}

<div>

<b>Priorytet:</b> {job.priority === "urgent" ? "pilny" : "normalny"}

</div>

</div>



{/* STATUS + PRZYPISANIE */}

<div className="border rounded-xl p-4 bg-white space-y-3">

<div className="flex items-center gap-2">

<label className="text-sm">Status:</label>

<select

className="border rounded-lg px-3 py-2"

value={job.status}

disabled={busy}

onChange={(e) => updateJob({ status: e.target.value })}

>

<option value="new">nowe</option>

<option value="scheduled">zaplanowane</option>

<option value="in_progress">w trakcie</option>

<option value="done">zakończone</option>

<option value="cancelled">anulowane</option>

</select>

</div>



<div className="flex gap-2 flex-wrap">

<button

className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"

disabled={busy}

onClick={() => updateJob({ assignedTo: user.uid })}

>

Przypisz do mnie

</button>

<button

className="px-3 py-2 rounded-lg border disabled:opacity-60"

disabled={busy}

onClick={() => updateJob({ assignedTo: null })}

>

Odłącz przypisanie

</button>

</div>



<div className="text-sm text-gray-700">

Przypisane do: <b>{job.assignedTo || "(brak)"}</b>

{role === "staff" && !isAssignedToMe ? (

<div className="mt-1 text-xs text-gray-500">

Jako pracownik możesz edytować notatki / kończyć etapy tylko, gdy zlecenie jest przypisane do Ciebie.

</div>

) : null}

</div>

</div>



{/* ETAPY REALIZACJI */}

<div className="border rounded-xl p-4 bg-white space-y-3">

<div className="flex items-center justify-between gap-3">

<h2 className="text-lg font-semibold">Etapy realizacji</h2>



{isOwnerOrAdmin ? (

<button

type="button"

onClick={() => setAddOpen(true)}

className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"

disabled={busy}

>

Dodaj etap

</button>

) : null}

</div>



{stagesErr ? (

<div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg">{stagesErr}</div>

) : null}



{stages.length === 0 ? (

<div className="text-sm text-gray-600">Brak etapów.</div>

) : (

<div className="space-y-3">

{stages.map((s) => {

const done = s.status === "zakonczony";

const photos = Array.isArray(s.lista_zdjec) ? s.lista_zdjec : [];



return (

<div key={s.id} className="border rounded-xl p-3 bg-gray-50">

<div className="flex items-start justify-between gap-3">

<div className="min-w-0">

<div className="font-semibold truncate">{s.nazwa_etapu}</div>



<div className="text-sm text-gray-700 mt-1 space-y-1">

{s.opis_etapu ? <div>{s.opis_etapu}</div> : null}



<div>

<span className="text-gray-500">Planowana data:</span>{" "}

<b>{s.planowana_data ? s.planowana_data : "(brak)"}</b>

</div>



<div>

<span className="text-gray-500">Status:</span>{" "}

<b className={done ? "text-green-700" : "text-amber-700"}>

{done ? "Zakończony" : "Do wykonania"}

</b>

{done ? (

<span className="text-gray-500">

{" "}

• {s.data_zakonczenia || "(brak daty)"} • przez:{" "}

{s.zakonczone_przez || "(brak)"}

</span>

) : null}

</div>



{/* NOTATKA (widok) */}

{s.notatka_pracownika ? (

<div className="pt-1">

<span className="text-gray-500">Notatka:</span> {s.notatka_pracownika}

</div>

) : (

<div className="pt-1 text-gray-500 text-xs">Notatka: (brak)</div>

)}

</div>



{/* ZDJĘCIA - MINIATURY */}

{photos.length ? (

<div className="mt-3">

<div className="text-xs text-gray-500 mb-2">Zdjęcia:</div>

<div className="flex gap-2 flex-wrap">

{photos.map((url, idx) => (

<a

key={idx}

href={url}

target="_blank"

rel="noreferrer"

className="block"

title="Otwórz zdjęcie"

>

<img

src={url}

alt={`Zdjęcie ${idx + 1}`}

className="w-20 h-20 object-cover rounded-lg border bg-white"

/>

</a>

))}

</div>

</div>

) : null}

</div>



{/* PRZYCISKI */}

<div className="shrink-0 flex flex-col gap-2">

{/* owner/admin: edycja/usuwanie */}

{isOwnerOrAdmin ? (

<>

<button

type="button"

className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-60"

disabled={busy}

onClick={() => openEdit(s)}

>

Edytuj etap

</button>

<button

type="button"

className="px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 text-sm disabled:opacity-60"

disabled={busy}

onClick={() => deleteStage(s.id)}

>

Usuń etap

</button>

</>

) : null}



{/* NOTATKA: edycja zawsze (owner/admin zawsze; staff tylko jeśli przypisane) */}

<button

type="button"

className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-60"

disabled={busy || (role === "staff" && !isAssignedToMe)}

onClick={() => openNoteEdit(s)}

title={role === "staff" && !isAssignedToMe ? "Zlecenie nie jest przypisane do Ciebie" : "Edytuj notatkę"}

>

Edytuj notatkę

</button>



{/* zakończ / cofnij */}

{canMarkDone && canStaffWork ? (

done ? (

<button

type="button"

className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-60"

disabled={busy}

onClick={() => reopenStage(s.id)}

>

Cofnij zakończenie

</button>

) : (

<button

type="button"

className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-60"

disabled={busy}

onClick={() => openFinish(s.id)}

>

Oznacz jako zakończony

</button>

)

) : null}

</div>

</div>

</div>

);

})}

</div>

)}

</div>



{/* MODAL: DODAJ ETAP */}

{addOpen ? (

<div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6">

<div className="w-full max-w-lg bg-white border rounded-xl p-4 space-y-3">

<div className="flex items-center justify-between">

<h3 className="font-semibold text-lg">Dodaj etap</h3>

<button className="text-sm px-2 py-1" onClick={() => setAddOpen(false)}>

✕

</button>

</div>



<input

className="w-full border rounded-lg px-3 py-2"

placeholder="Nazwa etapu (wymagane)"

value={newName}

onChange={(e) => setNewName(e.target.value)}

/>



<textarea

className="w-full border rounded-lg px-3 py-2"

rows={3}

placeholder="Opis etapu (opcjonalnie)"

value={newDesc}

onChange={(e) => setNewDesc(e.target.value)}

/>



<input

className="w-full border rounded-lg px-3 py-2"

placeholder="Planowana data (YYYY-MM-DD, opcjonalnie)"

value={newPlanned}

onChange={(e) => setNewPlanned(e.target.value)}

/>



<div className="flex justify-end gap-2">

<button className="px-3 py-2 rounded-lg border" onClick={() => setAddOpen(false)} disabled={busy}>

Anuluj

</button>

<button

className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"

onClick={addStage}

disabled={busy}

>

Dodaj

</button>

</div>

</div>

</div>

) : null}



{/* MODAL: EDYTUJ ETAP */}

{editId ? (

<div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6">

<div className="w-full max-w-lg bg-white border rounded-xl p-4 space-y-3">

<div className="flex items-center justify-between">

<h3 className="font-semibold text-lg">Edytuj etap</h3>

<button className="text-sm px-2 py-1" onClick={closeEdit}>

✕

</button>

</div>



<input

className="w-full border rounded-lg px-3 py-2"

placeholder="Nazwa etapu (wymagane)"

value={editName}

onChange={(e) => setEditName(e.target.value)}

/>



<textarea

className="w-full border rounded-lg px-3 py-2"

rows={3}

placeholder="Opis etapu (opcjonalnie)"

value={editDesc}

onChange={(e) => setEditDesc(e.target.value)}

/>



<input

className="w-full border rounded-lg px-3 py-2"

placeholder="Planowana data (YYYY-MM-DD, opcjonalnie)"

value={editPlanned}

onChange={(e) => setEditPlanned(e.target.value)}

/>



<div className="flex justify-end gap-2">

<button className="px-3 py-2 rounded-lg border" onClick={closeEdit} disabled={busy}>

Anuluj

</button>

<button

className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"

onClick={saveEdit}

disabled={busy}

>

Zapisz

</button>

</div>

</div>

</div>

) : null}



{/* MODAL: EDYTUJ NOTATKĘ */}

{noteId ? (

<div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6">

<div className="w-full max-w-lg bg-white border rounded-xl p-4 space-y-3">

<div className="flex items-center justify-between">

<h3 className="font-semibold text-lg">Edytuj notatkę</h3>

<button className="text-sm px-2 py-1" onClick={closeNoteEdit}>

✕

</button>

</div>



<textarea

className="w-full border rounded-lg px-3 py-2"

rows={5}

placeholder="Notatka pracownika (co zostało zrobione / co jest do zrobienia)"

value={noteValue}

onChange={(e) => setNoteValue(e.target.value)}

/>



<div className="flex justify-end gap-2">

<button className="px-3 py-2 rounded-lg border" onClick={closeNoteEdit} disabled={busy}>

Anuluj

</button>

<button

className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"

onClick={saveNote}

disabled={busy}

>

Zapisz notatkę

</button>

</div>

</div>

</div>

) : null}



{/* MODAL: OZNACZ JAKO ZAKOŃCZONY */}

{finishId ? (

<div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6">

<div className="w-full max-w-lg bg-white border rounded-xl p-4 space-y-3">

<div className="flex items-center justify-between">

<h3 className="font-semibold text-lg">Oznacz etap jako zakończony</h3>

<button className="text-sm px-2 py-1" onClick={closeFinish}>

✕

</button>

</div>



<textarea

className="w-full border rounded-lg px-3 py-2"

rows={4}

placeholder="Notatka pracownika (co zostało zrobione)"

value={finishNote}

onChange={(e) => setFinishNote(e.target.value)}

/>



<div className="space-y-2">

<div className="text-sm font-medium">Zdjęcia</div>



<label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 cursor-pointer text-sm w-fit">

📎 Załącz zdjęcia

<input

type="file"

multiple

accept="image/*"

className="hidden"

onChange={(e) => setFinishFiles(Array.from(e.target.files || []))}

/>

</label>



{finishFiles.length ? (

<div className="text-xs text-gray-600">

Wybrano: <b>{finishFiles.length}</b> plik(ów)

</div>

) : (

<div className="text-xs text-gray-500">Możesz dodać jedno lub wiele zdjęć.</div>

)}



{uploadPct > 0 ? (

<div className="text-xs text-gray-700">

Wysyłanie zdjęcia: <b>{uploadPct}%</b>

<div className="w-full h-2 bg-gray-200 rounded mt-1 overflow-hidden">

<div className="h-2 bg-gray-900" style={{ width: `${uploadPct}%` }} />

</div>

</div>

) : null}

</div>



<div className="flex justify-end gap-2">

<button className="px-3 py-2 rounded-lg border" onClick={closeFinish} disabled={busy}>

Anuluj

</button>

<button

className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-60"

onClick={finishStage}

disabled={busy}

>

Zapisz

</button>

</div>



<div className="text-xs text-gray-500">

Po zapisaniu: status = zakończony, data zakończenia = dzisiaj, zakończone przez = Ty.

</div>

</div>

</div>

) : null}

</div>

);

}





