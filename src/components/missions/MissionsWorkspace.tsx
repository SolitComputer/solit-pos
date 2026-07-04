"use client";
// src/components/missions/MissionsWorkspace.tsx

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
    Mission,
    MissionItem,
    MissionPriority,
    MISSION_STATUS_META,
    MISSION_PRIORITY_META,
    missionProgress,
    canAssignMissions,
    canReviewMission,
    isMissionFullAccess,
} from "@/lib/missions";
import { useRouter } from "next/navigation";
import { hasFullAccess } from "@/components/missions/missionShared";

interface AssignableUser {
    id: string; name: string; role: string; roles: string[]; shift?: string;
}
type Box = "received" | "assigned";
type Perspective = "assignee" | "reviewer";

// ── Realtime client (anon, tanpa persist auth — hindari warning) ──────────────
const supabaseRealtime = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

// ── Role visual ───────────────────────────────────────────────────────────────
const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
const ROLE_VISUAL: Record<string, { label: string; emoji: string; color: string; border: string }> = {
    ADMIN: { label: "Admin / CEO", emoji: "👑", color: "#7c3aed", border: "#ddd6fe" },
    PROGRAMMER: { label: "Programmer", emoji: "💻", color: "#4f46e5", border: "#c7d2fe" },
    ASISTEN_CEO: { label: "Asisten CEO", emoji: "🤝", color: "#9333ea", border: "#e9d5ff" },
    KEPALA_MARKETING: { label: "Kepala Marketing", emoji: "🎯", color: "#e11d48", border: "#fecdd3" },
    KEPALA_SALES: { label: "Kepala Sales", emoji: "📊", color: "#059669", border: "#a7f3d0" },
    CREW_SALES: { label: "Crew Sales", emoji: "💼", color: "#0284c7", border: "#bae6fd" },
    PENGANTARAN: { label: "Pengantaran", emoji: "🚚", color: "#0d9488", border: "#99f6e4" },
    KONTEN: { label: "Konten Kreator", emoji: "📝", color: "#a21caf", border: "#f0abfc" },
    MARKETING: { label: "Marketing", emoji: "📱", color: "#db2777", border: "#fbcfe8" },
    KEPALA_TEKNISI: { label: "Kepala Teknisi", emoji: "🔩", color: "#dc2626", border: "#fecaca" },
    CUSTOMER_SERVICE: { label: "Customer Service", emoji: "🎧", color: "#0369a1", border: "#bae6fd" },
    TEKNISI: { label: "Teknisi", emoji: "🔧", color: "#ea580c", border: "#fed7aa" },
    KEPALA_PENYEDIA_BARANG: { label: "Kepala Penyedia", emoji: "🏢", color: "#c2410c", border: "#fed7aa" },
    PENYEDIA_BARANG: { label: "Penyedia Barang", emoji: "🏭", color: "#ca8a04", border: "#fef08a" },
    KEPALA_ONPOINT: { label: "Kepala Onpoint", emoji: "🎯", color: "#16a34a", border: "#bbf7d0" },
    ONPOINT: { label: "Onpoint", emoji: "📍", color: "#15803d", border: "#a7f3d0" },
    KEPALA_SOTECH: { label: "Kepala Sotech", emoji: "⚙️", color: "#4d7c0f", border: "#d9f99d" },
    SOTECH: { label: "Sotech", emoji: "🛠️", color: "#65a30d", border: "#d9f99d" },
    KEPALA_PENGELOLA_BARANG: { label: "Kepala Pengelola", emoji: "📦", color: "#1d4ed8", border: "#bfdbfe" },
    PENGELOLA_BARANG: { label: "Adm / Pengelola Barang", emoji: "📦", color: "#2563eb", border: "#bfdbfe" },
    ACCOUNTING: { label: "Accounting", emoji: "💰", color: "#d97706", border: "#fde68a" },
};
function roleVis(r: string) {
    return ROLE_VISUAL[r] ?? { label: r.replace(/_/g, " "), emoji: "👤", color: "#64748b", border: "#e2e8f0" };
}

// ── Struktur hak akses (display, sesuai bagan) ────────────────────────────────
interface DNode { key: string; role?: string; label: string; emoji: string; color: string; virtual?: boolean; children: DNode[]; }
function rnode(role: string, children: DNode[] = []): DNode {
    const v = roleVis(role);
    return { key: role, role, label: v.label, emoji: v.emoji, color: v.color, children };
}
const ACCESS_TREE: DNode = {
    key: "CEO", label: "CEO / Akses Penuh", emoji: "👑", color: "#7c3aed", virtual: true,
    children: [
        {
            key: "FINANCE", label: "Finance", emoji: "💵", color: "#0f766e", virtual: true,
            children: [
                rnode("KEPALA_MARKETING", [
                    rnode("KEPALA_SALES", [rnode("CREW_SALES"), rnode("PENGANTARAN")]),
                    rnode("KONTEN"),
                ]),
                rnode("KEPALA_TEKNISI", [rnode("CUSTOMER_SERVICE"), rnode("TEKNISI")]),
                { key: "MASAK", label: "Masak / Dapur", emoji: "🍳", color: "#a16207", virtual: true, children: [] },
            ],
        },
        rnode("ACCOUNTING", [
            rnode("KEPALA_PENGELOLA_BARANG", [rnode("PENGELOLA_BARANG")]),
        ]),
        { key: "PROGRAMMER", role: "PROGRAMMER", label: "Programmer", emoji: "💻", color: "#4f46e5", children: [] },
        rnode("KEPALA_SOTECH", [rnode("SOTECH")]),
        rnode("KEPALA_ONPOINT", [rnode("ONPOINT")]),
    ],
};

