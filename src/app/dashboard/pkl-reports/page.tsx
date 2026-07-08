"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ── Types ─────────────────────────────────────────────────────────────────────
type UserRole = string;

type PKLReport = {
    id: string;
    user_id: string;
    division: string;
    report_date: string;
    title: string;
    description: string;
    status: "SUBMITTED" | "REVIEWED" | "REVISION";
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    users?: { id: string; name: string; role: string };
    reviewer?: { id: string; name: string; role: string } | null;
    created_by_admin?: string | null;
};

type PKLUser = { id: string; name: string; role: string };

const FULL_ACCESS = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const KEPALA_ROLES = [
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
];

const DIVISIONS = [
    { id: "MARKETING", label: "Marketing", emoji: "📣", color: "bg-pink-100 text-pink-700 border-pink-200" },
    { id: "SALES", label: "Sales", emoji: "🛒", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { id: "PENYEDIA_BARANG", label: "Penyedia Barang", emoji: "📦", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { id: "TEKNISI", label: "Teknisi", emoji: "🔧", color: "bg-orange-100 text-orange-700 border-orange-200" },
    { id: "ONPOINT", label: "Onpoint", emoji: "🎯", color: "bg-blue-100 text-blue-700 border-blue-200" },
    { id: "SOTECH", label: "Sotech", emoji: "💻", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    { id: "UMUM", label: "Umum", emoji: "📋", color: "bg-gray-100 text-gray-700 border-gray-200" },
];

const STATUS_CONFIG = {
    SUBMITTED: { label: "Terkirim", emoji: "📤", bg: "bg-blue-100", color: "text-blue-700", border: "border-blue-200" },
    REVIEWED: { label: "Disetujui", emoji: "✅", bg: "bg-emerald-100", color: "text-emerald-700", border: "border-emerald-200" },
    REVISION: { label: "Revisi", emoji: "🔄", bg: "bg-amber-100", color: "text-amber-700", border: "border-amber-200" },
};

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// ── Shared style tokens (biar konsisten & DRY) ────────────────────────────────
const CARD_STYLE = {
    border: "1px solid #eef0f6",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 14px 32px -16px rgba(15,23,42,0.14)",
} as const;
const NAVY_GRADIENT = "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)";
const NAVY_SHADOW = "0 8px 22px -6px rgba(15,12,41,0.45)";

// ── Helpers ───────────────────────────────────────────────────────────────────
function isFullAccess(role?: string) { return !!role && FULL_ACCESS.includes(role); }
function isKepala(role?: string) { return !!role && KEPALA_ROLES.includes(role); }
function isPKL(role?: string) { return !!role && (role === "PKL" || role.startsWith("PKL_") || role.startsWith("PKL-")); }
function canAccessPage(role?: string) { return isFullAccess(role) || isKepala(role) || isPKL(role); }
function canReview(role?: string) { return isFullAccess(role) || isKepala(role); }
function canAddManual(role?: string) { return isFullAccess(role); }

function initials(name: string) {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function pad2(n: number) { return String(n).padStart(2, "0"); }
function getWIBToday() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function formatDate(iso: string) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatDateShort(iso: string) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function getDivisionInfo(id: string) {
    return DIVISIONS.find(d => d.id === id) ?? { id, label: id, emoji: "📋", color: "bg-gray-100 text-gray-700 border-gray-200" };
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, gradient, tint, loading }: {
    icon: string; value: number; label: string; gradient: string; tint: string; loading: boolean;
}) {
    return (
        <div className="group relative bg-white rounded-2xl p-4 overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
            style={CARD_STYLE}>
            {/* soft corner glow */}
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-[0.10] transition-opacity duration-300 group-hover:opacity-20"
                style={{ background: gradient }} />
            <div className="relative flex items-start justify-between mb-3.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[15px] leading-none"
                    style={{ background: tint }}>
                    {icon}
                </div>
            </div>
            <p className="relative text-[26px] font-black text-[#0f172a] tabular-nums leading-none">
                {loading
                    ? <span className="inline-block w-9 h-7 bg-[#f1f5f9] rounded-lg animate-pulse" />
                    : value}
            </p>
            <p className="relative text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] mt-2">{label}</p>
        </div>
    );
}

// ── Modal: Tambah/Edit Laporan ────────────────────────────────────────────────
function ReportFormModal({
    currentUser,
    editData,
    prefillDate,
    prefillDivision,
    prefillUserId,
    allPKLUsers,
    onClose,
    onSaved,
}: {
    currentUser: any;
    editData?: PKLReport | null;
    prefillDate?: string | null;
    prefillDivision?: string;
    prefillUserId?: string;
    allPKLUsers?: PKLUser[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const isEdit = !!editData;
    const isAdminAdd = canAddManual(currentUser?.role) && !!prefillUserId && prefillUserId !== currentUser?.id;
    const isPKLUser = isPKL(currentUser?.role);

    const [form, setForm] = useState({
        report_date: editData?.report_date ?? prefillDate ?? getWIBToday(),
        division: editData?.division ?? prefillDivision ?? DIVISIONS[0].id,
        title: editData?.title ?? "",
        description: editData?.description ?? "",
        pkl_user_id: prefillUserId ?? currentUser?.id ?? "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (!form.description.trim()) { setError("Deskripsi laporan wajib diisi"); return; }
        if (!form.report_date) { setError("Tanggal laporan wajib diisi"); return; }
        setSaving(true); setError("");

        try {
            let body: Record<string, any>;
            let method = "POST";
            let url = "/api/pkl-reports";

            if (isEdit) {
                method = "PATCH";
                body = { id: editData!.id, title: form.title, description: form.description };
            } else if (isAdminAdd) {
                body = {
                    action: "admin_add",
                    pkl_user_id: form.pkl_user_id,
                    division: form.division,
                    report_date: form.report_date,
                    title: form.title || `Laporan ${form.report_date}`,
                    description: form.description,
                };
            } else {
                body = {
                    division: form.division,
                    report_date: form.report_date,
                    title: form.title || `Laporan ${form.report_date}`,
                    description: form.description,
                };
            }

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal menyimpan"); return; }
            onSaved(); onClose();
        } catch { setError("Gagal menyimpan"); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#0f0c29]/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">
                {/* Header */}
                <div className="relative overflow-hidden px-6 py-5 flex items-start justify-between flex-shrink-0"
                    style={{ background: NAVY_GRADIENT }}>
                    <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full blur-3xl opacity-30"
                        style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
                    <div className="relative">
                        <p className="font-black text-white text-base tracking-tight">
                            {isEdit ? "✏️ Edit Laporan Kerja" : isAdminAdd ? "➕ Tambah Laporan (Admin)" : "📝 Buat Laporan Kerja"}
                        </p>
                        <p className="text-xs text-white/55 mt-1">
                            {isEdit ? "Update isi laporan kerja PKL" : "Catat kegiatan kerja harian PKL"}
                        </p>
                    </div>
                    <button onClick={onClose} className="relative w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {error && (
                        <div className="bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                            <span>⚠️</span>{error}
                        </div>
                    )}

                    {/* Pilih PKL — admin only */}
                    {canAddManual(currentUser?.role) && !isEdit && allPKLUsers && allPKLUsers.length > 0 && (
                        <div>
                            <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">
                                PKL yang dimasukkan laporannya
                            </label>
                            <select
                                value={form.pkl_user_id}
                                onChange={e => setForm(f => ({ ...f, pkl_user_id: e.target.value }))}
                                className="w-full h-11 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition-all"
                            >
                                <option value="">— Pilih PKL —</option>
                                {allPKLUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Divisi */}
                    {!isEdit && (
                        <div>
                            <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">Divisi Penempatan</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {DIVISIONS.map(div => (
                                    <button
                                        key={div.id}
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, division: div.id }))}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all"
                                        style={form.division === div.id
                                            ? { background: NAVY_GRADIENT, color: "#fff", borderColor: "transparent", boxShadow: NAVY_SHADOW }
                                            : { background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}
                                    >
                                        <span>{div.emoji}</span>
                                        <span>{div.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tanggal */}
                    {!isEdit && (
                        <div>
                            <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">Tanggal Laporan</label>
                            <input
                                type="date"
                                value={form.report_date}
                                max={getWIBToday()}
                                onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))}
                                className="w-full h-11 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition-all"
                            />
                        </div>
                    )}

                    {/* Judul */}
                    <div>
                        <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">
                            Judul <span className="text-[#cbd5e1] font-normal normal-case">(opsional)</span>
                        </label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder={`Contoh: Laporan Kerja ${form.report_date}`}
                            className="w-full h-11 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition-all"
                        />
                    </div>

                    {/* Deskripsi */}
                    <div>
                        <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">
                            Deskripsi Kegiatan Kerja <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={6}
                            placeholder={`Ceritakan kegiatan yang dilakukan hari ini:\n- Tugas apa yang dikerjakan\n- Hasil yang dicapai\n- Kendala yang dihadapi (jika ada)\n- Hal yang dipelajari`}
                            className="w-full border border-[#e8ecf5] rounded-xl px-3 py-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition-all resize-none leading-relaxed"
                        />
                        <p className="text-[10px] text-[#94a3b8] mt-1">
                            {form.description.length} karakter
                        </p>
                    </div>

                    {/* Preview info */}
                    {form.report_date && form.description && (
                        <div className="bg-[#fafbff] border border-[#f0f0f8] rounded-2xl px-4 py-3">
                            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Preview</p>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${getDivisionInfo(form.division).color}`}>
                                    {getDivisionInfo(form.division).emoji} {getDivisionInfo(form.division).label}
                                </span>
                                <span className="text-[10px] text-[#94a3b8]">{formatDateShort(form.report_date)}</span>
                            </div>
                            <p className="text-xs text-[#64748b] line-clamp-2">{form.description}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#f1f5f9] flex-shrink-0 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-11 bg-[#f1f5f9] text-[#64748b] rounded-xl text-sm font-semibold hover:bg-[#e2e8f0] transition-all">
                        Batal
                    </button>
                    <button
                        onClick={save}
                        disabled={saving || !form.description.trim()}
                        className="flex-1 h-11 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        style={{ background: NAVY_GRADIENT, boxShadow: NAVY_SHADOW }}
                    >
                        {saving
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</>
                            : isEdit ? "💾 Simpan Perubahan" : "📤 Kirim Laporan"
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Modal: Review Laporan ─────────────────────────────────────────────────────
function ReviewModal({
    report,
    currentUser,
    onClose,
    onSaved,
}: {
    report: PKLReport;
    currentUser: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [note, setNote] = useState(report.review_note ?? "");
    const [status, setStatus] = useState<"REVIEWED" | "REVISION">("REVIEWED");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setSaving(true); setError("");
        try {
            const res = await fetch("/api/pkl-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "review", report_id: report.id, review_note: note, status }),
            });
            const d = await res.json();
            if (!d.success) { setError(d.message || "Gagal"); return; }
            onSaved(); onClose();
        } catch { setError("Gagal menyimpan"); }
        finally { setSaving(false); }
    };

    const div = getDivisionInfo(report.division);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#0f0c29]/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">
                <div className="relative overflow-hidden px-6 py-5 flex items-start justify-between flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}>
                    <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full blur-3xl opacity-30"
                        style={{ background: "radial-gradient(circle, #a78bfa, transparent 70%)" }} />
                    <div className="relative">
                        <p className="font-black text-white text-base tracking-tight">🔍 Review Laporan</p>
                        <p className="text-xs text-white/70 mt-1">{report.users?.name ?? "—"} · {formatDateShort(report.report_date)}</p>
                    </div>
                    <button onClick={onClose} className="relative w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {error && <div className="bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-xs px-4 py-3 rounded-xl">⚠️ {error}</div>}

                    {/* Isi laporan */}
                    <div className="bg-[#fafbff] border border-[#f0f0f8] rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${div.color}`}>
                                {div.emoji} {div.label}
                            </span>
                            <span className="text-xs text-[#94a3b8]">{formatDate(report.report_date)}</span>
                        </div>
                        {report.title && <p className="font-bold text-[#0f172a] text-sm mb-1">{report.title}</p>}
                        <p className="text-sm text-[#475569] leading-relaxed whitespace-pre-line">{report.description}</p>
                    </div>

                    {/* Status review */}
                    <div>
                        <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Status Review</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setStatus("REVIEWED")}
                                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold border transition-all ${status === "REVIEWED"
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                                    : "bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f8fafc]"
                                    }`}>
                                <span>✅</span> Disetujui
                            </button>
                            <button type="button" onClick={() => setStatus("REVISION")}
                                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold border transition-all ${status === "REVISION"
                                    ? "bg-amber-500 text-white border-amber-500 shadow-md"
                                    : "bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f8fafc]"
                                    }`}>
                                <span>🔄</span> Perlu Revisi
                            </button>
                        </div>
                    </div>

                    {/* Catatan reviewer */}
                    <div>
                        <label className="block text-xs font-bold text-[#94a3b8] uppercase tracking-wide mb-1.5">
                            Catatan Review <span className="text-[#cbd5e1] font-normal normal-case">(opsional)</span>
                        </label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={3}
                            placeholder="Tambahkan masukan, arahan, atau catatan untuk PKL ini..."
                            className="w-full border border-[#e8ecf5] rounded-xl px-3 py-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-[#f1f5f9] flex gap-3 flex-shrink-0">
                    <button onClick={onClose} className="flex-1 h-11 bg-[#f1f5f9] text-[#64748b] rounded-xl text-sm font-semibold hover:bg-[#e2e8f0] transition-all">Batal</button>
                    <button onClick={submit} disabled={saving}
                        className="flex-1 h-11 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 8px 22px -6px rgba(124,58,237,0.5)" }}>
                        {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Menyimpan...</> : "✔️ Simpan Review"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Modal: Detail Laporan ─────────────────────────────────────────────────────
function ReportDetailModal({
    report,
    currentUser,
    onClose,
    onEdit,
    onReview,
    onDelete,
}: {
    report: PKLReport;
    currentUser: any;
    onClose: () => void;
    onEdit: () => void;
    onReview: () => void;
    onDelete: () => void;
}) {
    const div = getDivisionInfo(report.division);
    const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.SUBMITTED;
    const isOwner = currentUser?.id === report.user_id;
    const canEdit = isPKL(currentUser?.role) && isOwner && report.status !== "REVIEWED";
    const canDel = isOwner || isFullAccess(currentUser?.role);
    const canDoReview = canReview(currentUser?.role);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#0f0c29]/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-scaleIn">
                <div className="relative overflow-hidden px-6 py-5 flex items-start justify-between flex-shrink-0"
                    style={{ background: NAVY_GRADIENT }}>
                    <div className="absolute -top-10 -right-6 w-40 h-40 rounded-full blur-3xl opacity-30"
                        style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
                    <div className="relative">
                        <p className="font-black text-white text-base tracking-tight">📄 Detail Laporan</p>
                        <p className="text-xs text-white/60 mt-1">
                            {report.users?.name ?? "—"} · {formatDateShort(report.report_date)}
                        </p>
                    </div>
                    <button onClick={onClose} className="relative w-8 h-8 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/15 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {/* Meta */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${div.color}`}>
                            {div.emoji} {div.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${status.bg} ${status.color} ${status.border}`}>
                            {status.emoji} {status.label}
                        </span>
                        {report.created_by_admin && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                                🔒 Input Admin
                            </span>
                        )}
                    </div>

                    {/* Tanggal */}
                    <div className="bg-[#fafbff] rounded-xl px-4 py-3">
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-0.5">Tanggal</p>
                        <p className="text-sm font-bold text-[#0f172a]">{formatDate(report.report_date)}</p>
                    </div>

                    {/* Judul */}
                    {report.title && (
                        <div>
                            <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">Judul</p>
                            <p className="text-sm font-bold text-[#0f172a]">{report.title}</p>
                        </div>
                    )}

                    {/* Deskripsi */}
                    <div>
                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Deskripsi Kegiatan</p>
                        <div className="bg-white border border-[#f0f0f8] rounded-xl px-4 py-3">
                            <p className="text-sm text-[#334155] leading-relaxed whitespace-pre-line">{report.description}</p>
                        </div>
                    </div>

                    {/* Review note */}
                    {report.review_note && (
                        <div className={`rounded-xl px-4 py-3 border ${report.status === "REVIEWED" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${report.status === "REVIEWED" ? "text-emerald-600" : "text-amber-600"}`}>
                                💬 Catatan Reviewer
                                {report.reviewer && <span className="font-normal normal-case ml-1">— {report.reviewer.name}</span>}
                            </p>
                            <p className="text-sm text-[#334155] leading-relaxed">{report.review_note}</p>
                        </div>
                    )}

                    {/* Info waktu */}
                    <div className="text-[10px] text-[#94a3b8] space-y-0.5">
                        <p>Dibuat: {new Date(report.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
                        {report.reviewed_at && <p>Direview: {new Date(report.reviewed_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-[#f1f5f9] flex gap-2 flex-shrink-0 flex-wrap">
                    {canDel && (
                        <button onClick={onDelete}
                            className="h-10 px-4 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-bold hover:bg-red-100 transition-all">
                            🗑️ Hapus
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={onEdit}
                            className="h-10 px-4 bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] rounded-xl text-xs font-bold hover:bg-[#e2e8f0] transition-all">
                            ✏️ Edit
                        </button>
                    )}
                    {canDoReview && (
                        <button onClick={onReview}
                            className="flex-1 h-10 text-white rounded-xl text-xs font-bold hover:opacity-90 transition-all active:scale-[0.98]"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 6px 18px -6px rgba(124,58,237,0.5)" }}>
                            🔍 Review Laporan
                        </button>
                    )}
                    {!canDoReview && !canEdit && (
                        <button onClick={onClose} className="flex-1 h-10 bg-[#f1f5f9] text-[#64748b] rounded-xl text-xs font-semibold hover:bg-[#e2e8f0] transition-all">
                            Tutup
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PKLReportsPage() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [reports, setReports] = useState<PKLReport[]>([]);
    const [pklUsers, setPKLUsers] = useState<PKLUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    function getDefaultDivision(role?: string): string {
        if (!role) return "ALL";
        const PKL_ROLE_DIVISION_MAP: Record<string, string> = {
            PKL_MARKETING: "MARKETING",
            PKL_SALES: "SALES",
            PKL_PENYEDIA_BARANG: "PENYEDIA_BARANG",
            PKL_TEKNISI: "TEKNISI",
            PKL_ONPOINT: "ONPOINT",
            PKL_SOTECH: "SOTECH",
            PKL_KONTEN: "MARKETING",
            KEPALA_MARKETING: "MARKETING",
            KEPALA_SALES: "SALES",
            KEPALA_PENYEDIA_BARANG: "PENYEDIA_BARANG",
            KEPALA_TEKNISI: "TEKNISI",
            KEPALA_ONPOINT: "ONPOINT",
            KEPALA_SOTECH: "SOTECH",
        };
        return PKL_ROLE_DIVISION_MAP[role] ?? "ALL";
    }

    const [activeDivision, setActiveDivision] = useState<string>("ALL");
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [filterPKL, setFilterPKL] = useState<string>("ALL");
    const [filterMonth, setFilterMonth] = useState<string>(() => getWIBToday().slice(0, 7));
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // Modal states
    const [showForm, setShowForm] = useState(false);
    const [showReview, setShowReview] = useState(false);
    const [showDetail, setShowDetail] = useState(false);
    const [selectedReport, setSelectedReport] = useState<PKLReport | null>(null);
    const [editReport, setEditReport] = useState<PKLReport | null>(null);
    const [prefillDate, setPrefillDate] = useState<string | null>(null);
    const [filterDate, setFilterDate] = useState<string | null>(null);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const fetchReports = useCallback(async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (activeDivision !== "ALL") params.set("division", activeDivision);
            if (filterStatus !== "ALL") params.set("status", filterStatus);
            if (filterPKL !== "ALL") params.set("pkl_user_id", filterPKL);
            if (filterDate) {
                params.set("date_from", filterDate);
                params.set("date_to", filterDate);
            } else if (filterMonth) {
                params.set("date_from", `${filterMonth}-01`);
                const [y, m] = filterMonth.split("-").map(Number);
                const lastDay = new Date(y, m, 0).getDate();
                params.set("date_to", `${filterMonth}-${pad2(lastDay)}`);
            }
            const res = await fetch(`/api/pkl-reports?${params}`);
            const d = await res.json();
            if (d.success) { setReports(d.data || []); setTotalCount(d.count ?? 0); }
        } finally { setLoading(false); }
    }, [currentUser, activeDivision, filterStatus, filterPKL, filterMonth, filterDate]);

    const KEPALA_PKL_ROLE_MAP: Record<string, string> = {
        KEPALA_MARKETING: "PKL_MARKETING",
        KEPALA_SALES: "PKL_SALES",
        KEPALA_PENYEDIA_BARANG: "PKL_PENYEDIA_BARANG",
        KEPALA_TEKNISI: "PKL_TEKNISI",
        KEPALA_ONPOINT: "PKL_ONPOINT",
        KEPALA_SOTECH: "PKL_SOTECH",
    };

    const fetchPKLUsers = useCallback(async () => {
        const res = await fetch("/api/attendance/users");
        const d = await res.json();
        if (d.success) {
            const allPKL = (d.data || []).filter((u: PKLUser) =>
                u.role === "PKL" || u.role.startsWith("PKL_") || u.role.startsWith("PKL-")
            );
            if (isKepala(currentUser?.role)) {
                const allowedRole = KEPALA_PKL_ROLE_MAP[currentUser.role];
                setPKLUsers(allowedRole ? allPKL.filter((u: PKLUser) => u.role === allowedRole) : []);
            } else {
                setPKLUsers(allPKL);
            }
        }
    }, [currentUser?.role]);

    useEffect(() => {
        getCurrentUserClient().then(u => {
            setCurrentUser(u);
            if (u?.role) {
                const defaultDiv = getDefaultDivision(u.role);
                setActiveDivision(defaultDiv);
            }
        });
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        fetchReports();
        if (isFullAccess(currentUser.role) || isKepala(currentUser.role)) fetchPKLUsers();
    }, [currentUser, fetchReports, fetchPKLUsers]);

    // ── Delete ─────────────────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        if (!confirm("Hapus laporan ini?")) return;
        const res = await fetch(`/api/pkl-reports?id=${id}`, { method: "DELETE" });
        const d = await res.json();
        if (d.success) { setShowDetail(false); fetchReports(); }
        else alert(d.message || "Gagal menghapus");
    };

    // ── Derived stats ──────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const submitted = reports.filter(r => r.status === "SUBMITTED").length;
        const reviewed = reports.filter(r => r.status === "REVIEWED").length;
        const revision = reports.filter(r => r.status === "REVISION").length;
        const uniquePKL = new Set(reports.map(r => r.user_id)).size;
        return { total: reports.length, submitted, reviewed, revision, uniquePKL };
    }, [reports]);

    // ── Group by PKL user (untuk tampilan ringkasan) ───────────────────────
    const reportsByPKL = useMemo(() => {
        const map: Record<string, PKLReport[]> = {};
        reports.forEach(r => {
            const uid = r.user_id;
            if (!map[uid]) map[uid] = [];
            map[uid].push(r);
        });
        return map;
    }, [reports]);

    // ── Access guard ───────────────────────────────────────────────────────
    if (currentUser && !canAccessPage(currentUser.role)) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="w-16 h-16 rounded-2xl bg-[#fff1f2] flex items-center justify-center mb-4">
                        <span className="text-3xl">🚫</span>
                    </div>
                    <p className="text-base font-bold text-[#334155]">Akses Ditolak</p>
                    <p className="text-sm text-[#94a3b8] mt-1">Halaman ini hanya untuk PKL dan pemantau divisi</p>
                </div>
            </DashboardLayout>
        );
    }

    const isPKLUser = isPKL(currentUser?.role);
    const isAdminUser = isFullAccess(currentUser?.role);
    const isKepalaUser = isKepala(currentUser?.role);

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-[#F7F7F8]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5 animate-fadeIn">

                    {/* ── Hero Header ── */}
                    <div className="relative overflow-hidden rounded-3xl px-5 sm:px-7 py-6 sm:py-7"
                        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 55%, #241a5c 100%)" }}>
                        {/* decorative glows */}
                        <div className="absolute -top-16 -right-8 w-64 h-64 rounded-full blur-3xl opacity-30 pointer-events-none"
                            style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
                        <div className="absolute -bottom-24 left-8 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
                            style={{ background: "radial-gradient(circle, #3b82f6, transparent 70%)" }} />

                        <div className="relative flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/10 backdrop-blur-sm ring-1 ring-white/15">
                                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 14l9-5-9-5-9 5 9 5z" />
                                        <path d="M5 11.5V17c0 1.5 3 3 7 3s7-1.5 7-3v-5.5" />
                                    </svg>
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white truncate">
                                        Laporan Kerja PKL
                                    </h1>
                                    <p className="text-xs sm:text-[13px] text-white/55 mt-0.5">
                                        {isPKLUser
                                            ? "Buat dan pantau laporan kerja harianmu"
                                            : isKepalaUser
                                                ? `Pantau laporan kerja PKL divisi ${getDivisionInfo(activeDivision).label} · ${stats.uniquePKL} PKL aktif`
                                                : `Pantau laporan kerja ${stats.uniquePKL} PKL aktif`}
                                    </p>
                                </div>
                            </div>
                            {(isPKLUser || isAdminUser) && (
                                <button
                                    onClick={() => { setEditReport(null); setPrefillDate(null); setShowForm(true); }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[#1a1545] bg-white px-5 py-2.5 rounded-xl hover:bg-white/90 transition-all active:scale-[0.98] shadow-lg shadow-black/20"
                                >
                                    ➕ {isPKLUser ? "Buat Laporan" : "Tambah Manual"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Stat Cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard icon="📋" value={stats.total} label="Total Laporan" loading={loading} gradient="linear-gradient(135deg, #94a3b8, #475569)" tint="#f1f5f9" />
                        <StatCard icon="📤" value={stats.submitted} label="Terkirim" loading={loading} gradient="linear-gradient(135deg, #60a5fa, #2563eb)" tint="#eff6ff" />
                        <StatCard icon="✅" value={stats.reviewed} label="Disetujui" loading={loading} gradient="linear-gradient(135deg, #34d399, #059669)" tint="#ecfdf5" />
                        <StatCard icon="🔄" value={stats.revision} label="Perlu Revisi" loading={loading} gradient="linear-gradient(135deg, #fbbf24, #d97706)" tint="#fffbeb" />
                    </div>

                    {/* ── Filter Bar ── */}
                    <div className="bg-white rounded-2xl overflow-hidden" style={CARD_STYLE}>

                        {/* Header strip — toggle di mobile */}
                        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5" style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                            <button
                                onClick={() => setShowMobileFilters(!showMobileFilters)}
                                className="sm:hidden flex items-center gap-2 text-sm font-bold text-[#334155]"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                Filter & Pencarian
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    className={`transition-transform duration-300 ${showMobileFilters ? "rotate-180" : ""}`}>
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                            <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-[#334155]">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                                </svg>
                                Filter & Pencarian
                            </div>
                        </div>

                        <div className={`px-5 sm:px-6 py-5 space-y-4 ${showMobileFilters ? "block" : "hidden sm:block"}`}>

                            {/* Filter divisi — chip scrollable */}
                            {!isPKLUser && !isKepalaUser && (
                                <div>
                                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-2">Filter Divisi</p>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        <button
                                            onClick={() => setActiveDivision("ALL")}
                                            className="px-4 py-2 rounded-xl text-xs font-bold transition-all border flex-shrink-0"
                                            style={activeDivision === "ALL"
                                                ? { background: NAVY_GRADIENT, color: "#fff", borderColor: "transparent", boxShadow: NAVY_SHADOW }
                                                : { background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}
                                        >
                                            🌐 Semua Divisi
                                        </button>
                                        {DIVISIONS.map(div => (
                                            <button
                                                key={div.id}
                                                onClick={() => setActiveDivision(div.id)}
                                                className="px-4 py-2 rounded-xl text-xs font-bold transition-all border flex-shrink-0"
                                                style={activeDivision === div.id
                                                    ? { background: NAVY_GRADIENT, color: "#fff", borderColor: "transparent", boxShadow: NAVY_SHADOW }
                                                    : { background: "#fff", color: "#64748b", borderColor: "#e2e8f0" }}
                                            >
                                                {div.emoji} {div.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Info divisi untuk kepala — read only */}
                            {isKepalaUser && activeDivision !== "ALL" && (() => {
                                const div = getDivisionInfo(activeDivision);
                                return (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border ${div.color}`}>
                                            {div.emoji} Divisi {div.label}
                                        </span>
                                        <span className="text-[10px] text-[#94a3b8]">Kamu hanya dapat melihat laporan PKL divisimu</span>
                                    </div>
                                );
                            })()}

                            {/* Row filter lainnya */}
                            <div className="flex flex-wrap gap-3">
                                {/* Bulan */}
                                <div>
                                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">Bulan</p>
                                    <input
                                        type="month"
                                        value={filterMonth}
                                        onChange={e => setFilterMonth(e.target.value)}
                                        className="h-9 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    />
                                </div>

                                {/* Status */}
                                <div>
                                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">Status</p>
                                    <select
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value)}
                                        className="h-9 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-w-[140px]"
                                    >
                                        <option value="ALL">Semua Status</option>
                                        <option value="SUBMITTED">📤 Terkirim</option>
                                        <option value="REVIEWED">✅ Disetujui</option>
                                        <option value="REVISION">🔄 Perlu Revisi</option>
                                    </select>
                                </div>

                                {/* Filter PKL — admin/kepala */}
                                {!isPKLUser && pklUsers.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide mb-1">PKL</p>
                                        <select
                                            value={filterPKL}
                                            onChange={e => setFilterPKL(e.target.value)}
                                            className="h-9 border border-[#e8ecf5] rounded-xl px-3 text-sm bg-[#f5f7ff] text-[#334155] focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-w-[160px]"
                                        >
                                            <option value="ALL">Semua PKL</option>
                                            {pklUsers.map(u => (
                                                <option key={u.id} value={u.id}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Refresh */}
                                <div className="flex items-end">
                                    <button onClick={fetchReports}
                                        className="h-9 px-4 bg-white border border-[#e8ecf5] text-[#64748b] rounded-xl text-xs font-semibold hover:bg-[#f8fafc] transition-all flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Refresh
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Kalender view — tampil untuk semua role ── */}
                    {(isPKLUser || isAdminUser || isKepalaUser) && (() => {
                        const [y, m] = filterMonth ? filterMonth.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
                        const dim = new Date(y, m, 0).getDate();
                        const fd = new Date(y, m - 1, 1).getDay();
                        const reportDates = new Set(reports.map(r => r.report_date));
                        const reviewedDates = new Set(reports.filter(r => r.status === "REVIEWED").map(r => r.report_date));
                        const revisionDates = new Set(reports.filter(r => r.status === "REVISION").map(r => r.report_date));
                        const today = getWIBToday();

                        return (
                            <div className="bg-white rounded-2xl overflow-hidden" style={CARD_STYLE}>
                                <div className="px-5 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                                    <div>
                                        <p className="text-sm font-bold text-[#0f172a]">📅 Kalender Laporan</p>
                                        <p className="text-[10px] text-[#94a3b8] mt-0.5">
                                            {isPKLUser
                                                ? "Klik tanggal kosong untuk buat laporan · Klik tanggal berisi untuk lihat detail"
                                                : "Klik tanggal untuk filter tabel · Klik lagi untuk reset filter"}
                                        </p>
                                    </div>
                                    {filterDate && !isPKLUser && (
                                        <button
                                            onClick={() => setFilterDate(null)}
                                            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-xl transition-all"
                                            style={{ background: "#f3f0ff", color: "#6d28d9", border: "1px solid #ddd6fe" }}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                            Reset · {formatDateShort(filterDate)}
                                        </button>
                                    )}
                                </div>
                                <div className="p-4">
                                    <div className="grid grid-cols-7 mb-2">
                                        {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(d => (
                                            <div key={d} className="text-center text-[10px] font-black text-[#94a3b8] uppercase py-1">{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {Array(fd).fill(null).map((_, i) => <div key={`e-${i}`} />)}
                                        {Array.from({ length: dim }, (_, i) => i + 1).map(day => {
                                            const dk = `${y}-${pad2(m)}-${pad2(day)}`;
                                            const hasRep = reportDates.has(dk);
                                            const isRev = reviewedDates.has(dk);
                                            const isRevision = revisionDates.has(dk);
                                            const isTod = dk === today;
                                            const isFuture = dk > today;
                                            const isSelected = filterDate === dk;

                                            return (
                                                <button
                                                    key={day}
                                                    disabled={isFuture}
                                                    onClick={() => {
                                                        if (isPKLUser) {
                                                            if (hasRep) {
                                                                const r = reports.find(r => r.report_date === dk);
                                                                if (r) { setSelectedReport(r); setShowDetail(true); }
                                                            } else {
                                                                setPrefillDate(dk);
                                                                setEditReport(null);
                                                                setShowForm(true);
                                                            }
                                                        } else {
                                                            // admin/kepala: toggle filter tanggal
                                                            setFilterDate(prev => prev === dk ? null : dk);
                                                        }
                                                    }}
                                                    className={`aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-all
                                                        ${isFuture ? "text-[#e2e8f0] cursor-not-allowed" :
                                                            isSelected ? "bg-[#4338ca] text-white ring-2 ring-[#a5b4fc] scale-[1.05] shadow-md cursor-pointer" :
                                                                isRev ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300 cursor-pointer hover:ring-2 hover:scale-[1.02]" :
                                                                    isRevision ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300 cursor-pointer hover:ring-2 hover:scale-[1.02]" :
                                                                        hasRep ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300 cursor-pointer hover:ring-2 hover:scale-[1.02]" :
                                                                            isTod ? "ring-2 ring-[#1a1545] text-[#1a1545] font-black hover:bg-[#f8fafc] cursor-pointer" :
                                                                                "hover:bg-[#f8fafc] text-[#64748b] cursor-pointer"
                                                        }`}
                                                >
                                                    {day}
                                                    {hasRep && !isSelected && (
                                                        <div className={`w-1 h-1 rounded-full mt-0.5 ${isRev ? "bg-emerald-500" : isRevision ? "bg-amber-500" : "bg-blue-500"}`} />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Legend */}
                                    <div className="flex items-center gap-4 mt-4 pt-3 flex-wrap" style={{ borderTop: "1px solid #f5f5fb" }}>
                                        {[
                                            { color: "bg-emerald-400", label: "Disetujui" },
                                            { color: "bg-blue-400", label: "Terkirim" },
                                            { color: "bg-amber-400", label: "Perlu Revisi" },
                                            { color: "bg-[#4338ca]", label: "Dipilih" },
                                            { color: "ring-2 ring-[#1a1545] bg-white", label: "Hari ini" },
                                        ].map(({ color, label }) => (
                                            <span key={label} className="flex items-center gap-1.5 text-[10px] text-[#64748b]">
                                                <span className={`w-3 h-3 rounded-full ${color}`} />{label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── PKL Summary Cards (untuk admin/kepala lihat per PKL) ── */}
                    {!isPKLUser && Object.keys(reportsByPKL).length > 0 && (
                        <div>
                            <p className="text-sm font-bold text-[#475569] mb-3">📊 Ringkasan per PKL</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {Object.entries(reportsByPKL).map(([uid, rpts]) => {
                                    const pklName = rpts[0]?.users?.name ?? "—";
                                    const pklRole = rpts[0]?.users?.role ?? "PKL";
                                    const reviewed = rpts.filter(r => r.status === "REVIEWED").length;
                                    const submitted = rpts.filter(r => r.status === "SUBMITTED").length;
                                    const revision = rpts.filter(r => r.status === "REVISION").length;
                                    const pct = rpts.length > 0 ? Math.round((reviewed / rpts.length) * 100) : 0;
                                    const divCounts: Record<string, number> = {};
                                    rpts.forEach(r => { divCounts[r.division] = (divCounts[r.division] ?? 0) + 1; });
                                    const topDiv = Object.entries(divCounts).sort((a, b) => b[1] - a[1])[0];

                                    return (
                                        <div key={uid} className="group bg-white rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5"
                                            style={CARD_STYLE}>
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 ring-2 ring-white shadow-sm"
                                                    style={{ background: "linear-gradient(135deg, #fbbf24, #b45309)" }}>
                                                    {initials(pklName)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-[#0f172a] text-sm truncate">{pklName}</p>
                                                    <p className="text-[10px] text-[#b45309] font-semibold">{pklRole.replace(/_/g, " ")}</p>
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                <div className="bg-blue-50 rounded-lg p-2 text-center">
                                                    <p className="text-lg font-black text-blue-600">{submitted}</p>
                                                    <p className="text-[9px] text-[#94a3b8] font-medium">Terkirim</p>
                                                </div>
                                                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                                                    <p className="text-lg font-black text-emerald-600">{reviewed}</p>
                                                    <p className="text-[9px] text-[#94a3b8] font-medium">Disetujui</p>
                                                </div>
                                                <div className="bg-amber-50 rounded-lg p-2 text-center">
                                                    <p className="text-lg font-black text-amber-600">{revision}</p>
                                                    <p className="text-[9px] text-[#94a3b8] font-medium">Revisi</p>
                                                </div>
                                            </div>

                                            {/* Progress bar */}
                                            <div className="mb-2">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-[10px] text-[#64748b]">Tingkat Persetujuan</p>
                                                    <p className={`text-[10px] font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500"}`}>{pct}%</p>
                                                </div>
                                                <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-700 ${pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {topDiv && (
                                                <p className="text-[10px] text-[#94a3b8]">
                                                    Divisi utama: <span className="font-bold text-[#475569]">{getDivisionInfo(topDiv[0]).emoji} {getDivisionInfo(topDiv[0]).label}</span>
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Daftar Laporan ── */}
                    <div className="bg-white rounded-2xl overflow-hidden" style={CARD_STYLE}>
                        <div className="px-5 sm:px-6 py-5 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                            <div>
                                <p className="text-base font-bold text-[#0f172a]">
                                    {isPKLUser ? "Laporan Kerjamu" : "Semua Laporan"}
                                </p>
                                <p className="text-[10px] text-[#94a3b8] mt-0.5">
                                    {filterDate
                                        ? `📌 ${formatDate(filterDate)}`
                                        : filterMonth
                                            ? `${MONTH_NAMES[parseInt(filterMonth.split("-")[1]) - 1]} ${filterMonth.split("-")[0]}`
                                            : "Semua bulan"}
                                    {" · "}{totalCount} laporan
                                    {filterDate && (
                                        <button onClick={() => setFilterDate(null)} className="ml-2 text-[#6d28d9] hover:text-[#4c1d95] font-bold">
                                            (reset)
                                        </button>
                                    )}
                                </p>
                            </div>

                            {/* Shortcut tambah laporan — PKL */}
                            {isPKLUser && (
                                <button
                                    onClick={() => { setPrefillDate(getWIBToday()); setEditReport(null); setShowForm(true); }}
                                    className="flex items-center gap-1.5 text-xs font-bold text-[#1a1545] bg-[#f1f5f9] border border-[#e2e8f0] px-4 py-2 rounded-xl hover:bg-[#e2e8f0] transition-all"
                                >
                                    ✏️ Laporan Hari Ini
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="p-6 space-y-3">
                                {Array(4).fill(0).map((_, i) => (
                                    <div key={i} className="h-20 bg-[#f5f7ff] rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : reports.length === 0 ? (
                            <div className="py-16 text-center px-4">
                                <div className="w-14 h-14 rounded-2xl bg-[#f5f7ff] flex items-center justify-center mx-auto mb-4">
                                    <span className="text-3xl opacity-40">📋</span>
                                </div>
                                <p className="text-sm text-[#94a3b8] font-medium">Belum ada laporan</p>
                                {isPKLUser && (
                                    <button
                                        onClick={() => { setEditReport(null); setShowForm(true); }}
                                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#1a1545] bg-[#f1f5f9] border border-[#e2e8f0] px-4 py-2 rounded-xl hover:bg-[#e2e8f0] transition-all"
                                    >
                                        ➕ Buat Laporan Pertama
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="divide-y" style={{ borderColor: "#f5f5fb" }}>
                                {reports.map(report => {
                                    const div = getDivisionInfo(report.division);
                                    const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.SUBMITTED;
                                    const isToday = report.report_date === getWIBToday();

                                    return (
                                        <div
                                            key={report.id}
                                            className="px-5 sm:px-6 py-4 hover:bg-[#fafbff] transition-colors cursor-pointer group"
                                            onClick={() => { setSelectedReport(report); setShowDetail(true); }}
                                        >
                                            <div className="flex items-start gap-3 sm:gap-4">
                                                {/* Avatar */}
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 mt-0.5 ring-2 ring-white shadow-sm"
                                                    style={{ background: "linear-gradient(135deg, #fbbf24, #b45309)" }}>
                                                    {initials(report.users?.name ?? "?")}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        {!isPKLUser && (
                                                            <p className="text-sm font-bold text-[#0f172a]">{report.users?.name ?? "—"}</p>
                                                        )}
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${div.color}`}>
                                                            {div.emoji} {div.label}
                                                        </span>
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.bg} ${status.color} ${status.border}`}>
                                                            {status.emoji} {status.label}
                                                        </span>
                                                        {isToday && (
                                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                                Hari ini
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className="text-xs text-[#94a3b8] mb-1">{formatDate(report.report_date)}</p>

                                                    {report.title && (
                                                        <p className="text-sm font-semibold text-[#334155] truncate mb-0.5">{report.title}</p>
                                                    )}
                                                    <p className="text-xs text-[#64748b] line-clamp-2 leading-relaxed">
                                                        {report.description}
                                                    </p>

                                                    {/* Review note preview */}
                                                    {report.review_note && (
                                                        <div className={`mt-2 text-[11px] px-3 py-1.5 rounded-lg flex items-start gap-1.5 ${report.status === "REVIEWED"
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                            : "bg-amber-50 text-amber-700 border border-amber-200"
                                                            }`}>
                                                            <span className="flex-shrink-0">💬</span>
                                                            <span className="line-clamp-1">{report.review_note}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Chevron */}
                                                <svg className="w-4 h-4 text-[#cbd5e1] group-hover:text-[#64748b] group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* ── Modals ── */}
            {showForm && (
                <ReportFormModal
                    currentUser={currentUser}
                    editData={editReport}
                    prefillDate={prefillDate}
                    prefillDivision={activeDivision !== "ALL" ? activeDivision : undefined}
                    allPKLUsers={isAdminUser ? pklUsers : undefined}
                    onClose={() => { setShowForm(false); setEditReport(null); setPrefillDate(null); }}
                    onSaved={() => { fetchReports(); setShowForm(false); setEditReport(null); setPrefillDate(null); }}
                />
            )}

            {showDetail && selectedReport && (
                <ReportDetailModal
                    report={selectedReport}
                    currentUser={currentUser}
                    onClose={() => { setShowDetail(false); setSelectedReport(null); }}
                    onEdit={() => { setEditReport(selectedReport); setShowDetail(false); setShowForm(true); }}
                    onReview={() => { setShowDetail(false); setShowReview(true); }}
                    onDelete={() => handleDelete(selectedReport.id)}
                />
            )}

            {showReview && selectedReport && (
                <ReviewModal
                    report={selectedReport}
                    currentUser={currentUser}
                    onClose={() => { setShowReview(false); setSelectedReport(null); }}
                    onSaved={() => { fetchReports(); setShowReview(false); setSelectedReport(null); }}
                />
            )}

            <style jsx global>{`
                @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
                @keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
                .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16,1,0.3,1); }
                .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16,1,0.3,1); }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                @media (prefers-reduced-motion: reduce) {
                    .animate-fadeIn, .animate-scaleIn { animation: none; }
                }
            `}</style>
        </DashboardLayout>
    );
}
