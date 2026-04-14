"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  uid: string;
  email: string;
  displayName?: string;
  role: "owner" | "admin" | "staff";
  scope: "all" | "assigned";
  active: boolean;
};

export default function MembersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const companyId = useActiveCompanyId();

  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("staff");
  const [scope, setScope] = useState<Member["scope"]>("all");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    setBusy(true);
    setErr(null);
    try {
      const data = await apiFetch(`/api/companies/${companyId}/members`);
      setMembers(data.members || []);
    } catch (e: any) {
      setErr(e?.message ?? "LOAD_ERROR");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (user && companyId) load();
  }, [user, companyId]);

  async function invite() {
    if (!companyId) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/companies/${companyId}/members/invite`, {
        method: "POST",
        body: JSON.stringify({ email, role, scope }),
      });
      setEmail("");
      setRole("staff");
      setScope("all");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "INVITE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(memberUid: string, nextActive: boolean) {
    if (!companyId) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/companies/${companyId}/members/${memberUid}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "PATCH_ERROR");
    } finally {
      setBusy(false);
    }
  }

  function openDelete(m: Member) {
    setDeleteUid(m.uid);
    setDeleteLabel(m.displayName?.trim() || m.email || m.uid);
    setDeleteOpen(true);
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeleteUid(null);
    setDeleteLabel(null);
  }

  async function hardDelete() {
    if (!companyId || !deleteUid) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/companies/${companyId}/members/${deleteUid}`, {
        method: "DELETE",
      });
      closeDelete();
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "DELETE_ERROR");
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const list = Array.isArray(members) ? members : [];
    const active = list.filter((m) => m.active === true).length;
    const inactive = list.filter((m) => m.active === false).length;
    return { total: list.length, active, inactive };
  }, [members]);

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

  if (err === "FORBIDDEN") {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Pracownicy</h1>
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded">
          Brak dostępu. Tylko właściciel lub administrator może zarządzać pracownikami.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pracownicy</h1>
        <button type="button" className="px-3 py-2 rounded border" disabled={busy} onClick={load}>
          Odśwież
        </button>
      </div>

      {err && err !== "FORBIDDEN" && (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded">
          {err}
        </div>
      )}

      <div className="border rounded-lg p-4 bg-white space-y-3">
        <div className="font-semibold">Dodaj pracownika</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="border rounded px-3 py-2 bg-white"
            placeholder="email@firma.pl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <select
            className="border rounded px-3 py-2 bg-white"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="owner">owner (właściciel)</option>
            <option value="admin">admin (administrator)</option>
            <option value="staff">staff (pracownik)</option>
          </select>

          <select
            className="border rounded px-3 py-2 bg-white"
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
          >
            <option value="all">all (widzi wszystko)</option>
            <option value="assigned">assigned (tylko przypisane)</option>
          </select>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="px-3 py-2 rounded bg-gray-900 text-white disabled:opacity-60"
            disabled={busy || email.trim().length === 0}
            onClick={invite}
          >
            {busy ? "..." : "Dodaj"}
          </button>
        </div>

        <div className="text-xs text-gray-600">
          MVP: użytkownik musi już istnieć w Auth (mieć konto).
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-semibold">Lista pracowników</div>

            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded-full border bg-white">
                Aktywni: <b className="text-green-700">{stats.active}</b>
              </span>
              <span className="px-2 py-1 rounded-full border bg-white">
                Nieaktywni: <b className="text-red-700">{stats.inactive}</b>
              </span>
              <span className="px-2 py-1 rounded-full border bg-white text-gray-700">
                Razem: <b>{stats.total}</b>
              </span>
            </div>
          </div>

          <button
            type="button"
            className="px-3 py-2 rounded border disabled:opacity-60"
            disabled={busy}
            onClick={load}
          >
            Odśwież
          </button>
        </div>

        {members.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Brak pracowników.</div>
        ) : (
          <div className="divide-y">
            {members.map((m) => {
              const isMe = m.uid === user.uid;
              const isOwner = m.role === "owner";

              return (
                <div key={m.uid} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {m.displayName?.trim() || m.email || m.uid}
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      {m.email || m.uid}
                    </div>
                    <div className="text-sm text-gray-600">
                      Rola: <b>{m.role}</b> • Zakres: <b>{m.scope}</b> • Status:{" "}
                      <b className={m.active ? "text-green-700" : "text-red-700"}>
                        {m.active ? "aktywny" : "nieaktywny"}
                      </b>
                    </div>
                  </div>

                  {!isMe && !isOwner && (
                    <div className="flex gap-2 shrink-0">
                      {m.active ? (
                        <button
                          type="button"
                          className="px-3 py-2 rounded border border-red-300 text-red-700 bg-red-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => setActive(m.uid, false)}
                        >
                          Dezaktywuj
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="px-3 py-2 rounded border border-green-300 text-green-800 bg-green-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => setActive(m.uid, true)}
                        >
                          Aktywuj
                        </button>
                      )}

                      <button
                        type="button"
                        className="px-3 py-2 rounded border border-gray-300 text-gray-800 bg-white disabled:opacity-60"
                        disabled={busy}
                        onClick={() => openDelete(m)}
                        title="Usuń pracownika na stałe"
                      >
                        Usuń
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border rounded p-4 space-y-3">
            <h3 className="font-semibold text-lg">Usunąć pracownika na stałe?</h3>
            <p className="text-sm text-gray-700">
              Ta akcja <b>trwale usuwa</b> pracownika z firmy i usuwa firmę z jego listy.
              <br />
              <b>Nie da się tego łatwo cofnąć.</b>
            </p>

            <div className="text-sm">
              Pracownik: <b>{deleteLabel}</b>
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-2 rounded border" onClick={closeDelete}>
                Anuluj
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60"
                disabled={busy}
                onClick={hardDelete}
              >
                Tak, usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}  