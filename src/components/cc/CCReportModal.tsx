// src/components/cc/CCReportModal.tsx
"use client";

import { useState } from "react";
import {
  type CCReport, type CCPosting, CC_STATUS_META, CC_PLATFORMS,
  computeStatus, isoToLocalInput, localInputToIso, durationLabel,
} from "@/lib/ccReports";

interface Props {
  report: CCReport;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = "take" | "edit" | "posting";

export default function CCReportModal({ report, canManage, onClose, onChanged }: Props) {
  const status = report.status ?? computeStatus(report);
  const meta = CC_STATUS_META[status];
  const canPost = report.take_done && report.edit_done;

  const [tab, setTab] = useState<Tab>(
    !report.take_done ? "take" : !report.edit_done ? "edit" : "posting"
  );

  // ── Take state ──
  const [take, setTake] = useState({
    videographer: report.videographer ?? "",
    talent: report.talent ?? "",
    location: report.location ?? "",
    equipment: report.equipment ?? "",
    take_start: isoToLocalInput(report.take_start),
    take_end: isoToLocalInput(report.take_end),
    take_received_editor: isoToLocalInput(report.take_received_editor),
  });

  // ── Edit state ──
  const [edit, setEdit] = useState({
    editor_name: report.editor_name ?? "",
    editor_work: report.editor_work ?? "",
    edit_start: isoToLocalInput(report.edit_start),
    edit_end: isoToLocalInput(report.edit_end),
    ready_folder_link: report.ready_folder_link ?? "",
  });

  const [saving, setSaving] = useState(false);

  const patch = async (payload: Record<string, any>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cc-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) alert(json.error ?? "Gagal menyimpan");
      else onChanged();
    } finally {
      setSaving(false);
    }
  };

  const saveTake = (markDone: boolean) =>
    patch({
      videographer: take.videographer,
      talent: take.talent,
      location: take.location,
      equipment: take.equipment,
      take_start: localInputToIso(take.take_start),
      take_end: localInputToIso(take.take_end),
      take_received_editor: localInputToIso(take.take_received_editor),
      ...(markDone ? { take_done: true } : {}),
    });

  const saveEdit = (markDone: boolean) =>
    patch({
      editor_name: edit.editor_name,
      editor_work: edit.editor_work,
      edit_start: localInputToIso(edit.edit_start),
      edit_end: localInputToIso(edit.edit_end),
      ready_folder_link: edit.ready_folder_link,
      ...(markDone ? { edit_done: true } : {}),
    });

  const handleDelete = async () => {
    if (!confirm(`Hapus konten "${report.title}"? Semua data posting ikut terhapus.`)) return;
    const res = await fetch(`/api/cc-reports/${report.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      onChanged();
      onClose();
    } else alert(json.error ?? "Gagal menghapus");
  };

  const input = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/20";
  const label = "text-xs font-bold uppercase tracking-wide text-gray-400";

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-[#F7F7F8] w-full sm:max-w-2xl sm:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 bg-white border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-[#1a1a2e] truncate">{report.title}</h2>
            <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${meta.className}`}>
              {meta.label}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 bg-white border-b border-gray-100">
          {([
            ["take", "🎥 Take Video", report.take_done],
            ["edit", "✂️ Editing", report.edit_done],
            ["posting", "🚀 Posting", (report.postings?.length ?? 0) > 0],
          ] as [Tab, string, boolean][]).map(([key, text, done]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-xl py-2 text-xs sm:text-sm font-bold transition
                ${tab === key ? "bg-[#1a1a2e] text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >
              {text} {done && tab !== key ? "✓" : ""}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── TAKE ── */}
          {tab === "take" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Videographer">
                  <input className={input} value={take.videographer} onChange={(e) => setTake({ ...take, videographer: e.target.value })} />
                </Field>
                <Field label="Talent">
                  <input className={input} value={take.talent} onChange={(e) => setTake({ ...take, talent: e.target.value })} />
                </Field>
                <Field label="Tempat">
                  <input className={input} value={take.location} onChange={(e) => setTake({ ...take, location: e.target.value })} />
                </Field>
                <Field label="Alat yang Dipakai">
                  <input className={input} value={take.equipment} onChange={(e) => setTake({ ...take, equipment: e.target.value })} />
                </Field>
                <Field label="Mulai">
                  <input type="datetime-local" className={input} value={take.take_start} onChange={(e) => setTake({ ...take, take_start: e.target.value })} />
                </Field>
                <Field label="Selesai">
                  <input type="datetime-local" className={input} value={take.take_end} onChange={(e) => setTake({ ...take, take_end: e.target.value })} />
                </Field>
                <Field label="Diterima Editor">
                  <input type="datetime-local" className={input} value={take.take_received_editor} onChange={(e) => setTake({ ...take, take_received_editor: e.target.value })} />
                </Field>
                <div className="flex items-end">
                  <p className="text-xs text-gray-400">Durasi take: <b className="text-gray-600">{durationLabel(localInputToIso(take.take_start), localInputToIso(take.take_end))}</b></p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => saveTake(false)} disabled={saving} className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                  Simpan Draft
                </button>
                <button onClick={() => saveTake(true)} disabled={saving} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                  {report.take_done ? "Update & Tetap Selesai" : "Tandai Take Selesai ✓"}
                </button>
              </div>
            </div>
          )}

          {/* ── EDIT ── */}
          {tab === "edit" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nama Editor">
                  <input className={input} value={edit.editor_name} onChange={(e) => setEdit({ ...edit, editor_name: e.target.value })} />
                </Field>
                <Field label="Dikerjakan Editor (catatan)">
                  <input className={input} value={edit.editor_work} onChange={(e) => setEdit({ ...edit, editor_work: e.target.value })} />
                </Field>
                <Field label="Jam Mulai">
                  <input type="datetime-local" className={input} value={edit.edit_start} onChange={(e) => setEdit({ ...edit, edit_start: e.target.value })} />
                </Field>
                <Field label="Jam Selesai">
                  <input type="datetime-local" className={input} value={edit.edit_end} onChange={(e) => setEdit({ ...edit, edit_end: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Link Folder Siap Posting (Google Drive dll)">
                    <input className={input} placeholder="https://drive.google.com/..." value={edit.ready_folder_link} onChange={(e) => setEdit({ ...edit, ready_folder_link: e.target.value })} />
                  </Field>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => saveEdit(false)} disabled={saving} className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                  Simpan Draft
                </button>
                <button onClick={() => saveEdit(true)} disabled={saving} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
                  {report.edit_done ? "Update & Tetap Selesai" : "Tandai Edit Selesai ✓"}
                </button>
              </div>
            </div>
          )}

          {/* ── POSTING ── */}
          {tab === "posting" && (
            <PostingSection report={report} canPost={canPost} onChanged={onChanged} />
          )}
        </div>

        {/* Footer */}
        {canManage && (
          <div className="p-3 bg-white border-t border-gray-100">
            <button onClick={handleDelete} className="w-full rounded-xl py-2 text-sm font-bold text-red-600 hover:bg-red-50 transition">
              Hapus Konten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ── Sub-komponen posting: kelola banyak platform ──
function PostingSection({ report, canPost, onChanged }: { report: CCReport; canPost: boolean; onChanged: () => void }) {
  const [postings, setPostings] = useState<CCPosting[]>(report.postings ?? []);
  const [platform, setPlatform] = useState<string>("Instagram");
  const [adding, setAdding] = useState(false);

  const input = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#1a1a2e]/20";

  const reloadPostings = async () => {
    const res = await fetch(`/api/cc-reports/${report.id}/postings`);
    const json = await res.json();
    if (json.success) setPostings(json.postings);
    onChanged();
  };

  const addPosting = async () => {
    setAdding(true);
    try {
      const res = await fetch(`/api/cc-reports/${report.id}/postings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, posted_at: new Date().toISOString() }),
      });
      const json = await res.json();
      if (json.success) await reloadPostings();
      else alert(json.error ?? "Gagal menambah posting");
    } finally {
      setAdding(false);
    }
  };

  const updatePosting = async (p: CCPosting, patch: Partial<CCPosting>) => {
    await fetch(`/api/cc-reports/${report.id}/postings/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reloadPostings();
  };

  const deletePosting = async (p: CCPosting) => {
    if (!confirm(`Hapus posting ${p.platform}?`)) return;
    await fetch(`/api/cc-reports/${report.id}/postings/${p.id}`, { method: "DELETE" });
    await reloadPostings();
  };

  if (!canPost) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-700">
        Posting bisa dibuka setelah <b>Take Video</b> dan <b>Editing</b> dua-duanya ditandai selesai.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Add */}
      <div className="flex gap-2">
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input + " flex-1"}>
          {CC_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={addPosting} disabled={adding} className="rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-sm font-bold text-white hover:bg-[#2d2d4a] disabled:opacity-40">
          + Platform
        </button>
      </div>

      {postings.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-6">Belum ada posting. Tambah platform di atas.</p>
      ) : (
        postings.map((p) => (
          <div key={p.id} className="rounded-xl bg-white border border-gray-100 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-gray-800">{p.platform}</span>
              <button onClick={() => deletePosting(p)} className="text-xs font-bold text-red-500 hover:underline">Hapus</button>
            </div>
            <input
              className={input}
              placeholder="Link posting (https://...)"
              defaultValue={p.post_url ?? ""}
              onBlur={(e) => e.target.value !== (p.post_url ?? "") && updatePosting(p, { post_url: e.target.value })}
            />
            <input
              type="datetime-local"
              className={input}
              defaultValue={isoToLocalInput(p.posted_at)}
              onBlur={(e) => updatePosting(p, { posted_at: localInputToIso(e.target.value) })}
            />
            <div className="grid grid-cols-3 gap-2">
              {(["views", "likes", "comments"] as const).map((m) => (
                <div key={m}>
                  <label className="text-[10px] font-bold uppercase text-gray-400">{m === "views" ? "View" : m === "likes" ? "Like" : "Komen"}</label>
                  <input
                    type="number"
                    min={0}
                    className={input}
                    defaultValue={p[m]}
                    onBlur={(e) => Number(e.target.value) !== p[m] && updatePosting(p, { [m]: Number(e.target.value) } as Partial<CCPosting>)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}