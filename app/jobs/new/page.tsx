"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type CompanyMemberOption,
  filterAssignableMembers,
} from "@/lib/company/member-options";
import { JobDateRangeEditor } from "@/components/jobs/JobDateRangeEditor";
import { JobPrioritySelect, type JobPriority } from "@/lib/jobs/job-priority";
import { validatePreferredRange } from "@/lib/jobs/job-detail-form";

export default function NewJobPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const companyId = useActiveCompanyId();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [addressNotes, setAddressNotes] = useState("");
  const [description, setDescription] = useState("");
  const [preferredFrom, setPreferredFrom] = useState("");
  const [preferredTo, setPreferredTo] = useState("");
  const [priority, setPriority] = useState<JobPriority>("normal");

  const [members, setMembers] = useState<CompanyMemberOption[]>([]);
  const [assignedToUids, setAssignedToUids] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!companyId || !user) return;

    (async () => {
      try {
        const data = await apiFetch(`/api/companies/${companyId}/members/simple`);
        setMembers(Array.isArray(data?.members) ? data.members : []);
      } catch {
        setMembers([]);
      }
    })();
  }, [companyId, user]);

  function toggleAssigned(uid: string) {
    setAssignedToUids((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  }

  const assignableMembers = useMemo(
    () => filterAssignableMembers(members),
    [members]
  );

  const assignedPreview = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.label]));
    return assignedToUids.map((uid) => map.get(uid) || uid);
  }, [members, assignedToUids]);

  async function create() {
    if (!companyId) return;

    const rangeErr = validatePreferredRange(preferredFrom, preferredTo);
    if (rangeErr) {
      setErr(rangeErr);
      return;
    }

    setBusy(true);
    setErr(null);

    try {
      const data = await apiFetch(`/api/companies/${companyId}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerPhone,
          addressCity,
          addressStreet,
          addressZip,
          addressNotes,
          description,
          preferredFrom,
          preferredTo,
          priority,
          assignedToUids,
        }),
      });

      if (data?.jobId) {
        router.push(`/jobs/${data.jobId}`);
      }
    } catch (e: any) {
      setErr(e?.message ?? "CREATE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6">Ładowanie...</div>;
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="p-6">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline" href="/dashboard">
          Dashboard
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Utwórz zlecenie</h1>

      {err && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          className="border rounded px-3 py-2"
          placeholder="Klient: imię i nazwisko"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Telefon"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Miasto"
          value={addressCity}
          onChange={(e) => setAddressCity(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Ulica i nr"
          value={addressStreet}
          onChange={(e) => setAddressStreet(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Kod pocztowy (opcjonalnie)"
          value={addressZip}
          onChange={(e) => setAddressZip(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Uwagi do adresu (domofon itp.)"
          value={addressNotes}
          onChange={(e) => setAddressNotes(e.target.value)}
        />
      </div>

      <textarea
        className="border rounded px-3 py-2 w-full"
        rows={4}
        placeholder="Opis problemu"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <JobDateRangeEditor
        preferredFrom={preferredFrom}
        preferredTo={preferredTo}
        disabled={busy}
        onChange={({ preferredFrom: from, preferredTo: to }) => {
          setPreferredFrom(from);
          setPreferredTo(to);
        }}
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700" id="new-job-priority-label">
          Priorytet
        </span>
        <JobPrioritySelect
          id="new-job-priority"
          value={priority}
          onChange={setPriority}
          disabled={busy}
          aria-label="Priorytet zlecenia"
          aria-labelledby="new-job-priority-label"
        />
      </div>

      <div className="space-y-3 border rounded-xl p-4 bg-white">
        <div>
          <div className="text-sm font-medium">Przypisz pracowników</div>
          <div className="text-xs text-gray-600 mt-1">
            Możesz przypisać kilka osób naraz albo zostawić zlecenie bez przypisania.
          </div>
        </div>

        {assignableMembers.length === 0 ? (
          <div className="text-sm text-gray-500">Brak aktywnych pracowników do wyboru.</div>
        ) : (
          <div className="space-y-2">
            {assignableMembers.map((m) => {
              const checked = assignedToUids.includes(m.uid);
              return (
                <label
                  key={m.uid}
                  className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-white cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAssigned(m.uid)}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.label}</div>
                    <div className="text-xs text-gray-500 truncate">{m.email}</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="text-xs text-gray-700">
          Wybrano: <b>{assignedPreview.length}</b>
          {assignedPreview.length > 0 ?  `— ${assignedPreview.join(", ")}` : ""}
        </div>
      </div>

      <button
        className="px-3 py-2 rounded bg-black text-white disabled:opacity-60"
        disabled={
          busy ||
          !customerName.trim() ||
          !customerPhone.trim() ||
          !addressCity.trim() ||
          !addressStreet.trim() ||
          !description.trim()
        }
        onClick={create}
      >
        {busy ? "Tworzenie..." : "Utwórz zlecenie"}
      </button>
    </div>
  );
}