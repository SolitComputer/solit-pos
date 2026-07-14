// src/components/cc/CCReportModal.tsx
"use client";

import { useState } from "react";
import {
  type CCReport, type CCPosting, type CCBrand,
  CC_STATUS_META, CC_PLATFORMS, PLATFORM_COLOR, CC_BRANDS, BRAND_META, DEFAULT_BRAND,
  computeStatus, canStartPosting, canFinish, isoToLocalInput, localInputToIso, durationLabel,
} from "@/lib/ccReports";
import { parsePostUrl, isAutoSyncPlatform, SYNC_STATUS_META, type SyncStatus } from "@/lib/ccMetrics";

interface Props {
  report: CCReport;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = "take" | "edit" | "posting";

const INPUT =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-gray-300 focus:ring-4 focus:ring-gray-900/5";

export default function CCReportModal({ report, canManage, onClose, onChanged }: Props) {
  const status = report.status ?? computeStatus(report);
  const meta = CC_STATUS_META[status];

  // ✅ Alur baru: posting kebuka HANYA setelah tahap Edit selesai.
  const canPost = canStartPosting(report);
  const finished = Boolean(report.posting_done);
  const readyToFinish = canFinish(report);

  const [tab, setTab] = useState<Tab>(
    report.edit_done ? "posting" : report.take_done ? "edit" : "take"
  );

  const [take, setTake] = useState({
    videographer: report.videographer ?? "",
    talent: report.talent ?? "",
    location: report.location ?? "",
    equipment: report.equipment ?? "",
    take_start: isoToLocalInput(report.take_start),
    take_end: isoToLocalInput(report.take_end),
    take_received_editor: isoToLocalInput(report.take_received_editor),
  });

  const [edit, setEdit] = useState({
    editor_name: report.editor_name ?? "",
    editor_work: report.editor_work ?? "",
    edit_start: isoToLocalInput(report.edit_start),
    edit_end: isoToLocalInput(report.edit_end),
    ready_folder_link: report.ready_folder_link ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState<CCBrand>(report.brand ?? DEFAULT_BRAND);

  const changeBrand = async (b: CCBrand) => {
    const prev = brand;
    setBrand(b);
    try {
      await patch({ brand: b });
    } catch {
      setBrand(prev);
    }
  };

  const patch = async (payload: Record<string, unknown>) => {
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

  const saveEdit = async (markDone: boolean) => {
    await patch({
      editor_name: edit.editor_name,
      editor_work: edit.editor_work,
      edit_start: localInputToIso(edit.edit_start),
      edit_end: localInputToIso(edit.edit_end),
      ready_folder_link: edit.ready_folder_link,
      ...(markDone ? { edit_done: true } : {}),
    });
    if (markDone) setTab("posting"); // ✅ langsung lempar ke posting
  };

  const toggleFinish = async () => {
    if (finished) {
      if (!confirm("Buka kembali konten ini? Status akan kembali ke 'Sudah Posting'.")) return;
      await patch({ posting_done: false });
    } else {
      await patch({ posting_done: true });
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Hapus konten "${report.title}"? Semua data posting ikut terhapus.`)) return;
    const res = await fetch(`/api/cc-reports/${report.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      onChanged();
      onClose();
    } else alert(json.error ?? "Gagal menghapus");
  };

  const steps = [
    { done: report.take_done, label: "Take" },
    { done: report.edit_done, label: "Edit" },
    { done: (report.postings?.length ?? 0) > 0, label: "Posting" },
    { done: finished, label: "Selesai" },
  ];
  const progress = (steps.filter((s) => s.done).length / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-gray-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-gray-200 sm:max-w-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black tracking-tight text-gray-900">{report.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
                  {meta.label}
                </span>

                {/* ✅ Brand tujuan — bisa diubah kapan saja */}
                <div className="relative">
                  <span
                    className="pointer-events-none absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                    style={{ background: BRAND_META[brand].color }}
                  />
                  <select
                    value={brand}
                    onChange={(e) => changeBrand(e.target.value as CCBrand)}
                    disabled={saving}
                    className="appearance-none rounded-md border border-gray-200 bg-white py-0.5 pl-6 pr-6 text-[11px] font-bold text-gray-700 outline-none transition focus:ring-2 focus:ring-gray-900/10 disabled:opacity-50"
                  >
                    {CC_BRANDS.map((b) => (
                      <option key={b} value={b}>{BRAND_META[b].label}</option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Tutup"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wide text-gray-400">
              {steps.map((s) => (
                <span key={s.label} className={s.done ? "text-emerald-600" : ""}>
                  {s.done ? "✓ " : ""}{s.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100 bg-gray-50/70 p-2">
          {([
            ["take", "🎥 Take", report.take_done, true],
            ["edit", "✂️ Editing", report.edit_done, true],
            ["posting", "🚀 Posting", (report.postings?.length ?? 0) > 0, canPost],
          ] as [Tab, string, boolean, boolean][]).map(([key, text, done, unlocked]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-xl py-2 text-xs font-bold transition sm:text-sm
                ${tab === key
                  ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200"
                  : unlocked
                    ? "text-gray-500 hover:bg-white/60"
                    : "text-gray-300 hover:bg-white/40"}`}
            >
              {!unlocked && "🔒 "}{text}{done && tab !== key ? " ✓" : ""}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50/40 p-5">
          {/* ── TAKE ── */}
          {tab === "take" && (
            <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-gray-100">
              {report.take_done && !report.edit_done && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  Take sudah selesai — sekarang <b>wajib lewat tahap Editing</b> dulu sebelum bisa posting.
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Videographer">
                  <input className={INPUT} value={take.videographer} onChange={(e) => setTake({ ...take, videographer: e.target.value })} />
                </Field>
                <Field label="Talent">
                  <input className={INPUT} value={take.talent} onChange={(e) => setTake({ ...take, talent: e.target.value })} />
                </Field>
                <Field label="Tempat">
                  <input className={INPUT} value={take.location} onChange={(e) => setTake({ ...take, location: e.target.value })} />
                </Field>
                <Field label="Alat yang Dipakai">
                  <input className={INPUT} value={take.equipment} onChange={(e) => setTake({ ...take, equipment: e.target.value })} />
                </Field>
                <Field label="Mulai">
                  <input type="datetime-local" className={INPUT} value={take.take_start} onChange={(e) => setTake({ ...take, take_start: e.target.value })} />
                </Field>
                <Field label="Selesai">
                  <input type="datetime-local" className={INPUT} value={take.take_end} onChange={(e) => setTake({ ...take, take_end: e.target.value })} />
                </Field>
                <Field label="Diterima Editor">
                  <input type="datetime-local" className={INPUT} value={take.take_received_editor} onChange={(e) => setTake({ ...take, take_received_editor: e.target.value })} />
                </Field>
                <div className="flex items-end">
                  <p className="text-xs text-gray-400">
                    Durasi take:{" "}
                    <b className="text-gray-700">
                      {durationLabel(localInputToIso(take.take_start), localInputToIso(take.take_end))}
                    </b>
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => saveTake(false)} disabled={saving}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40">
                  Simpan Draft
                </button>
                <button onClick={() => saveTake(true)} disabled={saving}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                  {report.take_done ? "Update & Tetap Selesai" : "Tandai Take Selesai ✓"}
                </button>
              </div>
            </div>
          )}

          {/* ── EDIT ── */}
          {tab === "edit" && (
            <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-gray-100">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-medium text-blue-800">
                Tahap <b>Editing</b> adalah gerbang menuju Posting. Selesaikan tahap ini untuk membuka tab Posting.
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Nama Editor">
                  <input className={INPUT} value={edit.editor_name} onChange={(e) => setEdit({ ...edit, editor_name: e.target.value })} />
                </Field>
                <Field label="Dikerjakan Editor (catatan)">
                  <input className={INPUT} value={edit.editor_work} onChange={(e) => setEdit({ ...edit, editor_work: e.target.value })} />
                </Field>
                <Field label="Jam Mulai">
                  <input type="datetime-local" className={INPUT} value={edit.edit_start} onChange={(e) => setEdit({ ...edit, edit_start: e.target.value })} />
                </Field>
                <Field label="Jam Selesai">
                  <input type="datetime-local" className={INPUT} value={edit.edit_end} onChange={(e) => setEdit({ ...edit, edit_end: e.target.value })} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Link Folder Siap Posting">
                    <input className={INPUT} placeholder="https://drive.google.com/..." value={edit.ready_folder_link}
                      onChange={(e) => setEdit({ ...edit, ready_folder_link: e.target.value })} />
                  </Field>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => saveEdit(false)} disabled={saving}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40">
                  Simpan Draft
                </button>
                <button onClick={() => saveEdit(true)} disabled={saving}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40">
                  {report.edit_done ? "Update & Tetap Selesai" : "Tandai Edit Selesai → Posting ✓"}
                </button>
              </div>
            </div>
          )}

          {/* ── POSTING ── */}
          {tab === "posting" && (
            <PostingSection
              report={report}
              canPost={canPost}
              finished={finished}
              readyToFinish={readyToFinish}
              saving={saving}
              onToggleFinish={toggleFinish}
              onChanged={onChanged}
            />
          )}
        </div>

        {/* Footer */}
        {canManage && (
          <div className="border-t border-gray-100 bg-white p-3">
            <button onClick={handleDelete}
              className="w-full rounded-xl py-2 text-sm font-bold text-red-600 transition hover:bg-red-50">
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
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ── Sub-komponen posting ─────────────────────────────────────────────────── */
function PostingSection({
  report, canPost, finished, readyToFinish, saving, onToggleFinish, onChanged,
}: {
  report: CCReport;
  canPost: boolean;
  finished: boolean;
  readyToFinish: boolean;
  saving: boolean;
  onToggleFinish: () => void;
  onChanged: () => void;
}) {
  const [postings, setPostings] = useState<CCPosting[]>(report.postings ?? []);
  const [platform, setPlatform] = useState<string>("Instagram");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const input =
    "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:ring-4 focus:ring-gray-900/5";

  const onUrlChange = (v: string) => {
    setUrl(v);
    const parsed = parsePostUrl(v);
    if (parsed && (CC_PLATFORMS as readonly string[]).includes(parsed.platform)) {
      setPlatform(parsed.platform);
    }
  };

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
        body: JSON.stringify({
          platform,
          post_url: url.trim() || null,
          posted_at: new Date().toISOString(),
        }),
      });
      const json = await res.json();

      if (!json.success) {
        alert(json.error ?? "Gagal menambah posting");
        return;
      }

      setUrl("");
      await reloadPostings();

      // ✅ error sync TIDAK lagi disembunyikan
      if (json.message && !json.synced) {
        alert(`Metrik tidak bisa ditarik otomatis:\n\n${json.message}\n\nSilakan isi View/Like/Komen manual.`);
      }
    } finally {
      setAdding(false);
    }
  };

  const updatePosting = async (p: CCPosting, patch: Partial<CCPosting>) => {
    const res = await fetch(`/api/cc-reports/${report.id}/postings/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    await reloadPostings();

    // ✅ kalau link diubah tapi sync gagal → kasih tau
    if ("post_url" in patch && json.message && !json.synced) {
      alert(`Metrik tidak bisa ditarik otomatis:\n\n${json.message}`);
    }
  };

  const syncOne = async (postingId: string) => {
    setSyncingId(postingId);
    try {
      const res = await fetch(`/api/cc-reports/${report.id}/postings/${postingId}/sync`, {
        method: "POST",
      });
      const json = await res.json();
      await reloadPostings();
      if (json.success && !json.synced) {
        alert(json.message ?? "Metrik tidak bisa ditarik otomatis.");
      }
    } finally {
      setSyncingId(null);
    }
  };

  const deletePosting = async (p: CCPosting) => {
    if (!confirm(`Hapus posting ${p.platform}?`)) return;
    await fetch(`/api/cc-reports/${report.id}/postings/${p.id}`, { method: "DELETE" });
    await reloadPostings();
  };

  // ⛔ Gerbang: harus lewat Editing dulu
  if (!canPost) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="mb-1 font-black">🔒 Posting masih terkunci</p>
        <p>
          Tahap <b>Editing</b> wajib ditandai selesai dulu.
          {report.take_done
            ? " Take sudah beres — tinggal serahkan ke editor dan selesaikan tab Editing."
            : " Kalau konten ini tidak butuh take, langsung isi tab Editing saja."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Banner selesai */}
      {finished && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
          <div className="text-xs font-medium text-emerald-800">
            <b>Konten sudah ditandai selesai.</b>
            {report.posting_done_at && (
              <span className="ml-1 text-emerald-600">
                {new Date(report.posting_done_at).toLocaleString("id-ID")}
              </span>
            )}
          </div>
          <button
            onClick={onToggleFinish}
            disabled={saving}
            className="flex-shrink-0 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
          >
            Buka Lagi
          </button>
        </div>
      )}

      {/* Tambah posting */}
      {!finished && (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-gray-100">
          <input
            className={input}
            placeholder="Tempel link posting (YouTube / IG / TikTok / Shopee…)"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
          />
          <div className="flex gap-2">
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={input + " flex-1"}>
              {CC_PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button
              onClick={addPosting}
              disabled={adding}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:opacity-40"
            >
              {adding ? "Menarik…" : "+ Tambah"}
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            YouTube · Instagram · TikTok → metrik ditarik <b>otomatis</b> dari link. Platform lain diisi manual.
          </p>
        </div>
      )}

      {postings.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Belum ada posting. Tambah link di atas.</p>
      ) : (
        postings.map((p) => {
          const auto = isAutoSyncPlatform(p.platform);
          const st = (p.sync_status ?? "PENDING") as SyncStatus;
          const sm = SYNC_STATUS_META[st];
          const busy = syncingId === p.id;

          return (
            <div key={p.id} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-gray-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-black text-gray-800">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: PLATFORM_COLOR[p.platform] ?? "#6b7280" }}
                  />
                  {p.platform}
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${sm.className}`}>
                    {sm.label}
                  </span>
                </span>
                {!finished && (
                  <div className="flex items-center gap-2">
                    {auto && p.post_url && (
                      <button
                        onClick={() => syncOne(p.id)}
                        disabled={busy}
                        className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
                      >
                        {busy ? "Sync…" : "↻ Sync"}
                      </button>
                    )}
                    {!finished && (
                      <button onClick={() => deletePosting(p)} className="text-xs font-bold text-red-500 hover:underline">
                        Hapus
                      </button>
                    )}
                  </div>
                )}
              </div>

              {p.sync_error && st !== "OK" && (
                <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                  {p.sync_error}
                </p>
              )}

              <input
                className={input}
                placeholder="Link posting (https://...)"
                defaultValue={p.post_url ?? ""}
                disabled={finished}
                onBlur={(e) =>
                  e.target.value !== (p.post_url ?? "") && updatePosting(p, { post_url: e.target.value })
                }
              />
              <input
                type="datetime-local"
                className={input}
                defaultValue={isoToLocalInput(p.posted_at)}
                disabled={finished}
                onBlur={(e) => updatePosting(p, { posted_at: localInputToIso(e.target.value) })}
              />

              <div className="grid grid-cols-3 gap-2">
                {(["views", "likes", "comments"] as const).map((mk) => (
                  <div key={mk}>
                    <label className="text-[10px] font-bold uppercase text-gray-400">
                      {mk === "views" ? "View" : mk === "likes" ? "Like" : "Komen"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      className={input}
                      /* ✅ platform auto → readonly (diisi API). Manual → boleh edit walau selesai. */
                      disabled={auto && st === "OK"}
                      title={auto && st === "OK" ? "Diisi otomatis dari API — klik ↻ Sync untuk update" : undefined}
                      defaultValue={p[mk]}
                      key={`${mk}-${p[mk]}-${p.last_synced_at ?? ""}`}
                      onBlur={(e) =>
                        Number(e.target.value) !== p[mk] &&
                        updatePosting(p, { [mk]: Number(e.target.value) } as Partial<CCPosting>)
                      }
                    />
                  </div>
                ))}
              </div>

              {p.last_synced_at && (
                <p className="text-[10px] text-gray-400">
                  Sync terakhir: {new Date(p.last_synced_at).toLocaleString("id-ID")}
                </p>
              )}
            </div>
          );
        })
      )}

      {/* ✅ Tombol SELESAI */}
      {!finished && (
        <button
          onClick={onToggleFinish}
          disabled={!readyToFinish || saving}
          className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
        >
          {readyToFinish
            ? "Tandai Konten Selesai ✓"
            : "Tambah minimal 1 posting untuk menyelesaikan"}
        </button>
      )}
    </div>
  );
}