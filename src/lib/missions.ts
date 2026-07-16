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

const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];


export const MISSION_ASSIGN_MAP: Record<string, UserRole[]> = {
    KEPALA_MARKETING: ["KEPALA_SALES", "KONTEN", "MARKETING", "PKL_MARKETING", "PKL_KONTEN"],
    KEPALA_SALES: ["CREW_SALES", "PENGANTARAN", "PKL_SALES", "PKL_PENGANTARAN"],
    KEPALA_TEKNISI: ["CUSTOMER_SERVICE", "TEKNISI", "PKL_TEKNISI", "PKL_CUSTOMER_SERVICE"],
    KEPALA_PENYEDIA_BARANG: ["PENYEDIA_BARANG", "PKL_PENYEDIA_BARANG"],
    KEPALA_ONPOINT: ["ONPOINT", "PKL_ONPOINT"],
    KEPALA_SOTECH: ["SOTECH", "PKL_SOTECH"],
    KEPALA_PENGELOLA_BARANG: ["PENGELOLA_BARANG", "PKL_PENGELOLA_BARANG"],
    ACCOUNTING: ["PENGELOLA_BARANG", "KEPALA_PENGELOLA_BARANG"],


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
    PENDING: { label: "Audit", bg: "#f8fafc", text: "#475569", border: "#e2e8f0", icon: "clock" },
    IN_PROGRESS: { label: "On Progress", bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", icon: "settings" },
    SUBMITTED: { label: "Audit", bg: "#fffbeb", text: "#b45309", border: "#fde68a", icon: "search" },
    APPROVED: { label: "Disetujui", bg: "#ecfdf5", text: "#059669", border: "#a7f3d0", icon: "check" },
    REJECTED: { label: "Ditolak", bg: "#fff1f2", text: "#be123c", border: "#fecdd3", icon: "x" },
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
        icon: "arrow-down",
    },
    MEDIUM: {
        label: "Sedang",
        bg: "#eff6ff",
        text: "#1d4ed8",
        border: "#bfdbfe",
        icon: "arrow-right",
    },
    HIGH: {
        label: "Tinggi",
        bg: "#fff1f2",
        text: "#be123c",
        border: "#fecdd3",
        icon: "flame",
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