"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

type Notification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt?: any;
  jobId?: string;
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await apiFetch("/api/notifications");
      setItems(data.notifications || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Powiadomienia</h1>

      {loading && <div>Ładowanie...</div>}

      {!loading && items.length === 0 && (
        <div className="text-gray-500">Brak powiadomień</div>
      )}

      <div className="space-y-3">
        {items.map((n) => (
          <Link
            key={n.id}
            href={n.jobId ? `/jobs/${n.jobId}` : "#"}
            className={`block p-4 rounded-xl border ${
              n.read
                ? "bg-white border-gray-200"
                : "bg-blue-50 border-blue-200"
            }`}
          >
            <div className="font-semibold">{n.title}</div>
            <div className="text-sm text-gray-600">{n.body}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}