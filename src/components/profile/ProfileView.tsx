"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import imageCompression from "browser-image-compression";
import { humanizeRoleKey } from "@/lib/permissions";
import {
    Camera, Trash2, Trophy, Flame, Clock, CalendarCheck,
    Loader2, Pencil, Check, X,
} from "lucide-react";

interface ProfileData {
    id: string;
    name: string;
    role: string;
    roles: string[];
    bio: string | null;
    bio_created_at: string | null;
    profile_photo_url: string | null;
}

interface AchievementBlock {
    daysThisMonth?: number;
    onTimeThisMonth?: number;
    sessionsThisMonth?: number;
    hoursThisMonth?: number;
    rankThisMonth: number | null;
    totalRanked: number;
    isTopThisMonth: boolean;
    personalBest: { month: string; days?: number; hours?: number } | null;
    isCompanyRecordHolder: boolean;
}
interface AchievementsData {
    month: string;
    attendance: AchievementBlock;
    overtime: AchievementBlock;
}

const ADMIN_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING"];

function getInitials(name: string) {
    return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function monthLabel(key: string) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
function formatBioDate(iso: string) {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className={`fixed top-4 right-4 left-4 sm:left-auto sm:top-5 sm:right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold ${type === "ok" ? "bg-white text-slate-700 border border-slate-100" : "bg-white text-red-600 border border-red-100"}`}>
            {msg}
        </div>
    );
}

