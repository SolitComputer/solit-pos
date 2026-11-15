// src/components/akutansi/NotifRecipientsModal.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Save, Users, X } from "lucide-react";

interface EligibleUser {
  user_id: string;
  name: string;  // ← FIX: samakan dengan API yang return `name`, bukan `full_name`
  role: string;
  enabled: boolean;
}

// Label & warna per role — biar user mudah bedain role di list.
const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  ACCOUNTING: "Accounting",
  PKL_ACCOUNTING: "PKL Accounting",
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: "bg-red-50 text-red-700 border-red-200",
  ACCOUNTING: "bg-blue-50 text-blue-700 border-blue-200",
  PKL_ACCOUNTING: "bg-violet-50 text-violet-700 border-violet-200",
};

// Urutan grup — Admin dulu, baru Accounting, baru PKL
const ROLE_ORDER = ["ADMIN", "ACCOUNTING", "PKL_ACCOUNTING"];

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal konfigurasi siapa yang menerima notif perubahan jurnal.
 *
 * Alur:
 * 1. Modal dibuka → GET /api/akutansi/jurnal/notif-recipients
 * 2. User ceklis/uncheck user yang bisa terima notif
 * 3. Klik Simpan → PUT /api/akutansi/jurnal/notif-recipients
 * 4. Server upsert ke journal_notif_recipients, modal auto-close
 *
 * API sendiri yang enforce role AKUNTANSI_MANAGE_ROLES — kalau role user
 * tidak eligible, PUT akan return 403 dan error ditampilkan.
 */
export default function NotifRecipientsModal({ open, onClose }: Props) {
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Fetch daftar user eligible saat modal dibuka
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);

    (async () => {
      try {
        const res = await fetch("/api/akutansi/jurnal/notif-recipients");
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Gagal memuat daftar penerima");
        }
        setUsers(Array.isArray(json.data) ? json.data : []);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Gagal memuat daftar penerima";
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Toggle 1 user
  const toggleUser = useCallback((userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, enabled: !u.enabled } : u))
    );
  }, []);

  // Toggle semua user (centang/kosongkan semua)
  const handleToggleAll = useCallback((enabled: boolean) => {
    setUsers((prev) => prev.map((u) => ({ ...u, enabled })));
  }, []);

  // Simpan — batch PUT ke server
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/akutansi/jurnal/notif-recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // FIX: API expect key `items`, bukan `recipients` — kalau tidak,
          // backend reject dengan "items array wajib diisi" (lihat route.ts line 78-83)
          items: users.map((u) => ({
            user_id: u.user_id,
            enabled: u.enabled,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Gagal menyimpan");
      }
      setSavedAt(Date.now());
      // Auto-close 1.2 detik biar user lihat feedback "Tersimpan"
      setTimeout(() => onClose(), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [users, onClose]);

  if (!open) return null;

  const enabledCount = users.filter((u) => u.enabled).length;
  const totalCount = users.length;

  // Group users by role untuk rendering
  const byRole: Record<string, EligibleUser[]> = {};
  for (const u of users) {
    if (!byRole[u.role]) byRole[u.role] = [];
    byRole[u.role].push(u);
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">
                Kelola Penerima Notif Jurnal
              </h3>
              <p className="text-[11px] text-slate-500">
                Pilih siapa yang menerima notif perubahan jurnal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: counter + toggle all */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100 flex-shrink-0">
          <div className="text-xs text-slate-600">
            <span className="font-bold text-slate-800 tabular-nums">{enabledCount}</span>
            <span className="text-slate-400"> / </span>
            <span className="tabular-nums">{totalCount}</span> penerima aktif
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleAll(true)}
              disabled={loading || saving || totalCount === 0}
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
            >
              Centang Semua
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => handleToggleAll(false)}
              disabled={loading || saving || totalCount === 0}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40"
            >
              Kosongkan
            </button>
          </div>
        </div>

        {/* Body: list user */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="ml-2 text-xs">Memuat daftar penerima...</span>
            </div>
          ) : error ? (
            <div className="p-5">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs px-5">
              Tidak ada user eligible.
              <br />
              <span className="text-[11px]">
                Role yang bisa terima notif: Admin / Accounting / PKL Accounting.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {ROLE_ORDER.map((role) => {
                const list = byRole[role];
                if (!list || list.length === 0) return null;
                return (
                  <div key={role} className="p-2">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {ROLE_LABEL[role] || role}
                    </div>
                    {list.map((user) => (
                      <label
                        key={user.user_id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={user.enabled}
                          onChange={() => toggleUser(user.user_id)}
                          disabled={saving}
                          className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {user.name}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                              ROLE_COLOR[user.role] || "bg-slate-50 text-slate-600 border-slate-200"
                            }`}
                          >
                            {ROLE_LABEL[user.role] || user.role}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: status + tombol simpan */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-200 flex-shrink-0 gap-3">
          {savedAt ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Tersimpan
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Perubahan berlaku untuk notif berikutnya
            </p>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving || totalCount === 0 || !!savedAt}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Simpan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}