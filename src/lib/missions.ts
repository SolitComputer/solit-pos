// src/lib/missions.ts
// Sistem "Misi Pekerjaan" — helper penugasan + metadata status.
// PURE module (tanpa import server) supaya bisa dipakai di client & server.

import type { UserRole } from "@/lib/permissions";

export type MissionStatus =
    | "PENDING"
    | "IN_PROGRESS"
    | "SUBMITTED"
    | "APPROVED"
    | "REJECTED";

export type MissionPriority = "LOW" | "MEDIUM" | "HIGH";

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];

/**
 * Peta penugasan misi: role atasan → daftar role yang boleh diberi misi.
 *
 * Beda dari DIVISION_MAP (dipakai absensi) karena rantai komando misi
 * mengikuti struktur operasional yang kamu minta.
 *
 * FULL_ACCESS (ADMIN/CEO, PROGRAMMER, ASISTEN_CEO) TIDAK perlu didaftarkan —
 * mereka otomatis boleh assign ke SEMUA role (lihat isMissionFullAccess).
 *
 * CATATAN: role "finance" & "masak" pada struktur yang kamu kirim BELUM ada
 * di UserRole. Kalau nanti ditambahkan, tinggal buka komentar di bawah.
 */
export const MISSION_ASSIGN_MAP: Record<string, UserRole[]> = {
    KEPALA_MARKETING: ["KEPALA_SALES", "KONTEN", "MARKETING"],
    KEPALA_SALES: ["CREW_SALES", "PENGANTARAN"],
    KEPALA_TEKNISI: ["CUSTOMER_SERVICE", "TEKNISI"],
    KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG"],
    KEPALA_ONPOINT: ["ONPOINT"],
    KEPALA_SOTECH: ["SOTECH"],
    KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG"],
    ACCOUNTING: ["PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"],

    // ── Belum ada role-nya di UserRole — aktifkan kalau sudah dibuat ──
    // FINANCE: ["CREW_SALES", "MARKETING", "KEPALA_TEKNISI"],
    // (contoh "masak" biasanya penerima misi saja, bukan pemberi)
};

export function isMissionFullAccess(userRoles: string[]): boolean {
    return userRoles.some(r => FULL_ACCESS_ROLES.includes(r));
}

/** Union semua role target yang boleh diberi misi oleh user. */
export function assignableRoleSet(userRoles: string[]): Set<string> {
    const set = new Set<string>();
    for (const r of userRoles) {
        for (const t of MISSION_ASSIGN_MAP[r] ?? []) set.add(t);
    }
    return set;
}

/** Apakah user boleh memberi misi (punya minimal 1 target atau full access)? */
export function canAssignMissions(userRoles: string[]): boolean {
    if (isMissionFullAccess(userRoles)) return true;
    return assignableRoleSet(userRoles).size > 0;
}

/**
 * Apakah user boleh memberi misi ke target (berdasarkan roles target).
 * Target valid jika SALAH SATU role-nya ada di assignable set.
 */
export function canAssignToTarget(userRoles: string[], targetRoles: string[]): boolean {
    if (isMissionFullAccess(userRoles)) return true;
    const set = assignableRoleSet(userRoles);
    return targetRoles.some(r => set.has(r));
}

/** Apakah user boleh me-review (ACC / tolak) sebuah misi. */
export function canReviewMission(
    user: { id: string; roles: string[] },
    mission: { assigned_by: string }
): boolean {
    if (isMissionFullAccess(user.roles)) return true;
    return mission.assigned_by === user.id; // pemberi misi yang berhak ACC
}

export const MISSION_STATUS_META: Record<
    MissionStatus,
    {
        label: string;
        bg: string;
        text: string;
        border: string;
        icon: string;
    }
> = {
    PENDING: { label: "Menunggu", bg: "#f8fafc", text: "#475569", border: "#e2e8f0", icon: "🕒" },
    IN_PROGRESS: { label: "Dikerjakan", bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", icon: "⚙️" },
    SUBMITTED: { label: "Menunggu ACC", bg: "#fffbeb", text: "#b45309", border: "#fde68a", icon: "📤" },
    APPROVED: { label: "Disetujui", bg: "#ecfdf5", text: "#059669", border: "#a7f3d0", icon: "✅" },
    REJECTED: { label: "Ditolak", bg: "#fff1f2", text: "#be123c", border: "#fecdd3", icon: "❌" },
};

export const MISSION_PRIORITY_META: Record<
    MissionPriority,
    {
        label: string;
        bg: string;
        text: string;
        border: string;
        icon: string;
    }
> = {
    LOW: {
        label: "Rendah",
        bg: "#f1f5f9",
        text: "#475569",
        border: "#e2e8f0",
        icon: "⬇️",
    },
    MEDIUM: {
        label: "Sedang",
        bg: "#eff6ff",
        text: "#1d4ed8",
        border: "#bfdbfe",
        icon: "➡️",
    },
    HIGH: {
        label: "Tinggi",
        bg: "#fff1f2",
        text: "#be123c",
        border: "#fecdd3",
        icon: "🔥",
    },
};

export interface MissionUserRef {
    id: string;
    name: string;
    role?: string | null;
    roles?: string[] | null;
}

export interface Mission {
    id: string;
    title: string;
    description: string | null;
    status: MissionStatus;
    priority: MissionPriority;
    due_date: string | null;
    proof_photo_url: string | null;
    proof_note: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
    assigned_by: string;
    assigned_to: string;
    assigner?: MissionUserRef | null;
    assignee?: MissionUserRef | null;
    reviewer?: MissionUserRef | null;
    items?: MissionItem[] | null;   
}

export interface MissionItem {
    id: string;
    mission_id: string;
    text: string;
    is_done: boolean;
    done_at: string | null;
    sort_order: number;
}

export function missionProgress(
    items?: MissionItem[] | null
): { done: number; total: number; percent: number } {
    const list = items ?? [];
    const total = list.length;
    const done = list.filter(i => i.is_done).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, percent };
}