export default function ProfileView({ userId }: { userId: string }) {
    const [currentUser, setCurrentUser] = useState<{ id: string; role: string; roles?: string[] } | null>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [achievements, setAchievements] = useState<AchievementsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editingBio, setEditingBio] = useState(false);
    const [bioDraft, setBioDraft] = useState("");
    const [savingBio, setSavingBio] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });
    const isSelf = currentUser?.id === userId;
    const callerRoles = currentUser?.roles?.length ? currentUser.roles : [currentUser?.role].filter(Boolean) as string[];
    const isAdmin = callerRoles.some((r) => ADMIN_ROLES.includes(r));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [meRes, profileRes, achRes] = await Promise.all([
                fetch("/api/auth/me"),
                fetch(`/api/profile?userId=${userId}`),
                fetch(`/api/achievements?userId=${userId}`),
            ]);
            const meData = await meRes.json();
            const profileData = await profileRes.json();
            const achData = await achRes.json();
            if (meData.user) setCurrentUser(meData.user);
            if (profileData.success) { setProfile(profileData.data); setBioDraft(profileData.data.bio ?? ""); }
            if (achData.success) setAchievements(achData.data);
        } catch {
            showToast("Gagal memuat profil", "err");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setUploading(true);
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 800, useWebWorker: true });
            const form = new FormData();
            form.append("file", compressed, compressed.name || "avatar.jpg");
            if (!isSelf) form.append("user_id", userId);
            const res = await fetch("/api/profile/photo", { method: "POST", body: form });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, profile_photo_url: data.data.profile_photo_url } : p));
                if (isSelf) {
                    window.dispatchEvent(new CustomEvent("solit:profile-updated", {
                        detail: { profile_photo_url: data.data.profile_photo_url },
                    }));
                }
                showToast("Foto profil berhasil diperbarui", "ok");
            } else {
                showToast(data.message ?? "Gagal upload foto", "err");
            }
        } catch {
            showToast("Terjadi kesalahan saat memproses foto", "err");
        } finally {
            setUploading(false);
        }
    };

    const handleDeletePhoto = async () => {
        setDeleting(true);
        try {
            const res = await fetch("/api/profile/photo", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId }),
            });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, profile_photo_url: null } : p));
                showToast("Foto profil berhasil dihapus", "ok");
            } else {
                showToast(data.message ?? "Gagal menghapus foto", "err");
            }
        } catch {
            showToast("Terjadi kesalahan", "err");
        } finally {
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const handleSaveBio = async () => {
        setSavingBio(true);
        try {
            const res = await fetch("/api/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bio: bioDraft }),
            });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, bio: bioDraft, bio_created_at: data.data?.bio_created_at ?? p.bio_created_at } : p));
                setEditingBio(false);
                showToast("Bio berhasil disimpan", "ok");
            } else {
                showToast(data.message ?? "Gagal menyimpan bio", "err");
            }
        } catch {
            showToast("Terjadi kesalahan", "err");
        } finally {
            setSavingBio(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
                <div className="h-40 rounded-3xl bg-white animate-pulse border border-slate-100" />
                <div className="h-24 rounded-2xl bg-white animate-pulse border border-slate-100" />
            </div>
        );
    }
    if (!profile) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-16 text-center">
                <p className="text-sm font-bold text-slate-500">User tidak ditemukan</p>
            </div>
        );
    }

    const roles = profile.roles?.length ? profile.roles : [profile.role];

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4 sm:space-y-5">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={() => setConfirmDelete(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#fff1f2", border: "1px solid #fecaca" }}>
                            <Trash2 className="w-8 h-8" style={{ color: "#dc2626" }} />
                        </div>
                        <h3 className="font-black text-slate-800 text-center text-base mb-1">Hapus Foto {profile.name}?</h3>
                        <p className="text-sm text-slate-400 text-center mb-6">Foto profil akan dihapus permanen.</p>
                        <div className="flex gap-2.5">
                            <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                                className="flex-1 h-10 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: "#f1f5f9", color: "#64748b" }}>
                                Batal
                            </button>
                            <button onClick={handleDeletePhoto} disabled={deleting}
                                className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)" }}>
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Ya, Hapus</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-3xl overflow-hidden border border-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div className="h-24 sm:h-28" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }} />
                <div className="px-5 sm:px-7 pb-6">
                    <div className="flex items-end justify-between -mt-10 sm:-mt-12">
                        <div className="relative">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white overflow-hidden bg-slate-100 flex items-center justify-center text-white text-2xl font-black"
                                style={{ background: profile.profile_photo_url ? undefined : "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                                {profile.profile_photo_url
                                    ? <img src={profile.profile_photo_url} alt={profile.name} className="w-full h-full object-cover" />
                                    : getInitials(profile.name)}
                            </div>
                            {(isSelf || isAdmin) && (
                                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Ganti foto profil"
                                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:scale-110 transition-all disabled:opacity-50">
                                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : <Camera className="w-3.5 h-3.5 text-slate-600" />}
                                </button>
                            )}
                            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelected} />
                        </div>
                        {isAdmin && !isSelf && profile.profile_photo_url && (
                            <button onClick={() => setConfirmDelete(true)}
                                className="mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                                style={{ background: "#fff1f2", color: "#dc2626", border: "1px solid #fecdd3" }}>
                                <Trash2 className="w-3.5 h-3.5" /> Hapus Foto
                            </button>
                        )}
                    </div>

                    <div className="mt-3">
                        <h1 className="text-lg font-black text-slate-900">{profile.name}</h1>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {roles.map((r) => (
                                <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                                    {humanizeRoleKey(r)}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4">
                        {editingBio ? (
                            <div className="space-y-2">
                                <textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value.slice(0, 280))} rows={3}
                                    placeholder="Tulis bio singkat tentang dirimu..."
                                    className="w-full rounded-xl px-3.5 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#334155" }} />
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">{bioDraft.length}/280</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditingBio(false); setBioDraft(profile.bio ?? ""); }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "#f1f5f9", color: "#64748b" }}>
                                            <X className="w-3 h-3 inline mr-1" /> Batal
                                        </button>
                                        <button onClick={handleSaveBio} disabled={savingBio}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                                            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                                            {savingBio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Simpan
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        {profile.bio || <span className="italic text-slate-300">Belum ada bio</span>}
                                    </p>
                                    {isSelf && (
                                        <button onClick={() => setEditingBio(true)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {profile.bio && profile.bio_created_at && (
                                    <p className="text-[10px] text-slate-300 mt-1">Dibuat pada {formatBioDate(profile.bio_created_at)}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {achievements && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <AchievementCard
                        icon={<CalendarCheck className="w-5 h-5" />} title="Kehadiran Bulan Ini" monthLabel={monthLabel(achievements.month)}
                        value={`${achievements.attendance.daysThisMonth} hari`} sub={`${achievements.attendance.onTimeThisMonth} kali tepat waktu`}
                        rank={achievements.attendance.rankThisMonth} totalRanked={achievements.attendance.totalRanked}
                        isRecord={achievements.attendance.isCompanyRecordHolder}
                        personalBest={achievements.attendance.personalBest ? `Rekor pribadi: ${achievements.attendance.personalBest.days} hari (${monthLabel(achievements.attendance.personalBest.month)})` : null}
                        accent="linear-gradient(180deg, #34d399, #059669)"
                    />
                    <AchievementCard
                        icon={<Clock className="w-5 h-5" />} title="Lembur Bulan Ini" monthLabel={monthLabel(achievements.month)}
                        value={`${achievements.overtime.hoursThisMonth} jam`} sub={`${achievements.overtime.sessionsThisMonth} sesi lembur`}
                        rank={achievements.overtime.rankThisMonth} totalRanked={achievements.overtime.totalRanked}
                        isRecord={achievements.overtime.isCompanyRecordHolder}
                        personalBest={achievements.overtime.personalBest ? `Rekor pribadi: ${achievements.overtime.personalBest.hours} jam (${monthLabel(achievements.overtime.personalBest.month)})` : null}
                        accent="linear-gradient(180deg, #fbbf24, #d97706)"
                    />
                </div>
            )}
        </div>
    );
}

function AchievementCard({
    icon, title, monthLabel, value, sub, rank, totalRanked, isRecord, personalBest, accent,
}: {
    icon: React.ReactNode; title: string; monthLabel: string; value: string; sub: string;
    rank: number | null; totalRanked: number; isRecord: boolean;
    personalBest: string | null; accent: string;
}) {
    // Achievement (lencana peringkat) hanya untuk yang masuk 5 besar bulan ini.
    // Statistik mentah (hari/jam) tetap tampil untuk semua orang.
    const hasAchievement = rank !== null && rank <= 5;

    return (
        <div className="bg-white rounded-2xl p-4 sm:p-5 relative overflow-hidden border border-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: accent }} />
            <div className="pl-2.5 sm:pl-3">
                <div className="flex items-start justify-between mb-2">
                    <span className="text-slate-700">{icon}</span>
                    {hasAchievement && <RankBadge rank={rank as number} />}
                </div>
                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>{title} · {monthLabel}</p>
                <p className="text-2xl font-black mt-1" style={{ color: "#0f172a" }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>{sub}</p>
                {rank && <p className="text-[10.5px] mt-1.5 font-semibold text-slate-400">Peringkat #{rank} dari {totalRanked} orang</p>}
                {personalBest && (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-1.5">
                        {isRecord ? <Trophy className="w-3.5 h-3.5" style={{ color: "#d97706" }} /> : <Flame className="w-3.5 h-3.5 text-slate-300" />}
                        <p className="text-[10.5px] font-semibold" style={{ color: isRecord ? "#d97706" : "#94a3b8" }}>
                            {personalBest}{isRecord ? " — Rekor Perusahaan!" : ""}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function RankBadge({ rank }: { rank: number }) {
    const tier: "gold" | "silver" | "bronze" = rank === 1 ? "gold" : rank <= 3 ? "silver" : "bronze";
    const stops: Record<typeof tier, [string, string, string]> = {
        gold: ["#fde047", "#f59e0b", "#b45309"],
        silver: ["#f8fafc", "#94a3b8", "#475569"],
        bronze: ["#fdba74", "#c2410c", "#7c2d12"],
    };
    const [c1, c2, c3] = stops[tier];
    const gradId = `rank-grad-${tier}-${rank}`;

    return (
        <div className="w-9 h-9 flex-shrink-0" title={`Peringkat #${rank} bulan ini`}>
            <svg viewBox="0 0 100 100" className="w-full h-full" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))" }}>
                <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={c1} />
                        <stop offset="55%" stopColor={c2} />
                        <stop offset="100%" stopColor={c3} />
                    </linearGradient>
                </defs>
                <polygon points="50,3 90,25 90,70 50,97 10,70 10,25" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.65)" strokeWidth="2" />
                <polygon points="50,15 78,32 78,64 50,85 22,64 22,32" fill="rgba(255,255,255,0.18)" />
                <text x="50" y="60" textAnchor="middle" fontSize="36" fontWeight="900" fill="#fff">
                    {rank}
                </text>
            </svg>
        </div>
    );
}