// ── util ──────────────────────────────────────────────────────────────────────
const ROLE_LABEL_MINI = (r?: string | null) => (r ? r.replace(/_/g, " ") : "");
function initials(name: string) {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function sortItems(items?: MissionItem[] | null): MissionItem[] {
    return [...(items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}
function fmtDate(iso: string | null) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(iso: string | null) {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dateKeyOf = (iso: string | null) => (iso ? ymdLocal(new Date(iso)) : null);
const fmtDayLabel = (key: string) =>
    new Date(`${key}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const ID_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const ID_DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

type DateBasis = "created" | "due";
type MissionSection = "dashboard" | "progress" | "history";
const PROGRESS_STATUSES = ["PENDING", "IN_PROGRESS", "SUBMITTED", "REJECTED"];

const SECTION_META: Record<MissionSection, { title: string; subtitle: string }> = {
    dashboard: { title: "Dashboard Misi", subtitle: "Ringkasan, kalender, & buat misi baru" },
    progress: { title: "Progress Misi", subtitle: "Misi yang masih berjalan / belum selesai" },
    history: { title: "Riwayat Misi", subtitle: "Misi yang sudah selesai (disetujui)" },
};
function timeAgo(iso: string | null) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "baru saja";
    if (min < 60) return `${min} mnt lalu`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} hr lalu`;
    return `${Math.floor(d / 30)} bln lalu`;
}
function isOverdue(m: Mission) {
    if (!m.due_date || m.status === "APPROVED") return false;
    return new Date(m.due_date).getTime() < Date.now();
}
function notifyBrowser(title: string, body: string) {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
        try { new Notification(title, { body, icon: "/assets/solit03.jpeg" }); } catch { /* ignore */ }
    }
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

// ── Modal primitives ──────────────────────────────────────────────────────────
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(4px)" }} onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scaleIn"
                style={{ boxShadow: "0 24px 70px rgba(0,0,0,0.18)" }}>
                <div className="flex justify-center pt-3 pb-0 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
                {children}
            </div>
        </div>
    );
}
function ModalHeader({ title, subtitle, onClose, gradient = "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }: {
    title: string; subtitle: string; onClose: () => void; gradient?: string;
}) {
    return (
        <div className="relative px-6 py-5 flex items-center justify-between overflow-hidden" style={{ background: gradient }}>
            <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage: "radial-gradient(ellipse at 85% 40%, rgba(255,255,255,0.14) 0%, transparent 60%)" }} />
            <div className="z-10 min-w-0">
                <p className="font-bold text-white text-sm tracking-tight">{title}</p>
                <p className="text-[10.5px] mt-0.5 truncate max-w-[240px]" style={{ color: "rgba(255,255,255,0.55)" }}>{subtitle}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl transition-all hover:scale-110 z-10 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}>
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
function ProgressBar({ percent, thin }: { percent: number; thin?: boolean }) {
    return (
        <div className={`${thin ? "h-1.5" : "h-2"} w-full rounded-full overflow-hidden`} style={{ background: "#eef2f7" }}>
            <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${percent}%`, background: percent === 100 ? "linear-gradient(90deg,#34d399,#059669)" : "linear-gradient(90deg,#60a5fa,#6366f1)" }} />
        </div>
    );
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

// ── Vertical tree (Hak Akses — anti geser) ────────────────────────────────────
function RoleChip({ node, mine }: { node: DNode; mine: Set<string> }) {
    const highlight = node.role ? mine.has(node.role) : false;
    return (
        <div className="vt-chip" style={highlight
            ? { borderColor: "#c4b5fd", background: "linear-gradient(135deg,#f5f3ff,#faf5ff)", boxShadow: "0 0 0 2px #ddd6fe" }
            : node.virtual ? { borderColor: "#e5e7f5", background: "#fbfbfe" } : { borderColor: "#eef2f7", background: "#fff" }}>
            <span className="vt-dot" style={{ background: node.color }} />
            <span className="vt-emoji">{node.emoji}</span>
            <span className="vt-label" style={{ color: highlight ? "#5b21b6" : "#334155" }}>{node.label}</span>
            {highlight && <span className="vt-you">kamu</span>}
        </div>
    );
}
function TreeBranch({ nodes, mine }: { nodes: DNode[]; mine: Set<string> }) {
    return (
        <div className="vt-branch">
            {nodes.map((n, i) => (
                <div className={`vt-node${i === nodes.length - 1 ? " vt-last" : ""}`} key={n.key}>
                    <span className="vt-line" />
                    <span className="vt-elbow" />
                    <div className="vt-item"><RoleChip node={n} mine={mine} /></div>
                    {n.children.length > 0 && <TreeBranch nodes={n.children} mine={mine} />}
                </div>
            ))}
        </div>
    );
}
function AccessTree({ mine }: { mine: Set<string> }) {
    const iAmFull = [...mine].some(r => FULL_ACCESS_ROLES.includes(r));
    return (
        <div>
            <div className="vt-item vt-item--root">
                <div className="vt-chip vt-chip--root"
                    style={iAmFull ? { boxShadow: "0 0 0 2px #c4b5fd, 0 6px 18px rgba(15,12,41,0.3)" } : undefined}>
                    <span style={{ fontSize: 15 }}>👑</span>
                    <div style={{ lineHeight: 1.15 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: "#fff" }}>CEO / Akses Penuh {iAmFull && "· kamu"}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)" }}>Bisa beri misi ke semua peran</div>
                    </div>
                </div>
            </div>
            <TreeBranch nodes={ACCESS_TREE.children} mine={mine} />
        </div>
    );
}

// ── Shared mission blocks ─────────────────────────────────────────────────────
function HeadlineBlock({ mission }: { mission: Mission }) {
    const overdue = isOverdue(mission);
    return (
        <>
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-black text-slate-800">{mission.title}</h3>
                <StatusBadge status={mission.status} />
            </div>
            {mission.description && <p className="text-sm text-slate-500 leading-relaxed">{mission.description}</p>}
            <div className="flex flex-wrap gap-2">
                <PriorityBadge priority={mission.priority} />
                {mission.due_date && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={overdue ? { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }
                            : { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                        ⏰ Tenggat {fmtDateShort(mission.due_date)}{overdue ? " • Lewat" : ""}
                    </span>
                )}
            </div>
            {mission.status === "REJECTED" && mission.rejection_reason && (
                <div className="rounded-xl p-3 text-xs" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                    <span className="font-bold">Alasan ditolak:</span> {mission.rejection_reason}
                </div>
            )}
        </>
    );
}
function MetaCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl p-2.5" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
            <p className="text-slate-400 font-bold uppercase tracking-wide text-[9px] mb-0.5">{label}</p>
            <p className="text-slate-700 font-semibold">{value}</p>
        </div>
    );
}
function MetaGrid({ mission }: { mission: Mission }) {
    return (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
            <MetaCell label="Pemberi" value={mission.assigner?.name ?? "—"} />
            <MetaCell label="Penerima" value={mission.assignee?.name ?? "—"} />
            <MetaCell label="Dibuat" value={fmtDate(mission.created_at)} />
            {mission.due_date && <MetaCell label="Tenggat" value={fmtDate(mission.due_date)} />}
            {mission.submitted_at && <MetaCell label="Disubmit" value={fmtDate(mission.submitted_at)} />}
            {mission.reviewed_at && <MetaCell label="Ditinjau" value={fmtDate(mission.reviewed_at)} />}
        </div>
    );
}
function ProofView({ mission }: { mission: Mission }) {
    if (!mission.proof_photo_url) return null;
    return (
        <div>
            <p className="text-[10.5px] font-bold mb-1.5 uppercase tracking-widest" style={{ color: "#94a3b8" }}>Bukti Pengerjaan</p>
            <a href={mission.proof_photo_url} target="_blank" rel="noopener noreferrer">
                <img src={mission.proof_photo_url} alt="Bukti" className="w-full rounded-xl border" style={{ borderColor: "#e2e8f0", maxHeight: 280, objectFit: "cover" }} />
            </a>
            {mission.proof_note && <p className="text-xs text-slate-500 mt-2 italic">"{mission.proof_note}"</p>}
        </div>
    );
}
function ChecklistBlock({ mission, interactive, togglingId, onToggle }: {
    mission: Mission; interactive: boolean; togglingId?: string | null; onToggle?: (it: MissionItem) => void;
}) {
    const { done, total, percent } = missionProgress(mission.items);
    if (total === 0) return null;
    return (
        <div className="space-y-2.5 rounded-2xl p-3.5" style={{ background: "#fafbff", border: "1px solid #eef2f7" }}>
            <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>Checklist ({done}/{total})</p>
                <span className="text-xs font-black" style={{ color: percent === 100 ? "#059669" : "#6366f1" }}>{percent}%</span>
            </div>
            <ProgressBar percent={percent} />
            <div className="space-y-1.5 pt-1">
                {sortItems(mission.items).map(it => {
                    const inner = (
                        <>
                            <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                                style={it.is_done ? { background: "#059669", color: "#fff" } : { background: "#fff", border: "1.5px solid #cbd5e1" }}>
                                {it.is_done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>}
                            </span>
                            <span className="flex-1 text-xs font-semibold"
                                style={{ color: it.is_done ? "#059669" : "#334155", textDecoration: it.is_done ? "line-through" : "none" }}>{it.text}</span>
                        </>
                    );
                    return interactive ? (
                        <button key={it.id} type="button" disabled={togglingId === it.id} onClick={() => onToggle?.(it)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all border active:scale-[0.99] disabled:opacity-60"
                            style={it.is_done ? { background: "#ecfdf5", borderColor: "#a7f3d0" } : { background: "#fff", borderColor: "#e2e8f0" }}>
                            {inner}
                        </button>
                    ) : (
                        <div key={it.id} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border"
                            style={it.is_done ? { background: "#ecfdf5", borderColor: "#a7f3d0" } : { background: "#fff", borderColor: "#e2e8f0" }}>
                            {inner}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Mission card (dengan quick delete untuk pemberi) ──────────────────────────
function MissionCard({
    m, view, onOpen, onQuickDelete,
}: {
    m: Mission;
    view: Box;
    onOpen: () => void;
    onQuickDelete?: (m: Mission) => void;
}) {
    const otherName = view === "received" ? (m.assigner?.name ?? "—") : (m.assignee?.name ?? "—");
    const otherLabel = view === "received" ? "Dari" : "Untuk";
    const overdue = isOverdue(m);
    const { done, total, percent } = missionProgress(m.items);

    // Quick delete hanya muncul di box "assigned" dan status masih awal (belum submit bukti)
    const showQuickDelete =
        view === "assigned" &&
        !!onQuickDelete &&
        (m.status === "PENDING" || m.status === "IN_PROGRESS" || m.status === "REJECTED");

    return (
        <div className="relative">
            <button
                onClick={onOpen}
                className="w-full text-left bg-white rounded-2xl p-4 transition-all hover:shadow-md active:scale-[0.995]"
                style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
            >
                <div className="flex items-start justify-between gap-3 mb-2">
                    <p className={`text-sm font-bold text-slate-800 line-clamp-2 ${showQuickDelete ? "pr-9" : ""}`}>{m.title}</p>
                    <StatusBadge status={m.status} />
                </div>
                {m.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2.5">{m.description}</p>}

                {total > 0 && (
                    <div className="mb-2.5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9.5px] font-bold tracking-wide" style={{ color: "#94a3b8" }}>CHECKLIST {done}/{total}</span>
                            <span className="text-[9.5px] font-black" style={{ color: percent === 100 ? "#059669" : "#6366f1" }}>{percent}%</span>
                        </div>
                        <ProgressBar percent={percent} thin />
                    </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                    <PriorityBadge priority={m.priority} />
                    <span className="text-[10px] text-slate-400 font-medium">
                        {otherLabel}: <span className="text-slate-600 font-semibold">{otherName}</span>
                    </span>
                </div>

                {/* ── Tanggal ── */}
                <div className="flex items-center gap-2 flex-wrap mt-2.5 pt-2.5" style={{ borderTop: "1px dashed #eef2f7" }}>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}>
                        🗓️ Dibuat {fmtDateShort(m.created_at)}
                    </span>
                    <span className="text-[9.5px] text-slate-400">{timeAgo(m.created_at)}</span>
                    {m.due_date && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto"
                            style={overdue ? { background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }
                                : { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }}>
                            ⏰ {fmtDateShort(m.due_date)}{overdue ? " • Lewat" : ""}
                        </span>
                    )}
                </div>
            </button>

            {/* Quick delete floating button */}
            {showQuickDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onQuickDelete?.(m);
                    }}
                    title="Hapus misi ini"
                    aria-label="Hapus misi"
                    className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-10"
                    style={{
                        background: "#fff1f2",
                        border: "1px solid #fecdd3",
                        color: "#dc2626",
                        boxShadow: "0 2px 6px rgba(220,38,38,0.15)",
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                    </svg>
                </button>
            )}
        </div>
    );
}

function MissionCalendar({
    missions, basis, selectedDate, onSelectDate, onBasisChange,
}: {
    missions: Mission[];
    basis: DateBasis;
    selectedDate: string | null;
    onSelectDate: (d: string | null) => void;
    onBasisChange: (b: DateBasis) => void;
}) {
    const today = ymdLocal(new Date());
    const [cursor, setCursor] = useState(() => {
        const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
        return { y: base.getFullYear(), m: base.getMonth() };
    });

    const countByDate = useMemo(() => {
        const map = new Map<string, { total: number; overdue: number; done: number }>();
        for (const m of missions) {
            const iso = basis === "due" ? m.due_date : m.created_at;
            const key = dateKeyOf(iso);
            if (!key) continue;
            const cur = map.get(key) ?? { total: 0, overdue: 0, done: 0 };
            cur.total += 1;
            if (m.status === "APPROVED") cur.done += 1;
            else if (m.due_date && new Date(m.due_date).getTime() < Date.now()) cur.overdue += 1;
            map.set(key, cur);
        }
        return map;
    }, [missions, basis]);

    const cells = useMemo(() => {
        const startDow = new Date(cursor.y, cursor.m, 1).getDay();
        const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
        const arr: ({ key: string; day: number } | null)[] = [];
        for (let i = 0; i < startDow; i++) arr.push(null);
        for (let d = 1; d <= daysInMonth; d++) arr.push({ key: `${cursor.y}-${pad2(cursor.m + 1)}-${pad2(d)}`, day: d });
        while (arr.length % 7 !== 0) arr.push(null);
        return arr;
    }, [cursor]);

    const monthPrefix = `${cursor.y}-${pad2(cursor.m + 1)}`;
    const monthTotal = useMemo(() => {
        let c = 0;
        for (const [k, v] of countByDate) if (k.startsWith(monthPrefix)) c += v.total;
        return c;
    }, [countByDate, monthPrefix]);

    const prevMonth = () => setCursor(c => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const nextMonth = () => setCursor(c => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const goToday = () => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); onSelectDate(today); };

    const navBtn = "w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition text-lg font-bold";

    return (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                <div className="flex items-center gap-1.5">
                    <button onClick={prevMonth} className={navBtn} aria-label="Bulan sebelumnya">‹</button>
                    <div className="text-center min-w-[128px]">
                        <p className="text-sm font-black text-slate-800 leading-tight">{ID_MONTHS[cursor.m]} {cursor.y}</p>
                        <p className="text-[10px] text-slate-400">{monthTotal} misi</p>
                    </div>
                    <button onClick={nextMonth} className={navBtn} aria-label="Bulan berikutnya">›</button>
                </div>
                <button onClick={goToday}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg transition active:scale-95"
                    style={{ background: "linear-gradient(135deg,#0f0c29,#1a1545)", color: "#fff" }}>
                    Hari Ini
                </button>
            </div>

            <div className="px-3 pt-3 flex items-center gap-1.5">
                {([{ k: "created", label: "🗓️ Dibuat" }, { k: "due", label: "⏰ Tenggat" }] as { k: DateBasis; label: string }[]).map(b => {
                    const active = basis === b.k;
                    return (
                        <button key={b.k} onClick={() => onBasisChange(b.k)}
                            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition"
                            style={active ? { background: "#eef2ff", color: "#4f46e5", border: "1px solid #c7d2fe" }
                                : { background: "#f8fafc", color: "#94a3b8", border: "1px solid #eef2f7" }}>
                            {b.label}
                        </button>
                    );
                })}
                {selectedDate && (
                    <button onClick={() => onSelectDate(null)}
                        className="ml-auto text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition"
                        style={{ background: "#fff1f2", color: "#e11d48", border: "1px solid #fecdd3" }}>
                        Semua Tanggal ✕
                    </button>
                )}
            </div>

            <div className="p-3">
                <div className="grid grid-cols-7 gap-1 mb-1">
                    {ID_DOW.map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {cells.map((cell, i) => {
                        if (!cell) return <div key={`e${i}`} />;
                        const info = countByDate.get(cell.key);
                        const isToday = cell.key === today;
                        const isSelected = cell.key === selectedDate;
                        const hasOverdue = (info?.overdue ?? 0) > 0;

                        return (
                            <button key={cell.key} type="button"
                                onClick={() => onSelectDate(isSelected ? null : cell.key)}
                                className="relative min-h-[42px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
                                style={
                                    isSelected
                                        ? { background: "linear-gradient(135deg,#0f0c29,#1a1545)", color: "#fff", boxShadow: "0 4px 12px rgba(15,12,41,0.25)" }
                                        : isToday
                                            ? { background: "#f5f3ff", border: "1.5px solid #c4b5fd", color: "#5b21b6" }
                                            : { background: info ? "#fafbff" : "transparent", border: "1px solid #f1f5f9", color: "#475569" }
                                }>
                                <span className="text-sm font-bold leading-none">{cell.day}</span>
                                {info && (
                                    <span className="text-[9px] font-black leading-none px-1 py-px rounded-full"
                                        style={
                                            isSelected ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
                                                : hasOverdue ? { background: "#fee2e2", color: "#dc2626" }
                                                    : { background: "#ede9fe", color: "#7c3aed" }
                                        }>
                                        {info.total}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── Create modal ──────────────────────────────────────────────────────────────
function CreateMissionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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

    const [itemInput, setItemInput] = useState("");
    const [checklist, setChecklist] = useState<string[]>([]);
    const addItem = () => { const t = itemInput.trim(); if (!t) return; setChecklist(p => [...p, t]); setItemInput(""); };
    const removeItem = (idx: number) => setChecklist(p => p.filter((_, i) => i !== idx));

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
    const selectedUser = users.find(u => u.id === assignedTo) ?? null;

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
                    priority, due_date: dueDate ? new Date(dueDate).toISOString() : null, items: checklist,
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
            <ModalHeader title="Buat Misi Baru" subtitle={loadingUsers ? "Memuat…" : `${users.length} orang bisa kamu beri misi`} onClose={onClose} />
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {error && <ErrorBox msg={error} />}

                <Field label="Penerima Misi">
                    {selectedUser && (
                        <button type="button" onClick={() => setAssignedTo("")}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-xl transition-all active:scale-[0.99]"
                            style={{ background: "linear-gradient(135deg,#f5f3ff,#faf5ff)", border: "1px solid #ddd6fe" }}>
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
                                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>{initials(selectedUser.name)}</div>
                            <div className="min-w-0 flex-1 text-left">
                                <p className="text-xs font-bold text-violet-800 truncate">{selectedUser.name}</p>
                                <p className="text-[10px] text-violet-400 truncate">{ROLE_LABEL_MINI(selectedUser.roles?.[0] ?? selectedUser.role)}</p>
                            </div>
                            <span className="text-[10px] font-black text-violet-500 flex-shrink-0">Batalkan ✕</span>
                        </button>
                    )}

                    <Input placeholder="🔍 Cari nama..." value={search} onChange={e => setSearch(e.target.value)} />

                    {loadingUsers ? (
                        <div className="mt-2 space-y-1.5">
                            {Array(4).fill(0).map((_, i) => (
                                <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
                                    <div className="w-8 h-8 rounded-lg bg-slate-200 animate-pulse" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="h-2.5 w-24 bg-slate-200 rounded animate-pulse" />
                                        <div className="h-2 w-16 bg-slate-100 rounded animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center">Tidak ada user yang bisa kamu beri misi</p>
                    ) : (
                        <div className="mt-2 max-h-44 overflow-y-auto space-y-1 pr-0.5">
                            {filtered.map(u => {
                                const active = assignedTo === u.id;
                                return (
                                    <button key={u.id} type="button"
                                        onClick={() => setAssignedTo(prev => (prev === u.id ? "" : u.id))}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all active:scale-[0.99] border"
                                        style={active ? { background: "#f5f3ff", borderColor: "#c4b5fd", boxShadow: "0 0 0 1.5px #ddd6fe" }
                                            : { background: "#f8fafc", borderColor: "#eef2f7" }}>
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
                                            style={{ background: active ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#cbd5e1,#94a3b8)" }}>
                                            {initials(u.name)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold truncate" style={{ color: active ? "#5b21b6" : "#334155" }}>{u.name}</p>
                                            <p className="text-[10px] truncate" style={{ color: active ? "#a78bfa" : "#94a3b8" }}>{ROLE_LABEL_MINI(u.roles?.[0] ?? u.role)}</p>
                                        </div>
                                        {active && <span className="text-violet-600 text-xs font-black flex-shrink-0">✓</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </Field>

                <Field label="Judul Misi">
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="contoh: Follow up 10 leads Shopee" />
                </Field>

                <Field label="Deskripsi (opsional)">
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Detail tugas..."
                        className="w-full border rounded-xl px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-400/30 resize-none"
                        style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#1e293b" }} />
                </Field>

                <Field label="Sub-tugas / Checklist (opsional)">
                    <div className="flex gap-2">
                        <Input value={itemInput} onChange={e => setItemInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                            placeholder="contoh: Hubungi 5 leads" />
                        <button type="button" onClick={addItem}
                            className="h-10 px-4 rounded-xl text-white text-lg font-black flex-shrink-0 transition-all active:scale-95 flex items-center justify-center"
                            style={{ background: "linear-gradient(135deg,#0f0c29,#1a1545)" }}>+</button>
                    </div>
                    {checklist.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                            {checklist.map((it, idx) => (
                                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#f8fafc", border: "1px solid #eef2f7" }}>
                                    <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black flex-shrink-0" style={{ background: "#eef2ff", color: "#6366f1" }}>{idx + 1}</span>
                                    <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{it}</span>
                                    <button type="button" onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[10px] mt-1.5" style={{ color: "#94a3b8" }}>Progress % dihitung otomatis dari centang sub-tugas</p>
                </Field>

                <Field label="Prioritas">
                    <div className="grid grid-cols-3 gap-2">
                        {(["LOW", "MEDIUM", "HIGH"] as MissionPriority[]).map(p => {
                            const meta = MISSION_PRIORITY_META[p]; const active = priority === p;
                            return (
                                <button key={p} type="button" onClick={() => setPriority(p)}
                                    className="h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
                                    style={active ? { background: meta.bg, borderColor: meta.border } : { background: "#f8fafc", borderColor: "#e2e8f0" }}>
                                    <span className="text-base">{meta.icon}</span>
                                    <span className="text-[10px] font-bold" style={{ color: active ? meta.text : "#94a3b8" }}>{meta.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Field>

                <Field label="Deadline / Tenggat (opsional)">
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

// ── Confirm delete modal (quick delete dari card) ─────────────────────────────
function ConfirmDeleteModal({
    mission, deleting, onCancel, onConfirm,
}: {
    mission: Mission;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <ModalShell onClose={() => !deleting && onCancel()}>
            <ModalHeader
                title="Hapus Misi?"
                subtitle="Aksi ini tidak bisa dibatalkan"
                onClose={() => !deleting && onCancel()}
                gradient="linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%)"
            />
            <div className="p-6 space-y-4">
                <div className="rounded-2xl p-4" style={{ background: "#fff1f2", border: "1px solid #fecdd3" }}>
                    <p className="text-sm font-black text-rose-700 mb-1">{mission.title}</p>
                    <p className="text-xs text-rose-500">
                        Untuk: <span className="font-semibold">{mission.assignee?.name ?? "—"}</span>
                    </p>
                    {mission.description && (
                        <p className="text-xs text-rose-400 mt-1.5 line-clamp-2 italic">
                            &ldquo;{mission.description}&rdquo;
                        </p>
                    )}
                </div>

                <div className="rounded-xl p-3 text-xs"
                    style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
                    ⚠️ Misi & semua sub-tugas akan dihapus permanen dari sistem.
                    {mission.status === "IN_PROGRESS" && (
                        <p className="mt-1 font-semibold">Catatan: misi ini sedang dikerjakan penerima.</p>
                    )}
                    {mission.status === "REJECTED" && (
                        <p className="mt-1 font-semibold">Catatan: misi ini sebelumnya ditolak dan sedang direvisi.</p>
                    )}
                </div>
            </div>

            <div className="px-6 pb-6 pt-4 flex gap-2.5" style={{ borderTop: "1px solid #f1f5f9" }}>
                <button
                    onClick={onCancel}
                    disabled={deleting}
                    className="flex-1 h-10 rounded-xl text-sm font-semibold transition-all hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                    style={{ background: "#f1f5f9", color: "#64748b" }}
                >
                    Batal
                </button>
                <button
                    onClick={onConfirm}
                    disabled={deleting}
                    className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                    style={{
                        background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                        boxShadow: "0 4px 14px rgba(220,38,38,0.3)",
                    }}
                >
                    {deleting ? "Menghapus..." : "🗑️ Ya, Hapus"}
                </button>
            </div>
        </ModalShell>
    );
}

// ── Detail: PENERIMA (assignee) ───────────────────────────────────────────────
function MissionDetailAssignee({ mission, onClose, onChanged, onMissionUpdated, showToast }: {
    mission: Mission; onClose: () => void; onChanged: () => void;
    onMissionUpdated: (m: Mission) => void; showToast: (m: string, t: "ok" | "err") => void;
}) {
    const { total, done, percent } = missionProgress(mission.items);
    const checklistComplete = total === 0 || done === total;
    const canSubmit = ["PENDING", "IN_PROGRESS", "REJECTED"].includes(mission.status);
    const canToggle = mission.status !== "APPROVED";

    const [mode, setMode] = useState<"view" | "submit">("view");
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const onPickFile = (f: File | null) => { setFile(f); setPreview(f ? URL.createObjectURL(f) : ""); };

    const toggleItem = async (item: MissionItem) => {
        if (!canToggle || togglingId) return;
        setTogglingId(item.id);
        onMissionUpdated({ ...mission, items: (mission.items ?? []).map(it => it.id === item.id ? { ...it, is_done: !it.is_done } : it) });
        try {
            const res = await fetch(`/api/missions/${mission.id}/items`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: item.id, is_done: !item.is_done }),
            });
            const data = await res.json();
            if (data.success) onMissionUpdated(data.data);
            else { onMissionUpdated(mission); showToast(data.message ?? "Gagal update", "err"); }
        } catch { onMissionUpdated(mission); showToast("Terjadi kesalahan", "err"); }
        finally { setTogglingId(null); }
    };

    const submitProof = async () => {
        if (!file) { showToast("Upload bukti foto dulu", "err"); return; }
        setBusy(true);
        try {
            const fd = new FormData(); fd.append("file", file);
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

    return (
        <ModalShell onClose={onClose}>
            <ModalHeader title="Detail Misi" subtitle={`Dari ${mission.assigner?.name ?? "—"}`} onClose={onClose} />
            <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
                <HeadlineBlock mission={mission} />
                <ChecklistBlock mission={mission} interactive={canToggle} togglingId={togglingId} onToggle={toggleItem} />
                <MetaGrid mission={mission} />
                {mode === "view" && <ProofView mission={mission} />}
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
            </div>

            <div className="px-6 pb-6 pt-4 flex gap-2.5" style={{ borderTop: "1px solid #f1f5f9" }}>
                {mode === "view" ? (
                    <>
                        <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all"
                            style={{ background: "#f1f5f9", color: "#64748b" }}>Tutup</button>
                        {canSubmit && (
                            <button onClick={() => checklistComplete ? setMode("submit") : showToast("Selesaikan semua sub-tugas dulu", "err")}
                                className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                                style={checklistComplete
                                    ? { background: "linear-gradient(135deg, #059669, #047857)", boxShadow: "0 4px 14px rgba(5,150,105,0.3)" }
                                    : { background: "linear-gradient(135deg, #94a3b8, #64748b)" }}>
                                {checklistComplete ? "✅ Selesaikan" : `✅ Selesaikan (${percent}%)`}
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <button onClick={() => setMode("view")} disabled={busy} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all disabled:opacity-50"
                            style={{ background: "#f1f5f9", color: "#64748b" }}>Kembali</button>
                        <button onClick={submitProof} disabled={busy}
                            className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
                            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>{busy ? "Mengirim..." : "📤 Kirim Bukti"}</button>
                    </>
                )}
            </div>
        </ModalShell>
    );
}

// ── Detail: PEMBERI (reviewer) ────────────────────────────────────────────────
function MissionDetailReviewer({ mission, currentUser, onClose, onChanged, showToast }: {
    mission: Mission; currentUser: { id: string; roles: string[] };
    onClose: () => void; onChanged: () => void; showToast: (m: string, t: "ok" | "err") => void;
}) {
    const canReview = canReviewMission(currentUser, mission);
    const canDecide = canReview && mission.status === "SUBMITTED";
    const canDelete = isMissionFullAccess(currentUser.roles) || mission.assigned_by === currentUser.id;

    const [mode, setMode] = useState<"view" | "reject" | "confirmDelete">("view");
    const [rejectReason, setRejectReason] = useState("");
    const [busy, setBusy] = useState(false);

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

    const del = async () => {
        setBusy(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) { showToast(data.message ?? "Gagal menghapus", "err"); return; }
            showToast("Misi dihapus 🗑️", "ok");
            onChanged();
        } catch { showToast("Terjadi kesalahan", "err"); }
        finally { setBusy(false); }
    };

    const proofNote =
        mission.status === "PENDING" ? "Belum dikerjakan penerima" :
            mission.status === "IN_PROGRESS" ? "Sedang dikerjakan — belum ada bukti" : "Belum ada bukti";

    return (
        <ModalShell onClose={onClose}>
            <ModalHeader title="Tinjau Misi" subtitle={`Untuk ${mission.assignee?.name ?? "—"}`} onClose={onClose}
                gradient="linear-gradient(135deg,#312e81 0%,#4338ca 100%)" />
            <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto">
                <HeadlineBlock mission={mission} />
                <ChecklistBlock mission={mission} interactive={false} />
                <MetaGrid mission={mission} />

                {mission.proof_photo_url
                    ? <ProofView mission={mission} />
                    : (
                        <div className="rounded-xl p-3 text-xs text-center" style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", color: "#94a3b8" }}>
                            {proofNote}
                        </div>
                    )}

                {mode === "reject" && (
                    <Field label="Alasan Penolakan">
                        <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Kenapa ditolak?" />
                    </Field>
                )}
                {mode === "confirmDelete" && (
                    <div className="rounded-xl p-3.5 text-xs" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                        <p className="font-bold mb-0.5">Hapus misi ini?</p>
                        <p style={{ color: "#e11d48" }}>Misi & semua sub-tugas akan dihapus permanen.</p>
                    </div>
                )}
            </div>

            <div className="px-6 pb-6 pt-4 space-y-2" style={{ borderTop: "1px solid #f1f5f9" }}>
                {mode === "view" && (
                    <>
                        {canDecide && (
                            <div className="flex gap-2.5">
                                <button onClick={() => setMode("reject")} disabled={busy}
                                    className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>❌ Tolak</button>
                                <button onClick={() => decide("approve")} disabled={busy}
                                    className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #059669, #047857)", boxShadow: "0 4px 14px rgba(5,150,105,0.3)" }}>{busy ? "..." : "✅ ACC"}</button>
                            </div>
                        )}
                        <div className="flex gap-2.5">
                            <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all"
                                style={{ background: "#f1f5f9", color: "#64748b" }}>Tutup</button>
                            {canDelete && (
                                <button onClick={() => setMode("confirmDelete")}
                                    className="px-4 h-10 rounded-xl text-sm font-bold transition-all active:scale-95"
                                    style={{ background: "#fff1f2", color: "#dc2626", border: "1px solid #fecdd3" }}>🗑 Hapus</button>
                            )}
                        </div>
                    </>
                )}
                {mode === "reject" && (
                    <div className="flex gap-2.5">
                        <button onClick={() => setMode("view")} disabled={busy} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all disabled:opacity-50"
                            style={{ background: "#f1f5f9", color: "#64748b" }}>Kembali</button>
                        <button onClick={() => decide("reject")} disabled={busy}
                            className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
                            style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>{busy ? "..." : "Konfirmasi Tolak"}</button>
                    </div>
                )}
                {mode === "confirmDelete" && (
                    <div className="flex gap-2.5">
                        <button onClick={() => setMode("view")} disabled={busy} className="flex-1 h-10 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-all disabled:opacity-50"
                            style={{ background: "#f1f5f9", color: "#64748b" }}>Batal</button>
                        <button onClick={del} disabled={busy}
                            className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
                            style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}>{busy ? "..." : "🗑 Ya, Hapus"}</button>
                    </div>
                )}
            </div>
        </ModalShell>
    );
}

// ── Stat kecil + skeleton ─────────────────────────────────────────────────────
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
function CardSkeleton() {
    return (
        <div className="bg-white rounded-2xl p-4 animate-pulse" style={{ border: "1px solid #f0f0f8" }}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="h-3.5 w-40 bg-slate-200 rounded" />
                <div className="h-4 w-16 bg-slate-100 rounded-full" />
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded mb-2" />
            <div className="h-1.5 w-full bg-slate-100 rounded mb-3" />
            <div className="flex gap-2 mb-2.5">
                <div className="h-4 w-14 bg-slate-100 rounded-full" />
                <div className="h-4 w-20 bg-slate-100 rounded-full" />
            </div>
            <div className="pt-2.5 border-t border-slate-50 flex gap-2">
                <div className="h-4 w-24 bg-slate-100 rounded-full" />
            </div>
        </div>
    );
}
function StatSkeleton() {
    return (
        <div className="bg-white rounded-2xl p-4 animate-pulse" style={{ border: "1px solid #f0f0f8" }}>
            <div className="flex items-center justify-between mb-2">
                <div className="h-5 w-5 bg-slate-200 rounded" />
                <div className="h-6 w-8 bg-slate-200 rounded" />
            </div>
            <div className="h-2.5 w-20 bg-slate-100 rounded" />
        </div>
    );
}
function PageSkeleton() {
    return (
        <div className="min-h-screen bg-[#F7F7F8]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-200 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
                        <div className="h-2.5 w-56 bg-slate-100 rounded animate-pulse" />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">{Array(3).fill(0).map((_, i) => <StatSkeleton key={i} />)}</div>
                <div className="h-12 bg-white rounded-2xl animate-pulse" style={{ border: "1px solid #f0f0f8" }} />
                <div className="space-y-3">{Array(4).fill(0).map((_, i) => <CardSkeleton key={i} />)}</div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MissionsWorkspace({ section }: { section: MissionSection }) {
    const { user } = useAuthUser();
    const roles: string[] = useMemo(
        () => (user?.roles?.length ? user.roles : user?.role ? [user.role] : []),
        [user]
    );
    const iCanAssign = canAssignMissions(roles);
    const mineRoles = useMemo(() => new Set(roles), [roles]);

    const [box, setBox] = useState<Box>("received");
    const [dateBasis, setDateBasis] = useState<DateBasis>("created");
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showStructure, setShowStructure] = useState(false);
    const [missions, setMissions] = useState<Mission[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [detail, setDetail] = useState<{ m: Mission; mode: Perspective } | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

    // ── Quick delete state ──
    const [confirmDelete, setConfirmDelete] = useState<Mission | null>(null);
    const [deleting, setDeleting] = useState(false);

    const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });
    const router = useRouter();
    const iAmAdmin = hasFullAccess(roles);

    const fetchMissions = async (b: Box, soft = false) => {
        if (!soft) setLoading(true);
        try {
            const res = await fetch(`/api/missions?box=${b}`);
            const data = await res.json();
            if (data.success) setMissions(data.data);
            else if (!soft) showToast(data.message ?? "Gagal memuat misi", "err");
        } catch { if (!soft) showToast("Gagal memuat misi", "err"); }
        finally { if (!soft) setLoading(false); }
    };

    const patchLocalMission = (updated: Mission) => {
        setMissions(prev => prev.map(m => m.id === updated.id ? updated : m));
        setDetail(prev => (prev && prev.m.id === updated.id ? { ...prev, m: updated } : prev));
    };

    // ── Handler quick delete ──
    const handleQuickDelete = async () => {
        if (!confirmDelete) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/missions/${confirmDelete.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!data.success) {
                showToast(data.message ?? "Gagal menghapus misi", "err");
                return;
            }
            // Optimistic: remove dari list lokal langsung
            setMissions(prev => prev.filter(m => m.id !== confirmDelete.id));
            showToast("Misi berhasil dihapus 🗑️", "ok");
            setConfirmDelete(null);
        } catch {
            showToast("Terjadi kesalahan saat menghapus", "err");
        } finally {
            setDeleting(false);
        }
    };

    useEffect(() => { if (user) fetchMissions(box); /* eslint-disable-next-line */ }, [box, user]);

    useEffect(() => { setSelectedDate(null); }, [box]);

    useEffect(() => {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().catch(() => { });
        }
    }, []);

    useEffect(() => {
        const onVis = () => { if (document.visibilityState === "visible" && user) fetchMissions(box, true); };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, box]);

    // ── REALTIME ──
    useEffect(() => {
        if (!user) return;
        const uid = user.id;

        const ch = supabaseRealtime
            .channel(`missions-rt-${uid}-${box}`)
            .on("postgres_changes",
                { event: "INSERT", schema: "public", table: "missions", filter: `assigned_to=eq.${uid}` },
                (payload: any) => {
                    const t = payload.new?.title ?? "Misi baru";
                    showToast("🎯 Misi baru masuk untukmu!", "ok");
                    notifyBrowser("🎯 Misi Baru", t);
                    try { navigator.vibrate?.(200); } catch { }
                    fetchMissions(box, true);
                })
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "missions", filter: `assigned_to=eq.${uid}` },
                (payload: any) => {
                    const st = payload.new?.status; const t = payload.new?.title ?? "Misi";
                    if (st === "APPROVED") { showToast("🎉 Misi kamu disetujui!", "ok"); notifyBrowser("🎉 Misi Disetujui", t); }
                    else if (st === "REJECTED") { showToast("❌ Misi kamu ditolak", "err"); notifyBrowser("❌ Misi Ditolak", t); }
                    fetchMissions(box, true);
                })
            .on("postgres_changes",
                { event: "DELETE", schema: "public", table: "missions", filter: `assigned_to=eq.${uid}` },
                (payload: any) => {
                    const deletedId = payload.old?.id;
                    if (deletedId) {
                        setMissions(prev => prev.filter(m => m.id !== deletedId));
                        showToast("Salah satu misimu dihapus oleh pemberi", "err");
                    }
                })
            .on("postgres_changes",
                { event: "UPDATE", schema: "public", table: "missions", filter: `assigned_by=eq.${uid}` },
                (payload: any) => {
                    const st = payload.new?.status; const t = payload.new?.title ?? "Misi";
                    if (st === "SUBMITTED") {
                        showToast("📤 Ada misi menunggu ACC", "ok");
                        notifyBrowser("📤 Misi Disubmit", `${t} menunggu persetujuan`);
                        try { navigator.vibrate?.(200); } catch { }
                    }
                    fetchMissions(box, true);
                })
            .subscribe();

        let ch2: any = null;
        if (box === "assigned") {
            ch2 = supabaseRealtime
                .channel(`mission-items-rt-${uid}`)
                .on("postgres_changes", { event: "*", schema: "public", table: "mission_items" },
                    () => fetchMissions("assigned", true))
                .subscribe();
        }

        return () => {
            supabaseRealtime.removeChannel(ch);
            if (ch2) supabaseRealtime.removeChannel(ch2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, box]);

    const stats = useMemo(() => ({
        pending: missions.filter(m => m.status === "PENDING" || m.status === "IN_PROGRESS").length,
        review: missions.filter(m => m.status === "SUBMITTED").length,
        done: missions.filter(m => m.status === "APPROVED").length,
    }), [missions]);

    const sectionMissions = useMemo(() => {
        if (section === "progress") return missions.filter(m => PROGRESS_STATUSES.includes(m.status));
        if (section === "history") return missions.filter(m => m.status === "APPROVED");
        return missions;
    }, [missions, section]);

    const filteredMissions = useMemo(() => {
        if (!selectedDate) return sectionMissions;
        return sectionMissions.filter(m => {
            const iso = dateBasis === "due" ? m.due_date : m.created_at;
            return dateKeyOf(iso) === selectedDate;
        });
    }, [sectionMissions, selectedDate, dateBasis]);

    if (!user) return <DashboardLayout><PageSkeleton /></DashboardLayout>;

    return (
        <DashboardLayout>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {showCreate && (
                <CreateMissionModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchMissions(box); showToast("Misi berhasil dibuat 🎯", "ok"); }}
                />
            )}
            {detail?.mode === "assignee" && (
                <MissionDetailAssignee
                    mission={detail.m} onClose={() => setDetail(null)}
                    onChanged={() => { setDetail(null); fetchMissions(box); }}
                    onMissionUpdated={patchLocalMission} showToast={showToast}
                />
            )}
            {detail?.mode === "reviewer" && (
                <MissionDetailReviewer
                    mission={detail.m} currentUser={{ id: user.id, roles }}
                    onClose={() => setDetail(null)}
                    onChanged={() => { setDetail(null); fetchMissions(box); }}
                    showToast={showToast}
                />
            )}
            {confirmDelete && (
                <ConfirmDeleteModal
                    mission={confirmDelete}
                    deleting={deleting}
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={handleQuickDelete}
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
                                <h1 className="text-xl font-black text-slate-900 tracking-tight">{SECTION_META[section].title}</h1>
                                <p className="text-[11px] mt-0.5" style={{ color: "#94a3b8" }}>{SECTION_META[section].subtitle}</p>
                            </div>
                        </div>
                        {iCanAssign && section === "dashboard" && (
                            <button onClick={() => setShowCreate(true)}
                                className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95"
                                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.3)" }}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                Beri Misi
                            </button>
                        )}
                    </div>

                    {/* Stats */}
                    {!showStructure && (
                        <div className="grid grid-cols-3 gap-3">
                            <MiniStat icon="⚙️" value={stats.pending} label="Sedang Berjalan" accent="linear-gradient(180deg,#60a5fa,#2563eb)" />
                            <MiniStat icon="📤" value={stats.review} label="Menunggu ACC" accent="linear-gradient(180deg,#fbbf24,#d97706)" />
                            <MiniStat icon="✅" value={stats.done} label="Selesai" accent="linear-gradient(180deg,#34d399,#059669)" />
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="bg-white rounded-2xl p-1.5" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                        <div className="flex gap-1.5">
                            {([
                                { key: "received", label: "Misi Saya", emoji: "📥", onClick: () => { setBox("received"); setShowStructure(false); }, active: !showStructure && box === "received" },
                                ...(iCanAssign ? [{ key: "assigned", label: "Diberikan", emoji: "📌", onClick: () => { setBox("assigned"); setShowStructure(false); }, active: !showStructure && box === "assigned" }] : []),
                                ...(iAmAdmin && section === "dashboard" ? [{ key: "all", label: "Semua Misi", emoji: "🗂️", onClick: () => router.push("/dashboard/missions/all"), active: false }] : []),
                                ...(section === "dashboard" ? [{ key: "structure", label: "Hak Akses", emoji: "🧭", onClick: () => setShowStructure(true), active: showStructure }] : []),
                            ]).map(t => (
                                <button key={t.key} onClick={t.onClick}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all"
                                    style={t.active ? { background: "linear-gradient(135deg, #0f0c29, #1a1545)", color: "#fff", boxShadow: "0 4px 12px rgba(15,12,41,0.25)" }
                                        : { background: "#f5f7ff", color: "#64748b" }}>
                                    <span>{t.emoji}</span><span>{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Konten */}
                    {showStructure ? (
                        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #f0f0f8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                            <div className="px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid #f5f5fb", background: "#fafbff" }}>
                                <div className="flex items-center gap-2.5">
                                    <div className="w-1 h-4 rounded-full" style={{ background: "linear-gradient(180deg,#6366f1,#8b5cf6)" }} />
                                    <div>
                                        <p className="text-sm font-black text-slate-800">Struktur Hak Akses Misi</p>
                                        <p className="text-[10.5px] text-slate-400 mt-0.5">Atasan bisa beri misi ke bawahan di bawah garisnya</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-3.5">
                                <AccessTree mine={mineRoles} />
                            </div>

                            <div className="px-4 pb-3 flex flex-col gap-1.5 text-[10px]" style={{ color: "#94a3b8" }}>
                                <span className="inline-flex items-center gap-1.5">
                                    <span style={{ width: 10, height: 10, borderRadius: 99, background: "#a78bfa", display: "inline-block", boxShadow: "0 0 0 2px #ddd6fe" }} /> Peran kamu
                                </span>
                                <span>💡 <b>Finance</b> & <b>Masak</b> belum jadi role sistem — untuk sekarang tugas Finance dijalankan lewat akun Akses Penuh (Admin/Asisten CEO).</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Kalender filter */}
                            <MissionCalendar
                                missions={sectionMissions}
                                basis={dateBasis}
                                selectedDate={selectedDate}
                                onSelectDate={setSelectedDate}
                                onBasisChange={setDateBasis}
                            />

                            {/* Banner tanggal terpilih */}
                            {selectedDate && (
                                <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
                                    style={{ background: "linear-gradient(135deg,#f5f3ff,#faf5ff)", border: "1px solid #ddd6fe" }}>
                                    <span className="text-xl">📌</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-black text-violet-800">{fmtDayLabel(selectedDate)}</p>
                                        <p className="text-[11px] text-violet-500">
                                            {filteredMissions.length} misi · basis {dateBasis === "due" ? "tenggat" : "dibuat"}
                                        </p>
                                    </div>
                                    <button onClick={() => setSelectedDate(null)}
                                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white text-violet-600 border border-violet-200 hover:bg-violet-50 transition flex-shrink-0">
                                        Reset
                                    </button>
                                </div>
                            )}

                            {loading ? (
                                <div className="space-y-3">{Array(4).fill(0).map((_, i) => <CardSkeleton key={i} />)}</div>
                            ) : filteredMissions.length === 0 ? (
                                <div className="bg-white rounded-2xl text-center py-16" style={{ border: "1px solid #f0f0f8" }}>
                                    <div className="text-4xl mb-3">🗒️</div>
                                    {selectedDate ? (
                                        <>
                                            <p className="text-sm font-bold text-slate-600">Tidak ada misi pada tanggal ini</p>
                                            <button onClick={() => setSelectedDate(null)} className="text-xs mt-2 font-bold text-violet-600 hover:underline">
                                                Lihat semua misi
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm font-bold text-slate-600">
                                                {box === "received" ? "Belum ada misi untukmu" : "Belum ada misi yang kamu berikan"}
                                            </p>
                                            <p className="text-xs mt-1 text-slate-400">
                                                {box === "received" ? "Tugas dari atasan akan muncul di sini" : "Klik \"Beri Misi\" untuk mulai menugaskan"}
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredMissions.map(m => (
                                        <MissionCard
                                            key={m.id}
                                            m={m}
                                            view={box}
                                            onOpen={() => setDetail({ m, mode: box === "assigned" ? "reviewer" : "assignee" })}
                                            onQuickDelete={box === "assigned" ? (mission) => setConfirmDelete(mission) : undefined}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <style jsx global>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .animate-slideIn { animation: slideIn 0.3s cubic-bezier(0.16,1,0.3,1); }
        .animate-scaleIn { animation: scaleIn 0.22s cubic-bezier(0.16,1,0.3,1); }

        /* Vertical tree — hanya scroll vertikal, tidak geser samping */
        .vt-branch { margin-left: 12px; }
        .vt-node { position: relative; padding-left: 20px; }
        .vt-line { position: absolute; left: 5px; top: 0; width: 2px; height: 100%; background: #e2e8f0; }
        .vt-node.vt-last > .vt-line { height: 18px; }
        .vt-elbow { position: absolute; left: 5px; top: 17px; width: 13px; height: 2px; background: #e2e8f0; }
        .vt-item { padding: 3px 0; }
        .vt-item--root { padding-bottom: 6px; }
        .vt-chip {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 11px; border: 1.5px solid #eef2f7; border-radius: 12px;
          background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.04); max-width: 100%;
        }
        .vt-chip--root {
          background: linear-gradient(135deg,#0f0c29,#1a1545); border-color: transparent;
          box-shadow: 0 6px 18px rgba(15,12,41,0.3); padding: 8px 13px; gap: 9px;
        }
        .vt-dot { width: 8px; height: 8px; border-radius: 99px; flex: 0 0 auto; }
        .vt-emoji { font-size: 13px; flex: 0 0 auto; }
        .vt-label { font-size: 11.5px; font-weight: 700; line-height: 1.2; }
        .vt-you { font-size: 8.5px; font-weight: 800; color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 1px 5px; border-radius: 99px; flex: 0 0 auto; }
      `}</style>
        </DashboardLayout>
    );
}