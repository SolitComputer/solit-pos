"use client";
// src/app/dashboard/missions/page.tsx

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  Mission,
  MissionPriority,
  MISSION_STATUS_META,
  MISSION_PRIORITY_META,
  canAssignMissions,
  canReviewMission,
} from "@/lib/missions";

interface AssignableUser {
  id: string; name: string; role: string; roles: string[]; shift?: string;
}

type Box = "received" | "assigned";

// ── util ──────────────────────────────────────────────────────────────────────
const ROLE_LABEL_MINI = (r?: string | null) => (r ? r.replace(/_/g, " ") : "");
function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID",
    { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function isOverdue(m: Mission) {
  if (!m.due_date || m.status === "APPROVED") return false;
  return new Date(m.due_date).getTime() < Date.now();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-3 animate-slideIn ${type === "ok" ? "bg-white text-slate-700 border border-slate-100" : "bg-white text-red-600 border border-red-100"}`}>
      {type === "ok"
        ? <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg></div>
        : <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></div>}
      {msg}
    </div>
  );
}

// ── Modal primitives (samain dgn users page) ──────────────────────────────────
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.18)" }}>
        <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        {children}
      </div>
    </div>
  );
}
function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="relative px-6 py-5 flex items-center justify-between overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}>
      <div className="z-10">
        <p className="font-bold text-white text-sm tracking-tight">{title}</p>
        <p className="text-[10.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{subtitle}</p>
      </div>
      <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:scale-110 z-10"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6 40%, #ec4899 80%, transparent)" }} />
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10.5px] font-bold mb-1.5 block uppercase tracking-widest" style={{ color: "#94a3b8" }}>{label}</label>
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full h-10 border rounded-xl px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-400/30"
    style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#1e293b" }} />;
}
function ErrorBox({ msg }: { msg: string }) {
  return <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-xs font-semibold"
    style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>⚠️ {msg}</div>;
}

// ── Badges ────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Mission["status"] }) {
  const s = MISSION_STATUS_META[status];
  return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
    style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{s.icon} {s.label}</span>;
}
function PriorityBadge({ priority }: { priority: MissionPriority }) {
  const p = MISSION_PRIORITY_META[priority];
  return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
    style={{ background: p.bg, color: p.text, border: `1px solid ${p.border}` }}>{p.icon} {p.label}</span>;
}

// ── Mission card ──────────────────────────────────────────────────────────────
function MissionCard({ m, view, onOpen }: { m: Mission; view: Box; onOpen: () => void }) {
  const otherName = view === "received" ? (m.assigner?.name ?? "—") : (m.assignee?.name ?? "—");
  const otherLabel = view === "received" ? "Dari" : "Untuk";
  const overdue = isOverdue(m);
  return (
    <button onClick={onOpen} className="w-full text-left bg-white rounded-2xl p-4 transition-all hover:shadow-md"
      style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-bold text-slate-800 line-clamp-2">{m.title}</p>
        <StatusBadge status={m.status} />
      </div>
      {m.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2.5">{m.description}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <PriorityBadge priority={m.priority} />
        <span className="text-[10px] text-slate-400 font-medium">
          {otherLabel}: <span className="text-slate-600 font-semibold">{otherName}</span>
        </span>
        {m.due_date && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={overdue ? { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }
                           : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
            📅 {fmtDateShort(m.due_date)}{overdue ? " • Lewat" : ""}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateMissionModal({ onClose, onCreated, showToast }: {
  onClose: () => void; onCreated: () => void; showToast: (m: string, t: "ok" | "err") => void;
}) {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [assignedTo, setAssignedTo] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MissionPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/missions/assignable-users");
        const data = await res.json();
        if (data.success) setUsers(data.data);
      } catch { /* ignore */ }
      finally { setLoadingUsers(false); }
    })();
  }, []);

  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    setError("");
    if (!assignedTo) { setError("Pilih penerima misi"); return; }
    if (!title.trim()) { setError("Judul misi wajib diisi"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/missions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assigned_to: assignedTo, title: title.trim(), description: description.trim(),
          priority, due_date: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onCreated();
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Buat Misi Baru" subtitle="Beri tugas ke anggota tim" onClose={onClose} />
      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {error && <ErrorBox msg={error} />}

        <Field label="Penerima Misi">
          <Input placeholder="Cari nama..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="mt-2 max-h-44 overflow-y-auto space-y-1 pr-0.5">
            {loadingUsers ? (
              <p className="text-xs text-slate-400 py-3 text-center">Memuat daftar user...</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">Tidak ada user yang bisa kamu beri misi</p>
            ) : filtered.map(u => {
              const active = assignedTo === u.id;
              return (
                <button key={u.id} type="button" onClick={() => setAssignedTo(u.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all active:scale-[0.99] border"
                  style={active ? { background: "#f5f3ff", borderColor: "#ddd6fe" } : { background: "#f8fafc", borderColor: "#e2e8f0" }}>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{u.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{ROLE_LABEL_MINI(u.roles?.[0] ?? u.role)}</p>
                  </div>
                  {active && <span className="text-violet-600 text-xs font-black">✓</span>}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Judul Misi">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="contoh: Follow up 10 leads Shopee" />
        </Field>

        <Field label="Deskripsi (opsional)">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="Detail tugas..."
            className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
            style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#1e293b" }} />
        </Field>

        <Field label="Prioritas">
          <div className="flex gap-2">
            {(["LOW", "MEDIUM", "HIGH"] as MissionPriority[]).map(p => {
              const meta = MISSION_PRIORITY_META[p];
              const active = priority === p;
              return (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className="flex-1 h-10 rounded-xl text-xs font-bold border transition-all active:scale-95"
                  style={active ? { background: meta.bg, color: meta.text, borderColor: meta.border }
                                : { background: "#f8fafc", color: "#94a3b8", borderColor: "#e2e8f0" }}>
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Deadline (opsional)">
          <Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
      </div>

      <div className="px-6 pb-6 pt-4 flex gap-2.5" style={{ borderTop: "1px solid #f1f5f9" }}>
        <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold transition-all hover:bg-slate-100 active:scale-95"
          style={{ background: "#f1f5f9", color: "#64748b" }}>Batal</button>
        <button onClick={save} disabled={saving}
          className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
          {saving ? "Menyimpan..." : "🎯 Beri Misi"}
        </button>
      </div>
    </ModalShell>
  );
}

// ── Detail modal (submit bukti / ACC / tolak) ─────────────────────────────────
function MissionDetailModal({ mission, currentUser, onClose, onChanged, showToast }: {
  mission: Mission;
  currentUser: { id: string; roles: string[] };
  onClose: () => void; onChanged: () => void;
  showToast: (m: string, t: "ok" | "err") => void;
}) {
  const isAssignee = mission.assigned_to === currentUser.id;
  const canReview = canReviewMission(currentUser, mission);
  const canSubmit = isAssignee && ["PENDING", "IN_PROGRESS", "REJECTED"].includes(mission.status);
  const canDecide = canReview && mission.status === "SUBMITTED";

  const [mode, setMode] = useState<"view" | "submit" | "reject">("view");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const s = MISSION_STATUS_META[mission.status];

  const onPickFile = (f: File | null) => {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : "");
  };

  const submitProof = async () => {
    if (!file) { showToast("Upload bukti foto dulu", "err"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/missions/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!upData.success) { showToast(upData.message ?? "Upload gagal", "err"); return; }

      const res = await fetch(`/api/missions/${mission.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", proof_photo_url: upData.url, proof_note: note }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.message ?? "Gagal submit", "err"); return; }
      showToast("Misi diselesaikan, menunggu ACC ✅", "ok");
      onChanged();
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setBusy(false); }
  };

  const decide = async (action: "approve" | "reject") => {
    if (action === "reject" && !rejectReason.trim()) { showToast("Isi alasan penolakan", "err"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/missions/${mission.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejection_reason: action === "reject" ? rejectReason.trim() : undefined }),
      });
      const data = await res.json();
      if (!data.success) { showToast(data.message ?? "Gagal", "err"); return; }
      showToast(action === "approve" ? "Misi disetujui ✅" : "Misi ditolak", "ok");
      onChanged();
    } catch { showToast("Terjadi kesalahan", "err"); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title="Detail Misi" subtitle={mission.assignee?.name ?? ""} onClose={onClose} />
      <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
        {/* Header info */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-black text-slate-800">{mission.title}</h3>
          <StatusBadge status={mission.status} />
        </div>
        {mission.description && <p className="text-sm text-slate-500 leading-relaxed">{mission.description}</p>}

        <div className="flex flex-wrap gap-2">
          <PriorityBadge priority={mission.priority} />
          {mission.due_date && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={isOverdue(mission) ? { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }
                                        : { background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
              📅 {fmtDateShort(mission.due_date)}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-xl p-2.5" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[9px] mb-0.5">Pemberi</p>
            <p className="text-slate-700 font-semibold">{mission.assigner?.name ?? "—"}</p>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[9px] mb-0.5">Penerima</p>
            <p className="text-slate-700 font-semibold">{mission.assignee?.name ?? "—"}</p>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[9px] mb-0.5">Dibuat</p>
            <p className="text-slate-700 font-semibold">{fmtDate(mission.created_at)}</p>
          </div>
          {mission.submitted_at && (
            <div className="rounded-xl p-2.5" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
              <p className="text-slate-400 font-bold uppercase tracking-wide text-[9px] mb-0.5">Disubmit</p>
              <p className="text-slate-700 font-semibold">{fmtDate(mission.submitted_at)}</p>
            </div>
          )}
        </div>

        {/* Alasan ditolak */}
        {mission.status === "REJECTED" && mission.rejection_reason && (
          <div className="rounded-xl p-3 text-xs" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
            <span className="font-bold">Alasan ditolak:</span> {mission.rejection_reason}
          </div>
        )}

        {/* Bukti yang sudah ada */}
        {mission.proof_photo_url && mode === "view" && (
          <div>
            <p className="text-[10.5px] font-bold mb-1.5 uppercase tracking-widest" style={{ color: "#94a3b8" }}>Bukti Pengerjaan</p>
            <a href={mission.proof_photo_url} target="_blank" rel="noopener noreferrer">
              <img src={mission.proof_photo_url} alt="Bukti" className="w-full rounded-xl border" style={{ borderColor: "#e2e8f0", maxHeight: 280, objectFit: "cover" }} />
            </a>
            {mission.proof_note && <p className="text-xs text-slate-500 mt-2 italic">"{mission.proof_note}"</p>}
          </div>
        )}

        {/* Form submit bukti (assignee) */}
        {mode === "submit" && (
          <div className="space-y-3 rounded-2xl p-4" style={{ background: "#f5f7ff", border: "1px solid #e8ecf5" }}>
            <Field label="Upload Bukti Foto">
              <input type="file" accept="image/*" onChange={e => onPickFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-white" />
              {preview && <img src={preview} alt="Preview" className="mt-2 w-full rounded-xl border" style={{ borderColor: "#e2e8f0", maxHeight: 240, objectFit: "cover" }} />}
            </Field>
            <Field label="Catatan (opsional)">
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="contoh: sudah dikerjakan semua" />
            </Field>
          </div>
        )}

        {/* Form alasan tolak (reviewer) */}
        {mode === "reject" && (
          <Field label="Alasan Penolakan">
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Kenapa ditolak?" />
          </Field>
        )}
      </div>

      {/* Footer aksi */}
      <div className="px-6 pb-6 pt-4 flex gap-2.5" style={{ borderTop: "1px solid #f1f5f9" }}>
        {mode === "view" && (
          <>
            <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all"
              style={{ background: "#f1f5f9", color: "#64748b" }}>Tutup</button>
            {canSubmit && (
              <button onClick={() => setMode("submit")}
                className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg, #059669, #047857)", boxShadow: "0 4px 14px rgba(5,150,105,0.3)" }}>
                ✅ Selesaikan
              </button>
            )}
            {canDecide && (
              <>
                <button onClick={() => setMode("reject")} disabled={busy}
                  className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>❌ Tolak</button>
                <button onClick={() => decide("approve")} disabled={busy}
                  className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>{busy ? "..." : "✅ ACC"}</button>
              </>
            )}
          </>
        )}
        {mode === "submit" && (
          <>
            <button onClick={() => setMode("view")} disabled={busy} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all disabled:opacity-50"
              style={{ background: "#f1f5f9", color: "#64748b" }}>Kembali</button>
            <button onClick={submitProof} disabled={busy}
              className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>{busy ? "Mengirim..." : "📤 Kirim Bukti"}</button>
          </>
        )}
        {mode === "reject" && (
          <>
            <button onClick={() => setMode("view")} disabled={busy} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all disabled:opacity-50"
              style={{ background: "#f1f5f9", color: "#64748b" }}>Kembali</button>
            <button onClick={() => decide("reject")} disabled={busy}
              className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>{busy ? "..." : "Konfirmasi Tolak"}</button>
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ── Stat kecil ────────────────────────────────────────────────────────────────
function MiniStat({ icon, value, label, accent }: { icon: string; value: number; label: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 relative overflow-hidden" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-2xl" style={{ background: accent }} />
      <div className="pl-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg">{icon}</span>
          <span className="text-2xl font-black tabular-nums" style={{ color: "#0f172a" }}>{value}</span>
        </div>
        <p className="text-[11px] font-bold" style={{ color: "#64748b" }}>{label}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MissionsPage() {
  const { user } = useAuthUser();
  const roles: string[] = useMemo(
    () => (user?.roles?.length ? user.roles : user?.role ? [user.role] : []),
    [user]
  );
  const iCanAssign = canAssignMissions(roles);

  const [box, setBox] = useState<Box>("received");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Mission | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });

  const fetchMissions = async (b: Box) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/missions?box=${b}`);
      const data = await res.json();
      if (data.success) setMissions(data.data);
      else showToast(data.message ?? "Gagal memuat misi", "err");
    } catch { showToast("Gagal memuat misi", "err"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user) fetchMissions(box); /* eslint-disable-next-line */ }, [box, user]);

  const stats = useMemo(() => ({
    pending: missions.filter(m => m.status === "PENDING" || m.status === "IN_PROGRESS").length,
    review: missions.filter(m => m.status === "SUBMITTED").length,
    done: missions.filter(m => m.status === "APPROVED").length,
  }), [missions]);

  if (!user) {
    return <DashboardLayout><div className="p-8 text-sm text-slate-400">Memuat...</div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {showCreate && (
        <CreateMissionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchMissions(box); showToast("Misi berhasil dibuat 🎯", "ok"); }}
          showToast={showToast}
        />
      )}
      {detail && (
        <MissionDetailModal
          mission={detail} currentUser={{ id: user.id, roles }}
          onClose={() => setDetail(null)}
          onChanged={() => { setDetail(null); fetchMissions(box); }}
          showToast={showToast}
        />
      )}

      <div className="min-h-screen bg-[#F7F7F8]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.35)" }}>
                <svg style={{ width: 18, height: 18 }} fill="none" stroke="white" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Misi Pekerjaan</h1>
                <p className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>Tugas dari atasan — selesaikan, upload bukti, tunggu ACC</p>
              </div>
            </div>
            {iCanAssign && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95"
                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Beri Misi
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <MiniStat icon="⚙️" value={stats.pending} label="Sedang Berjalan" accent="linear-gradient(180deg,#60a5fa,#2563eb)" />
            <MiniStat icon="📤" value={stats.review} label="Menunggu ACC" accent="linear-gradient(180deg,#fbbf24,#d97706)" />
            <MiniStat icon="✅" value={stats.done} label="Selesai" accent="linear-gradient(180deg,#34d399,#059669)" />
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-2xl p-1.5" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="flex gap-1.5">
              {([
                { key: "received", label: "Misi Saya", emoji: "📥" },
                ...(iCanAssign ? [{ key: "assigned", label: "Misi Diberikan", emoji: "📌" }] : []),
              ] as { key: Box; label: string; emoji: string }[]).map(t => (
                <button key={t.key} onClick={() => setBox(t.key)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={box === t.key ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", boxShadow: "0 4px 12px rgba(15,12,41,0.25)" }
                                       : { background: "#f5f7ff", color: "#64748b" }}>
                  <span>{t.emoji}</span><span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {Array(4).fill(0).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 animate-pulse" style={{ border: "1px solid #f0f0f8" }}>
                  <div className="h-3.5 w-40 bg-slate-200 rounded mb-3" />
                  <div className="h-2.5 w-full bg-slate-100 rounded mb-2" />
                  <div className="h-2.5 w-24 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-2xl text-center py-16" style={{ border: "1px solid #f0f0f8" }}>
              <div className="text-4xl mb-3">🗒️</div>
              <p className="text-sm font-bold text-slate-600">
                {box === "received" ? "Belum ada misi untukmu" : "Belum ada misi yang kamu berikan"}
              </p>
              <p className="text-xs mt-1 text-slate-400">
                {box === "received" ? "Tugas dari atasan akan muncul di sini" : "Klik \"Beri Misi\" untuk mulai menugaskan"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map(m => (
                <MissionCard key={m.id} m={m} view={box} onOpen={() => setDetail(m)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.16,1,0.3,1); }
        .animate-scaleIn { animation: scaleIn 0.25s cubic-bezier(0.16,1,0.3,1); }
      `}</style>
    </DashboardLayout>
  );
}