"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import {
  getMemberDisplayName,
  getMemberEmailLine,
  getMemberRoleLabel,
  getMemberScopeLabel,
  getMemberStatusLabel,
} from "@/lib/company/member-labels";
import { useActiveCompanyId } from "@/lib/useActiveCompany";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  uid: string;
  email: string;
  displayName?: string;
  role: "owner" | "admin" | "staff";
  scope: "all" | "assigned" | "assigned_only";
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
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [scope, setScope] = useState<Member["scope"]>("all");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUid, setDeleteUid] = useState<string | null>(null);
  const [deleteLabel, setDeleteLabel] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    setBusy(true);
    setErr(null);
    try {
      const data = await apiFetch(`/api/companies/${companyId}`);
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
    setDeleteLabel(getMemberDisplayName(m));
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

  if (loading) return <div className="text-text-muted">Ładowanie...</div>;
  if (!user) return null;

  if (!companyId) {
    return (
      <div className="text-text">
        Najpierw wybierz aktywną firmę w{" "}
        <Link className="underline text-accent" href="/dashboard">
          Dashboard
        </Link>
        .
      </div>
    );
  }

  if (err === "FORBIDDEN") {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-text">Pracownicy</h1>
        <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-xl">
          Brak dostępu. Tylko właściciel lub administrator może zarządzać pracownikami.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0">
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-text">Pracownicy</h1>
            <p className="text-sm text-text-muted mt-1">Zarządzaj zespołem firmy</p>
          </div>
          <button
            type="button"
            className="min-h-[44px] px-4 py-2 rounded-xl border border-border bg-card text-text hover:bg-card-hover transition disabled:opacity-50"
            disabled={busy}
            onClick={load}
          >
            Odśwież
          </button>
        </div>

        {err && err !== "FORBIDDEN" && (
          <div className="text-sm text-danger border border-danger-border bg-danger-bg p-3 rounded-xl">
            {err}
          </div>
        )}

        {/* Invite form */}
        <section className="theme-glass bg-card rounded-2xl border border-border p-4 sm:p-5 space-y-4">
          <div className="font-semibold text-text">Dodaj pracownika</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="w-full min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="email@firma.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />

            <select
              className="w-full min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "staff")}
            >
              <option value="admin">Kierownik</option>
              <option value="staff">Pracownik</option>
            </select>

            <select
              className="w-full min-h-[44px] border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent"
              value={scope}
              onChange={(e) => setScope(e.target.value as Member["scope"])}
            >
              <option value="all">Wszystkie zlecenia</option>
              <option value="assigned">Tylko przypisane zlecenia</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              className="w-full sm:w-auto min-h-[48px] px-5 py-2 rounded-xl bg-primary text-primary-fg font-medium hover:opacity-90 disabled:opacity-50 transition"
              disabled={busy || email.trim().length === 0}
              onClick={invite}
            >
              {busy ? "..." : "Dodaj"}
            </button>
          </div>

          <div className="text-xs text-text-muted">
            MVP: użytkownik musi już istnieć w Auth (mieć konto).
          </div>
        </section>

        {/* Members list */}
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-semibold text-text">Lista pracowników</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="px-2.5 py-1 rounded-full border border-border bg-card text-text">
                Aktywni: <b className="text-success">{stats.active}</b>
              </span>
              <span className="px-2.5 py-1 rounded-full border border-border bg-card text-text">
                Nieaktywni: <b className="text-danger">{stats.inactive}</b>
              </span>
              <span className="px-2.5 py-1 rounded-full border border-border bg-card text-text-muted">
                Razem: <b className="text-text">{stats.total}</b>
              </span>
            </div>
          </div>

          {members.length === 0 ? (
            <div className="theme-glass bg-card rounded-2xl border border-border p-5 text-sm text-text-muted">
              Brak pracowników.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              {members.map((m) => {
                const isMe = m.uid === user.uid;
                const isOwner = m.role === "owner";
                const emailLine = getMemberEmailLine(m);

                return (
                  <article
                    key={m.uid}
                    className="theme-glass bg-card rounded-2xl border border-border p-4 sm:p-5 flex flex-col gap-4 min-w-0"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-semibold text-text truncate">
                        {getMemberDisplayName(m)}
                      </div>
                      {emailLine ? (
                        <div className="text-sm text-text-muted truncate">{emailLine}</div>
                      ) : null}
                    </div>

                    <dl className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-muted">Rola</dt>
                        <dd className="font-medium text-text text-right">
                          {getMemberRoleLabel(m.role)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-muted">Zakres</dt>
                        <dd className="font-medium text-text text-right">
                          {getMemberScopeLabel(m.scope)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-text-muted">Status</dt>
                        <dd
                          className={`font-medium text-right ${m.active ? "text-success" : "text-danger"}`}
                        >
                          {getMemberStatusLabel(m.active)}
                        </dd>
                      </div>
                    </dl>

                    {!isMe && !isOwner && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-border">
                        {m.active ? (
                          <button
                            type="button"
                            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-danger-border text-danger bg-danger-bg hover:opacity-90 disabled:opacity-50 transition"
                            disabled={busy}
                            onClick={() => setActive(m.uid, false)}
                          >
                            Dezaktywuj
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-success-border text-success bg-success-bg hover:opacity-90 disabled:opacity-50 transition"
                            disabled={busy}
                            onClick={() => setActive(m.uid, true)}
                          >
                            Aktywuj
                          </button>
                        )}

                        <button
                          type="button"
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-border bg-bg-secondary text-text hover:bg-card-hover disabled:opacity-50 transition"
                          disabled={busy}
                          onClick={() => openDelete(m)}
                          title="Usuń pracownika na stałe"
                        >
                          Usuń
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="w-full max-w-md theme-glass bg-card border border-border rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="font-semibold text-lg text-text">Usunąć pracownika na stałe?</h3>
            <p className="text-sm text-text-muted">
              Ta akcja <b className="text-text">trwale usuwa</b> pracownika z firmy i usuwa firmę z
              jego listy.
              <br />
              <b className="text-text">Nie da się tego łatwo cofnąć.</b>
            </p>

            <div className="text-sm text-text">
              Pracownik: <b>{deleteLabel}</b>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-xl border border-border bg-card text-text hover:bg-card-hover"
                onClick={closeDelete}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-danger text-white hover:opacity-90 disabled:opacity-50"
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
