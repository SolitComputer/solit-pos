"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import imageCompression from "browser-image-compression";
import { humanizeRoleKey } from "@/lib/permissions";
import ImageCropModal from "./ImageCropModal";
import { useSongPicker, SavedSong } from "@/components/social/song/useSongPicker";
import SongPickerPanel from "@/components/social/song/SongPickerPanel";
import { getAuthUser } from "@/hooks/useAuthUser";
import { ContractBadge } from "@/components/contracts/ContractBadge";
import { CareerLevelBadge } from "@/components/contracts/CareerLevelBadge";
import ContractInfoModal from "@/components/contracts/ContractInfoModal";
import {
    Camera, Trash2, Trophy, Flame, Clock, CalendarCheck,
    Loader2, Pencil, Check, X, Music, Play, Pause,
    MessageCircle, Eye, CheckCircle2, AlertCircle,
} from "lucide-react";

interface ProfileData {
    id: string;
    name: string;
    role: string;
    roles: string[];
    bio: string | null;
    bio_created_at: string | null;
    profile_photo_url: string | null;
    banner_url: string | null;
    status_note: string | null;
    status_note_expires_at: string | null;
    song_title: string | null;
    song_artist: string | null;
    song_artwork_url: string | null;
    song_preview_url: string | null;
    song_clip_start: number;
    song_expires_at: string | null;
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
const CLIP_LENGTH = 30;

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
function noteTimeLeft(expiresAtIso: string): string {
    const diffMs = new Date(expiresAtIso).getTime() - Date.now();
    if (diffMs <= 0) return "Kadaluarsa";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours >= 1) return `${hours} jam lagi`;
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${minutes} menit lagi`;
}
function daysUntilDate(dateStr: string): number {
    const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return Math.ceil((new Date(dateStr).getTime() - new Date(todayWIB).getTime()) / 86400000);
}

function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
    const Icon = type === "ok" ? CheckCircle2 : AlertCircle;
    return (
        <div className={`fixed top-4 right-4 left-4 sm:left-auto sm:top-5 sm:right-5 sm:max-w-sm z-[9999] flex items-start gap-2.5 pl-3.5 pr-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold bg-white border ${type === "ok" ? "border-emerald-100" : "border-red-100"}`}
            style={{ boxShadow: "0 14px 34px rgba(15,12,41,0.14)" }}>
            <span className={`mt-0.5 flex-shrink-0 ${type === "ok" ? "text-emerald-500" : "text-red-500"}`}>
                <Icon className="w-4 h-4" />
            </span>
            <span className={type === "ok" ? "text-slate-700" : "text-red-600"}>{msg}</span>
        </div>
    );
}

export default function ProfileView({ userId }: { userId: string }) {
    const [currentUser, setCurrentUser] = useState<{ id: string; role: string; roles?: string[] } | null>(null);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [achievements, setAchievements] = useState<AchievementsData | null>(null);
    const [qualityRank, setQualityRank] = useState<{ level: number; isPermanent: boolean; isTemporary: boolean; streakMonths: number; isOngoingMonth: boolean } | null>(null);
    const [kerjaRank, setKerjaRank] = useState<{ level: number; isPermanent: boolean; isTemporary: boolean; streakMonths: number; isOngoingMonth: boolean } | null>(null);
    const [deliveryBadge, setDeliveryBadge] = useState<{ total: number; rank: number; totalRanked: number; milestone: number; hasBadge: boolean } | null>(null);
    const [providerBadge, setProviderBadge] = useState<{ total: number; rank: number; totalRanked: number; milestone: number; hasBadge: boolean } | null>(null);
    const [salesBadge, setSalesBadge] = useState<{ total: number; rank: number; totalRanked: number; milestone: number; hasBadge: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [editingBio, setEditingBio] = useState(false);
    const [bioDraft, setBioDraft] = useState("");
    const [savingBio, setSavingBio] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [showPhotoActions, setShowPhotoActions] = useState(false);
    const [cropTarget, setCropTarget] = useState<{ type: "avatar" | "banner"; src: string; fileName: string } | null>(null);

    const [editingNote, setEditingNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");
    const [savingNote, setSavingNote] = useState(false);

    const [viewers, setViewers] = useState<{ id: string; name: string; profile_photo_url: string | null; viewed_at: string }[]>([]);
    const [showViewers, setShowViewers] = useState(false);

    const [removingSong, setRemovingSong] = useState(false);
    const [playingPreview, setPlayingPreview] = useState(false);
    const [showInfoPopup, setShowInfoPopup] = useState(false);
    const [showSongPicker, setShowSongPicker] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const [contractInfo, setContractInfo] = useState<{
        id: string; title: string; content: string; status: string;
        valid_from: string | null; valid_until: string | null; career_level: string | null;
        user_signature_url: string | null; user_signed_at: string | null;
        admin_signature_url: string | null; admin_signed_at: string | null;
        admin?: { name: string } | null;
    } | null>(null);
    const [showContractModal, setShowContractModal] = useState(false);

    const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });
    const isSelf = currentUser?.id === userId;
    const callerRoles = currentUser?.roles?.length ? currentUser.roles : [currentUser?.role].filter(Boolean) as string[];
    const isAdmin = callerRoles.some((r) => ADMIN_ROLES.includes(r));
    const canViewOthersContract = callerRoles.some((r) => ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"].includes(r));

    const songPicker = useSongPicker(
        (song: SavedSong) => {
            setProfile((p) => (p ? {
                ...p,
                song_title: song.title,
                song_artist: song.artist,
                song_artwork_url: song.artwork_url,
                song_preview_url: song.preview_url,
                song_clip_start: song.clip_start,
                song_expires_at: song.expires_at,
            } : p));
            setPlayingPreview(false);
            showToast("Lagu berhasil ditambahkan", "ok");
            setShowSongPicker(false);
        },
        (msg) => showToast(msg, "err")
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [meRes, profileRes, achRes, qualityRes, kerjaRes, deliveryRes, providerRes, salesRes] = await Promise.all([
                getAuthUser().then(u => ({ ok: true, json: () => Promise.resolve({ success: true, user: u }) })),
                fetch(`/api/profile?userId=${userId}`),
                fetch(`/api/achievements?userId=${userId}`),
                fetch(`/api/attendance/quality-rank?userId=${userId}`),
                fetch(`/api/leaderboard-kerja/quality-rank?userId=${userId}`),
                fetch(`/api/preparation/delivery-milestones?userId=${userId}`),
                fetch(`/api/preparation/provider-milestones?userId=${userId}`),
                fetch(`/api/transaction/sales-milestones?userId=${userId}`),
            ]);
            const meData = await meRes.json();
            const profileData = await profileRes.json();
            const achData = await achRes.json();
            const qualityData = await qualityRes.json();
            const kerjaData = await kerjaRes.json();
            const deliveryData = await deliveryRes.json();
            const providerData = await providerRes.json();
            const salesData = await salesRes.json();
            if (meData.user) setCurrentUser(meData.user);
            if (profileData.success) { setProfile(profileData.data); setBioDraft(profileData.data.bio ?? ""); }
            if (achData.success) setAchievements(achData.data);
            if (qualityData.success) setQualityRank(qualityData.data);
            if (kerjaData.success) setKerjaRank(kerjaData.data);
            if (deliveryData.success) setDeliveryBadge(deliveryData.data);
            if (providerData.success) setProviderBadge(providerData.data);
            if (salesData.success) setSalesBadge(salesData.data);
        } catch {
            showToast("Gagal memuat profil", "err");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!currentUser) return;
        if (isSelf) {
            fetch("/api/contracts/me")
                .then((r) => r.json())
                .then((d) => {
                    if (d.success && d.gate_enabled !== false) {
                        setContractInfo(
                            d.contract
                                ? { ...d.contract, status: d.contract_status ?? d.contract.status }
                                : {
                                    id: "", title: "", content: "", status: d.contract_status ?? "NONE",
                                    valid_from: null, valid_until: null, career_level: d.career_level ?? null,
                                    user_signature_url: null, user_signed_at: null,
                                    admin_signature_url: null, admin_signed_at: null, admin: null,
                                }
                        );
                    }
                })
                .catch(() => { });
        } else if (canViewOthersContract) {
            fetch(`/api/contracts?user_id=${userId}`)
                .then((r) => r.json())
                .then((d) => {
                    if (d.success) {
                        const latest = (d.data || [])[0];
                        setContractInfo(
                            latest
                                ? { ...latest }
                                : {
                                    id: "", title: "", content: "", status: "NONE",
                                    valid_from: null, valid_until: null, career_level: null,
                                    user_signature_url: null, user_signed_at: null,
                                    admin_signature_url: null, admin_signed_at: null, admin: null,
                                }
                        );
                    }
                })
                .catch(() => { });
        }
    }, [currentUser, isSelf, canViewOthersContract, userId]);

    useEffect(() => {
        if (!isSelf || !profile?.status_note) { setViewers([]); return; }
        fetch(`/api/profile/note/views?ownerId=${userId}`)
            .then((r) => r.json())
            .then((d) => { if (d.success) setViewers(d.data); })
            .catch(() => { });
    }, [isSelf, profile?.status_note, userId]);

    const handleSaveNote = async () => {
        const trimmed = noteDraft.trim();
        if (!trimmed) { setEditingNote(false); return; }
        setSavingNote(true);
        try {
            const res = await fetch("/api/profile/note", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note: trimmed }),
            });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, status_note: trimmed, status_note_expires_at: data.data.expires_at } : p));
                setEditingNote(false);
                setNoteDraft("");
                showToast("Catatan berhasil dibuat", "ok");
            } else {
                showToast(data.message ?? "Gagal membuat catatan", "err");
            }
        } catch {
            showToast("Terjadi kesalahan", "err");
        } finally {
            setSavingNote(false);
        }
    };

    const handleRemoveNote = async () => {
        try {
            const res = await fetch("/api/profile/note", { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, status_note: null, status_note_expires_at: null } : p));
            }
        } catch {
            // diam-diam gagal
        }
    };

    const handleRemoveSong = async () => {
        setRemovingSong(true);
        try {
            const res = await fetch("/api/profile/song", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isSelf ? {} : { user_id: userId }),
            });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, song_title: null, song_artist: null, song_artwork_url: null, song_preview_url: null, song_clip_start: 0, song_expires_at: null } : p));
                setPlayingPreview(false);
                showToast("Lagu dihapus", "ok");
            } else {
                showToast(data.message ?? "Gagal menghapus lagu", "err");
            }
        } catch {
            showToast("Terjadi kesalahan", "err");
        } finally {
            setRemovingSong(false);
        }
    };

    const togglePreview = () => {
        const audio = audioRef.current;
        if (!audio || !profile) return;
        if (playingPreview) {
            audio.pause();
            setPlayingPreview(false);
        } else {
            audio.currentTime = 0;
            audio.play().catch(() => { });
            setPlayingPreview(true);
        }
    };

    const handleClosePopup = () => {
        audioRef.current?.pause();
        setPlayingPreview(false);
        setShowInfoPopup(false);
    };

    const handleMainTimeUpdate = () => {
        const audio = audioRef.current;
        if (!audio || !profile) return;
        if (audio.currentTime >= CLIP_LENGTH) {
            audio.pause();
            setPlayingPreview(false);
        }
    };

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setCropTarget({ type: "avatar", src: URL.createObjectURL(file), fileName: file.name || "avatar.jpg" });
    };

    const handleBannerFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setCropTarget({ type: "banner", src: URL.createObjectURL(file), fileName: file.name || "banner.jpg" });
    };

    const handleCropCancel = () => {
        if (cropTarget) URL.revokeObjectURL(cropTarget.src);
        setCropTarget(null);
    };

    // Dipanggil ImageCropModal setelah user tekan "Simpan" — terima hasil crop (blob),
    // lalu lanjut ke alur compress + upload yang sama seperti sebelumnya
    const handleCropConfirm = async (blob: Blob) => {
        if (!cropTarget) return;
        const { type, fileName } = cropTarget;
        URL.revokeObjectURL(cropTarget.src);
        setCropTarget(null);

        const croppedFile = new File([blob], fileName, { type: "image/jpeg" });

        if (type === "avatar") {
            setUploading(true);
            try {
                const compressed = await imageCompression(croppedFile, { maxSizeMB: 0.8, maxWidthOrHeight: 800, useWebWorker: true });
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
        } else {
            setUploadingBanner(true);
            try {
                const compressed = await imageCompression(croppedFile, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
                const form = new FormData();
                form.append("file", compressed, compressed.name || "banner.jpg");
                form.append("type", "banner");
                if (!isSelf) form.append("user_id", userId);
                const res = await fetch("/api/profile/photo", { method: "POST", body: form });
                const data = await res.json();
                if (data.success) {
                    setProfile((p) => (p ? { ...p, banner_url: data.data.banner_url } : p));
                    showToast("Banner berhasil diperbarui", "ok");
                } else {
                    showToast(data.message ?? "Gagal upload banner", "err");
                }
            } catch {
                showToast("Terjadi kesalahan saat memproses banner", "err");
            } finally {
                setUploadingBanner(false);
            }
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
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-0 py-6 sm:py-8 lg:py-10 space-y-4 sm:space-y-5">
                <div className="h-44 sm:h-52 lg:h-60 rounded-3xl bg-white animate-pulse border border-slate-100" />
                <div className="h-24 sm:h-28 rounded-2xl bg-white animate-pulse border border-slate-100" />
            </div>
        );
    }
    if (!profile) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24 text-center">
                <p className="text-sm sm:text-base font-bold text-slate-500">User tidak ditemukan</p>
            </div>
        );
    }

    const roles = profile.roles?.length ? profile.roles : [profile.role];
    const hasStatusBubble = Boolean(profile.song_title || profile.status_note);

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-0 py-6 sm:py-8 lg:py-10 space-y-4 sm:space-y-5 lg:space-y-6">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {showInfoPopup && (profile.song_title || profile.status_note) && (
                <div className="fixed inset-0 z-[9997] flex items-center justify-center p-4" onClick={handleClosePopup}>
                    <div className="absolute inset-0 bg-black/60" style={{ backdropFilter: "blur(8px)" }} />
                    <div className="relative w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden p-6 text-center"
                        style={{ background: "linear-gradient(160deg, #0f0c29, #1a1545)" }}
                        onClick={(e) => e.stopPropagation()}>
                        <button onClick={handleClosePopup}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
                            <X className="w-4 h-4 text-white" />
                        </button>

                        {profile.song_title && (
                            <>
                                <div className="w-36 h-36 mx-auto rounded-full overflow-hidden shadow-lg mb-5 ring-4 ring-white/10"
                                    style={{ animation: playingPreview ? "solitAvatarSpin 8s linear infinite" : "none" }}>
                                    {profile.song_artwork_url
                                        ? <img src={profile.song_artwork_url} alt={profile.song_title} className="w-full h-full object-cover" />
                                        : (
                                            <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1db954,#159c46)" }}>
                                                <Music className="w-10 h-10 text-white" />
                                            </div>
                                        )}
                                </div>

                                <p className="text-base font-bold text-white truncate">{profile.song_title}</p>
                                <p className="text-sm truncate mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>{profile.song_artist}</p>

                                {profile.song_preview_url ? (
                                    <button onClick={togglePreview}
                                        className="w-16 h-16 rounded-full mx-auto flex items-center justify-center shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                                        style={{ background: "rgba(255,255,255,0.14)" }}>
                                        {playingPreview ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-1" />}
                                    </button>
                                ) : (
                                    <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.4)" }}>Preview tidak tersedia untuk lagu ini</p>
                                )}

                                {(isSelf || isAdmin) && (
                                    <div className="flex items-center justify-center gap-4 mt-4">
                                        {isSelf && (
                                            <button onClick={() => { handleClosePopup(); songPicker.openSearch(); setShowSongPicker(true); }}
                                                className="text-xs font-semibold hover:text-white transition-colors"
                                                style={{ color: "rgba(255,255,255,0.5)" }}>
                                                Edit lagu
                                            </button>
                                        )}
                                        <button onClick={() => { handleRemoveSong(); handleClosePopup(); }} disabled={removingSong}
                                            className="text-xs font-semibold hover:text-red-400 disabled:opacity-50 transition-colors"
                                            style={{ color: "rgba(255,255,255,0.5)" }}>
                                            {removingSong ? "Menghapus..." : "Hapus lagu"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {(profile.status_note || isSelf) && (
                            <div className={profile.song_title ? "mt-6 pt-5 border-t border-white/10" : ""}>
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "rgba(139,92,246,0.15)" }}>
                                    <MessageCircle className="w-6 h-6" style={{ color: "#c4b5fd" }} />
                                </div>
                                {editingNote ? (
                                    <div className="flex flex-col gap-2 mb-3 px-4">
                                        <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value.slice(0, 60))}
                                            placeholder="Tulis catatan... (hilang 24 jam)" autoFocus
                                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(); if (e.key === "Escape") setEditingNote(false); }}
                                            className="w-full h-9 rounded-xl px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400"
                                            style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }} />
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-white/50">{noteDraft.length}/60</span>
                                            <div className="flex gap-3">
                                                <button onClick={() => setEditingNote(false)} className="text-xs font-medium text-white/70 hover:text-white">Batal</button>
                                                <button onClick={handleSaveNote} disabled={savingNote} className="text-xs font-bold text-violet-400 hover:text-violet-300 disabled:opacity-50">
                                                    {savingNote ? "Menyimpan..." : "Simpan"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : profile.status_note ? (
                                    <>
                                        <p className="text-sm font-semibold leading-relaxed text-white mb-1">{profile.status_note}</p>
                                        {profile.status_note_expires_at && (
                                            <p className="text-[10.5px] mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>{noteTimeLeft(profile.status_note_expires_at)}</p>
                                        )}
                                        {isSelf && (
                                            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
                                                <button onClick={() => { handleClosePopup(); setShowViewers(true); }} className="flex items-center gap-1 hover:text-white">
                                                    <Eye className="w-3.5 h-3.5" />
                                                    {viewers.length > 0 ? `Dilihat ${viewers.length} orang` : "Belum ada yang melihat"}
                                                </button>
                                                <button onClick={() => { setEditingNote(true); setNoteDraft(profile.status_note || ""); }} className="hover:text-violet-300 flex items-center gap-1">
                                                    <Pencil className="w-3.5 h-3.5" /> Edit catatan
                                                </button>
                                                <button onClick={() => { handleRemoveNote(); handleClosePopup(); }} className="hover:text-red-400">Hapus catatan</button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <button onClick={() => { setEditingNote(true); setNoteDraft(""); }} className="text-xs font-semibold hover:text-violet-300 mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>
                                        + Tambah catatan
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showPhotoModal && profile.profile_photo_url && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={() => setShowPhotoModal(false)}>
                    <div className="absolute inset-0 bg-black/80" style={{ backdropFilter: "blur(4px)" }} />
                    <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10 flex items-center gap-2">
                        {(isSelf || isAdmin) && (
                            <button onClick={(e) => { e.stopPropagation(); setShowPhotoModal(false); setConfirmDelete(true); }}
                                title="Hapus foto profil"
                                className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                                <Trash2 className="w-5 h-5 text-white" />
                            </button>
                        )}
                        <button onClick={() => setShowPhotoModal(false)}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                    <img src={profile.profile_photo_url} alt={profile.name} onClick={(e) => e.stopPropagation()}
                        className="relative max-w-full max-h-[85vh] rounded-2xl object-contain" />
                </div>
            )}

            {showPhotoActions && (
                <div className="fixed inset-0 z-[9996] flex items-end sm:items-center justify-center" onClick={() => setShowPhotoActions(false)}>
                    <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(4px)" }} />
                    <div className="relative w-full sm:w-80 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-2 pb-6 sm:pb-2"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto my-2" />
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 px-4 pt-1 pb-2">Foto Profil</p>

                        {profile.profile_photo_url && (
                            <button onClick={() => { setShowPhotoActions(false); setShowPhotoModal(true); }}
                                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200">
                                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,0.10)", color: "#6366f1" }}>
                                    <Eye className="w-4 h-4" />
                                </span>
                                <span className="text-sm font-semibold text-slate-700">Lihat Foto Profil</span>
                            </button>
                        )}

                        <button onClick={() => { setShowPhotoActions(false); fileInputRef.current?.click(); }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-slate-50 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200">
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,0.10)", color: "#6366f1" }}>
                                <Camera className="w-4 h-4" />
                            </span>
                            <span className="text-sm font-semibold text-slate-700">{profile.profile_photo_url ? "Ganti Foto" : "Tambah Foto"}</span>
                        </button>

                        {profile.profile_photo_url && (
                            <button onClick={() => { setShowPhotoActions(false); setConfirmDelete(true); }}
                                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-red-50 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200">
                                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fff1f2", color: "#dc2626" }}>
                                    <Trash2 className="w-4 h-4" />
                                </span>
                                <span className="text-sm font-semibold text-red-600">Hapus Foto</span>
                            </button>
                        )}

                        <button onClick={() => setShowPhotoActions(false)}
                            className="w-full mt-1 py-3 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200">
                            Batal
                        </button>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={() => setConfirmDelete(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 sm:p-7 lg:p-8">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "#fff1f2", border: "1px solid #fecaca" }}>
                            <Trash2 className="w-8 h-8" style={{ color: "#dc2626" }} />
                        </div>
                        <h3 className="font-black text-slate-800 text-center text-base mb-1">Hapus Foto {profile.name}?</h3>
                        <p className="text-sm text-slate-400 text-center mb-6">Foto profil akan dihapus permanen.</p>
                        <div className="flex gap-2.5">
                            <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                                className="flex-1 h-10 rounded-xl text-sm font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                style={{ background: "#f1f5f9", color: "#64748b" }}>
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

            {showViewers && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={() => setShowViewers(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5 sm:p-6 max-h-[70vh] flex flex-col">
                        <div className="flex items-center justify-between mb-3 flex-shrink-0">
                            <h3 className="font-black text-slate-800 text-sm">Dilihat oleh</h3>
                            <button onClick={() => setShowViewers(false)} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100">
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="overflow-y-auto space-y-1 flex-1">
                            {viewers.length === 0 ? (
                                <p className="text-xs text-slate-400 italic text-center py-6">Belum ada yang melihat catatan ini</p>
                            ) : (
                                viewers.map((v) => (
                                    <div key={v.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-slate-50">
                                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-xs font-black"
                                            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                                            {v.profile_photo_url
                                                ? <img src={v.profile_photo_url} alt={v.name} className="w-full h-full object-cover" />
                                                : getInitials(v.name)}
                                        </div>
                                        <p className="text-xs font-semibold text-slate-700 truncate flex-1">{v.name}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {cropTarget && (
                <ImageCropModal
                    src={cropTarget.src}
                    aspect={cropTarget.type === "avatar" ? 1 : 4}
                    shape={cropTarget.type === "avatar" ? "round" : "rect"}
                    title={cropTarget.type === "avatar" ? "Sesuaikan Foto Profil" : "Sesuaikan Banner"}
                    saving={cropTarget.type === "avatar" ? uploading : uploadingBanner}
                    onCancel={handleCropCancel}
                    onConfirm={handleCropConfirm}
                />
            )}

            {showContractModal && contractInfo && (
                <ContractInfoModal
                    contract={contractInfo}
                    userName={profile.name}
                    onClose={() => setShowContractModal(false)}
                />
            )}

            <div className="bg-white rounded-3xl overflow-hidden border border-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div className="relative h-32 sm:h-44 lg:h-56 overflow-hidden"
                    style={{
                        background: profile.banner_url
                            ? undefined
                            : "radial-gradient(140% 100% at 12% -20%, rgba(139,92,246,0.38), transparent 60%), radial-gradient(120% 100% at 100% 0%, rgba(29,185,84,0.20), transparent 55%), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0) 0 0/22px 22px, linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)",
                    }}>
                    {profile.banner_url && (
                        <img src={profile.banner_url} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/0 to-transparent pointer-events-none" />
                    {(isSelf || isAdmin) && (
                        <button onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} title="Ganti banner"
                            className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/30 hover:bg-black/45 backdrop-blur-sm flex items-center justify-center transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                            {uploadingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Camera className="w-3.5 h-3.5 text-white" />}
                        </button>
                    )}
                    <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleBannerFileSelected} />
                </div>

                <div className="px-5 sm:px-7 lg:px-8 pb-6 lg:pb-8">
                    <div className="flex items-end justify-between -mt-14 sm:-mt-16 lg:-mt-20">
                        <div className="relative">
                            {hasStatusBubble && (
                                <button onClick={() => setShowInfoPopup(true)}
                                    className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full w-max max-w-[180px] px-3 py-2 rounded-2xl shadow-lg text-center z-20 border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                                    style={{ background: "rgba(15,12,41,0.92)", backdropFilter: "blur(10px)" }}>
                                    {profile.song_title && (
                                        <div className="flex items-center justify-center gap-1">
                                            <Music className="w-3 h-3 flex-shrink-0" style={{ color: "#1db954" }} />
                                            <p className="text-[11px] font-bold text-white truncate max-w-[150px]">{profile.song_title}</p>
                                        </div>
                                    )}
                                    {profile.song_artist && <p className="text-[9.5px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{profile.song_artist}</p>}
                                    {profile.status_note && (
                                        <div className={`flex items-center justify-center gap-1 ${profile.song_title ? "mt-1.5 pt-1.5 border-t border-white/10" : ""}`}>
                                            <MessageCircle className="w-3 h-3 flex-shrink-0" style={{ color: "#c4b5fd" }} />
                                            <p className="text-[10.5px] font-semibold text-white truncate max-w-[150px]">{profile.status_note}</p>
                                        </div>
                                    )}
                                    <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b border-white/10" style={{ background: "rgba(15,12,41,0.92)" }} />
                                </button>
                            )}

                            <div className="rounded-full p-[3px]"
                                style={{
                                    background: hasStatusBubble ? "linear-gradient(135deg, #1db954, #6366f1, #8b5cf6)" : "transparent",
                                    boxShadow: hasStatusBubble ? "0 8px 22px -6px rgba(99,102,241,0.45)" : "0 4px 14px rgba(15,12,41,0.10)",
                                }}>
                                <div onClick={() => profile.profile_photo_url && setShowPhotoModal(true)}
                                    className={`relative w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32 rounded-full border-4 border-white overflow-hidden bg-slate-100 flex items-center justify-center text-white text-3xl lg:text-4xl font-black ${profile.profile_photo_url ? "cursor-pointer" : ""}`}
                                    style={{ background: profile.profile_photo_url ? undefined : "linear-gradient(135deg, #6366f1, #8b5cf6)", animation: playingPreview ? "solitAvatarSpin 6s linear infinite" : "none" }}>
                                    {profile.profile_photo_url
                                        ? <img src={profile.profile_photo_url} alt={profile.name} className="w-full h-full object-cover" />
                                        : getInitials(profile.name)}
                                </div>
                            </div>

                            {(isSelf || isAdmin) && (
                                <button onClick={() => setShowPhotoActions(true)} disabled={uploading} title="Opsi foto profil"
                                    className="absolute -bottom-1 -right-1 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:scale-110 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40">
                                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : <Camera className="w-3.5 h-3.5 text-slate-600" />}
                                </button>
                            )}
                            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelected} />
                            {profile.song_preview_url && (
                                <audio ref={audioRef} src={profile.song_preview_url} onEnded={() => setPlayingPreview(false)} onTimeUpdate={handleMainTimeUpdate} />
                            )}
                        </div>
                        {isAdmin && !isSelf && profile.profile_photo_url && (
                            <button onClick={() => setConfirmDelete(true)}
                                className="mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                                style={{ background: "#fff1f2", color: "#dc2626", border: "1px solid #fecdd3" }}>
                                <Trash2 className="w-3.5 h-3.5" /> Hapus Foto
                            </button>
                        )}
                    </div>

                    <style jsx>{`
                        @keyframes solitAvatarSpin {
                            from { transform: rotate(0deg); }
                            to   { transform: rotate(360deg); }
                        }
                        @keyframes solitShimmerSweep {
                            0%   { transform: translateX(-120%) skewX(-20deg); opacity: 0; }
                            15%  { opacity: 0.6; }
                            55%  { opacity: 0; }
                            100% { transform: translateX(220%) skewX(-20deg); opacity: 0; }
                        }
                        @media (prefers-reduced-motion: reduce) {
                            * { animation: none !important; }
                        }
                    `}</style>

                    <div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 sm:gap-3">
                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900">{profile.name}</h1>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1.5">
                                {roles.map((r) => (
                                    <span key={r} className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }} />
                                        {humanizeRoleKey(r)}
                                    </span>
                                ))}
                            </div>
                        </div>
                                            {achievements && <AchievementTitles achievements={achievements} qualityRank={qualityRank} kerjaRank={kerjaRank} deliveryBadge={deliveryBadge} providerBadge={providerBadge} salesBadge={salesBadge} />}
                    </div>

                    <div className="mt-3">
                        {editingNote ? (
                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value.slice(0, 60))}
                                    placeholder="Tulis catatan singkat... (hilang dalam 24 jam)"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(); if (e.key === "Escape") setEditingNote(false); }}
                                    className="flex-1 min-w-[140px] h-9 rounded-full px-3.5 text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#334155" }} />
                                <span className="text-[9px] text-slate-300 flex-shrink-0">{noteDraft.length}/60</span>
                                <button onClick={handleSaveNote} disabled={savingNote}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                                    style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setEditingNote(false)}
                                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                    style={{ background: "#f1f5f9", color: "#64748b" }}>
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : isSelf && !profile.status_note ? (
                            <button onClick={() => { setEditingNote(true); setNoteDraft(""); }}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                                style={{ background: "#f8fafc", color: "#94a3b8", border: "1px dashed #cbd5e1" }}>
                                <MessageCircle className="w-3.5 h-3.5" /> Tulis catatan
                            </button>
                        ) : null}
                    </div>

                    {/* ── Lagu Favorit — hanya tampil kalau BELUM ada lagu; kalau sudah ada, tampil sebagai bubble di atas card ─────── */}
                    {!profile.song_title && (
                        <div className="mt-4 rounded-3xl overflow-hidden border border-slate-100">
                            <div className="h-1" style={{ background: "linear-gradient(90deg, #1db954, #6366f1, #8b5cf6)" }} />
                            <div className="p-3.5 sm:p-4" style={{ background: "#f8fafc" }}>
                                <div className="flex items-center gap-1.5 mb-3">
                                    <Music className="w-4 h-4" style={{ color: "#1db954" }} />
                                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
                                        {isSelf ? "Lagu Favorit" : `Lagu Favorit ${profile.name.split(" ")[0]}`}
                                    </p>
                                </div>

                                {isSelf ? (
                                    <SongPickerPanel picker={songPicker} />
                                ) : (
                                    <p className="text-xs italic" style={{ color: "#cbd5e1" }}>Belum ada lagu favorit</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mt-4">
                        {editingBio ? (
                            <div className="space-y-2">
                                <textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value.slice(0, 280))} rows={3}
                                    placeholder="Tulis bio singkat tentang dirimu..."
                                    className="w-full rounded-xl px-3.5 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#334155" }} />
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[10px] text-slate-400">{bioDraft.length}/280</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditingBio(false); setBioDraft(profile.bio ?? ""); }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" style={{ background: "#f1f5f9", color: "#64748b" }}>
                                            <X className="w-3 h-3 inline mr-1" /> Batal
                                        </button>
                                        <button onClick={handleSaveBio} disabled={savingBio}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                                            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                                            {savingBio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Simpan
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="pt-3 border-t border-slate-50">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">Tentang</p>
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm text-slate-500 leading-relaxed line-clamp-4 break-words" title={profile.bio || undefined}>
                                        {profile.bio || <span className="italic text-slate-300">Belum ada bio</span>}
                                    </p>
                                    {isSelf && (
                                        <button onClick={() => setEditingBio(true)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200">
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

                    {contractInfo && (isSelf ? contractInfo.status !== "NONE" : true) && (
                        <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                                    {isSelf ? "Status Kontrak Kerja" : "Masa Aktif Kontrak"}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <ContractBadge status={contractInfo.status} validUntil={contractInfo.valid_until} />
                                    {contractInfo.status === "APPROVED" && contractInfo.valid_until && (
                                        <span className="text-xs text-slate-400">
                                            s/d {contractInfo.valid_until}
                                            {daysUntilDate(contractInfo.valid_until) >= 0 && ` · ${daysUntilDate(contractInfo.valid_until)} hari lagi`}
                                        </span>
                                    )}
                                    {contractInfo.status === "APPROVED" && contractInfo.career_level && (
                                        <CareerLevelBadge level={contractInfo.career_level} />
                                    )}
                                </div>
                            </div>
                            {contractInfo.id && (
                                <button
                                    onClick={() => setShowContractModal(true)}
                                    className="text-xs font-semibold text-violet-500 hover:text-violet-600"
                                >
                                    Lihat Detail
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {achievements && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
                    <div>
                        <AchievementCard
                            icon={<CalendarCheck className="w-5 h-5" />} title="Kehadiran Bulan Ini" monthLabel={monthLabel(achievements.month)}
                            value={`${achievements.attendance.daysThisMonth} hari`} sub={`${achievements.attendance.onTimeThisMonth} kali tepat waktu`}
                            rank={achievements.attendance.rankThisMonth} totalRanked={achievements.attendance.totalRanked}
                            isRecord={achievements.attendance.isCompanyRecordHolder}
                            personalBest={achievements.attendance.personalBest ? `Rekor pribadi: ${achievements.attendance.personalBest.days} hari (${monthLabel(achievements.attendance.personalBest.month)})` : null}
                            accentSolid="#059669" accentSoft="rgba(5,150,105,0.12)" accentBar="linear-gradient(90deg, #34d399, #059669)"
                        />
                    </div>
                    <div>
                        <AchievementCard
                            icon={<Clock className="w-5 h-5" />} title="Lembur Bulan Ini" monthLabel={monthLabel(achievements.month)}
                            value={`${achievements.overtime.hoursThisMonth} jam`} sub={`${achievements.overtime.sessionsThisMonth} sesi lembur`}
                            rank={achievements.overtime.rankThisMonth} totalRanked={achievements.overtime.totalRanked}
                            isRecord={achievements.overtime.isCompanyRecordHolder}
                            personalBest={achievements.overtime.personalBest ? `Rekor pribadi: ${achievements.overtime.personalBest.hours} jam (${monthLabel(achievements.overtime.personalBest.month)})` : null}
                            accentSolid="#d97706" accentSoft="rgba(217,119,6,0.12)" accentBar="linear-gradient(90deg, #fbbf24, #d97706)"
                        />
                    </div>
                </div>
            )}


            {showSongPicker && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70" style={{ backdropFilter: "blur(6px)" }} onClick={() => { setShowSongPicker(false); songPicker.closeSearch(); songPicker.handleCancelCrop(); }} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                            <div className="flex items-center gap-2 min-w-0">
                                <Music className="w-4 h-4 text-white flex-shrink-0" />
                                <p className="text-sm font-bold text-white truncate">Ganti Lagu</p>
                            </div>
                            <button onClick={() => { setShowSongPicker(false); songPicker.closeSearch(); songPicker.handleCancelCrop(); }} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: "rgba(255,255,255,0.1)" }}>
                                <X className="w-4 h-4 text-white" />
                            </button>
                        </div>
                        <div className="p-5">
                            <SongPickerPanel picker={songPicker} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function AchievementCard({
    icon, title, monthLabel, value, sub, rank, totalRanked, isRecord, personalBest, accentSolid, accentSoft, accentBar,
}: {
    icon: React.ReactNode; title: string; monthLabel: string; value: string; sub: string;
    rank: number | null; totalRanked: number; isRecord: boolean;
    personalBest: string | null; accentSolid: string; accentSoft: string; accentBar: string;
}) {
    const hasAchievement = rank !== null && rank <= 5;

    return (
        <div className="group rounded-2xl p-4 sm:p-5 lg:p-6 relative overflow-hidden border border-slate-100 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl h-full"
            style={{ background: `linear-gradient(160deg, ${accentSoft} 0%, #ffffff 45%)`, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: accentBar }} />
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none opacity-[0.14] transition-transform duration-500 group-hover:scale-110" style={{ background: accentSolid }} />
            <div className="relative">
                <div className="flex items-start justify-between mb-4">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white transition-transform duration-300 group-hover:scale-110"
                        style={{ background: `linear-gradient(135deg, ${accentSolid}, ${accentSolid}cc)`, boxShadow: `0 6px 16px -4px ${accentSoft}` }}>
                        {icon}
                    </div>
                    {hasAchievement && <RankBadge rank={rank as number} />}
                </div>
                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>{title} · {monthLabel}</p>
                <p className="text-3xl sm:text-4xl font-black mt-1 tabular-nums" style={{ color: "#0f172a" }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>{sub}</p>
                {rank && (
                    <p className="inline-block mt-2.5 text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: accentSoft, color: accentSolid }}>
                        Peringkat #{rank} dari {totalRanked} orang
                    </p>
                )}
                {personalBest && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-1.5" style={{ borderColor: "rgba(15,23,42,0.05)" }}>
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
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)",
        silver: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)",
        bronze: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)",
    };
    const glow: Record<typeof tier, string> = {
        gold: "rgba(245,158,11,0.35)",
        silver: "rgba(148,163,184,0.35)",
        bronze: "rgba(194,65,12,0.35)",
    };

    return (
        <div className="relative w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-full flex items-center justify-center ring-2 ring-white"
            style={{ background: gradients[tier], boxShadow: `0 4px 12px -2px ${glow[tier]}` }}
            title={`Peringkat #${rank} bulan ini`}>
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.5), transparent 55%)" }} />
            <span className="relative text-xs sm:text-sm font-black text-white">#{rank}</span>
        </div>
    );
}

function AchievementTitles({ achievements, qualityRank, kerjaRank, deliveryBadge, providerBadge, salesBadge }: {
    achievements: AchievementsData;
    qualityRank?: { level: number; isPermanent: boolean; isTemporary: boolean; streakMonths: number; isOngoingMonth: boolean } | null;
    kerjaRank?: { level: number; isPermanent: boolean; isTemporary: boolean; streakMonths: number; isOngoingMonth: boolean } | null;
    deliveryBadge?: { total: number; rank: number; totalRanked: number; milestone: number; hasBadge: boolean } | null;
    providerBadge?: { total: number; rank: number; totalRanked: number; milestone: number; hasBadge: boolean } | null;
    salesBadge?: { total: number; rank: number; totalRanked: number; milestone: number; hasBadge: boolean } | null;
}) {
    const titles: { rank: number; label: string }[] = [];
    if (achievements.attendance.rankThisMonth !== null && achievements.attendance.rankThisMonth <= 10) {
        titles.push({ rank: achievements.attendance.rankThisMonth, label: "Kehadiran" });
    }
    if (achievements.overtime.rankThisMonth !== null && achievements.overtime.rankThisMonth <= 10) {
        titles.push({ rank: achievements.overtime.rankThisMonth, label: "Lembur" });
    }
    // ✅ NEW — Kualitas Absensi sekarang berbasis LEVEL berjenjang (lihat
    // /dashboard/lencana), bukan cuma rank bulan ini — jadi ditampilkan
    // terpisah dari 2 kategori TOP di atas.
    const hasQualityBadge = !!(qualityRank && qualityRank.level > 0);
    // ✅ NEW — Lencana Kualitas Pekerjaan (tab "Pekerjaan" di /dashboard/lencana),
    // polanya sama dengan Kualitas Absensi, cuma sumbernya leaderboard-kerja.
    const hasKerjaBadge = !!(kerjaRank && kerjaRank.level > 0);
    // ✅ NEW — Lencana Pengantaran (tab "Pengantaran" di /dashboard/lencana):
    // BUKAN level bulanan, tapi milestone total pengantaran (50/100/.../1000),
    // dan cuma tampil kalau server sudah menandai hasBadge (artinya Top 3).
    const hasDeliveryBadge = !!(deliveryBadge && deliveryBadge.hasBadge);
    // ✅ NEW — Lencana Penyedia Barang (tab "Penyedia Barang" di /dashboard/lencana):
    // MILESTONE kumulatif total unit laptop yang berhasil disiapkan
    // (100/300/.../3000), bersifat all-time & tidak dibatasi Top 3 — tampil
    // untuk siapa pun yang sudah meraih milestone-nya.
    const hasProviderBadge = !!(providerBadge && providerBadge.hasBadge);
    // ✅ NEW — Lencana Sales (tab "Sales" di /dashboard/lencana): MILESTONE
    // kumulatif total transaksi Lunas (1000/2000/.../20000), bersifat
    // all-time & tidak dibatasi Top 3 — sama polanya dengan Penyedia Barang.
    const hasSalesBadge = !!(salesBadge && salesBadge.hasBadge);
    if (titles.length === 0 && !hasQualityBadge && !hasKerjaBadge && !hasDeliveryBadge && !hasProviderBadge && !hasSalesBadge) return null;
    titles.sort((a, b) => a.rank - b.rank);

    return (
        <div className="flex flex-row sm:flex-col flex-wrap justify-end sm:justify-start items-end gap-2 flex-shrink-0">
            {hasQualityBadge && (
                <LevelBadgeDisplay level={qualityRank!.level} isPermanent={qualityRank!.isPermanent} isOngoingMonth={qualityRank!.isOngoingMonth} />
            )}
            {hasKerjaBadge && (
                <LevelBadgeDisplay level={kerjaRank!.level} isPermanent={kerjaRank!.isPermanent} isOngoingMonth={kerjaRank!.isOngoingMonth} label="Kualitas Pekerjaan" colorScheme="indigo" />
            )}
            {hasDeliveryBadge && (
                <DeliveryMilestoneBadge rank={deliveryBadge!.rank} milestone={deliveryBadge!.milestone} />
            )}
            {hasProviderBadge && (
                <ProviderMilestoneBadge rank={providerBadge!.rank} milestone={providerBadge!.milestone} />
            )}
            {hasSalesBadge && (
                <SalesMilestoneBadge rank={salesBadge!.rank} milestone={salesBadge!.milestone} />
            )}
            {titles.map((t) => (
                <AchievementTitleBadge key={t.label} rank={t.rank} label={t.label} />
            ))}
        </div>
    );
}


// ✅ NEW — badge lencana Pengantaran: TIDAK berbasis level/streak seperti
// LevelBadgeDisplay, melainkan MILESTONE total pengantaran (50/100/.../1000)
// dan rank Top 1-3 di periode yang sedang dipakai (default rolling 1 bulan).
function DeliveryMilestoneBadge({ rank, milestone }: { rank: number; milestone: number }) {
    const tier: "gold" | "silver" | "bronze" = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #fb923c, #ea580c, #9a3412)",
        silver: "linear-gradient(135deg, #fdba74, #f97316, #c2410c)",
        bronze: "linear-gradient(135deg, #fed7aa, #fb923c, #ea580c)",
    };
    const glow: Record<typeof tier, string> = {
        gold: "rgba(234,88,12,0.35)",
        silver: "rgba(249,115,22,0.35)",
        bronze: "rgba(251,146,60,0.35)",
    };

    return (
        <div
            className="relative flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-3 sm:pr-3.5 py-1.5 rounded-full overflow-hidden"
            style={{ background: gradients[tier], boxShadow: `0 4px 14px ${glow[tier]}` }}
            title={`Top ${rank} Pengantaran · ${milestone}+ pengantaran`}
        >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 55%)" }} />
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="relative leading-tight">
                <p className="text-[11px] sm:text-xs font-black text-white tracking-wide">TOP {rank}</p>
                <p className="text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Pengantaran · {milestone}+
                </p>
            </div>
        </div>
    );
}

// ✅ NEW — badge lencana Penyedia Barang: TIDAK berbasis level/streak seperti
// LevelBadgeDisplay, dan BEDA dari DeliveryMilestoneBadge — ini MILESTONE
// kumulatif total unit laptop yang berhasil disiapkan (100/300/.../3000)
// sepanjang waktu, bersifat permanen begitu tercapai & TIDAK dibatasi Top 3
// (tier warna ditentukan besar milestone-nya, bukan rank).
function ProviderMilestoneBadge({ rank, milestone }: { rank: number; milestone: number }) {
    const tier: "gold" | "silver" | "bronze" = milestone >= 2000 ? "gold" : milestone >= 700 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #2dd4bf, #0d9488, #115e59)",
        silver: "linear-gradient(135deg, #5eead4, #14b8a6, #0f766e)",
        bronze: "linear-gradient(135deg, #99f6e4, #2dd4bf, #14b8a6)",
    };
    const glow: Record<typeof tier, string> = {
        gold: "rgba(13,148,136,0.35)",
        silver: "rgba(20,184,166,0.35)",
        bronze: "rgba(45,212,191,0.35)",
    };

    return (
        <div
            className="relative flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-3 sm:pr-3.5 py-1.5 rounded-full overflow-hidden"
            style={{ background: gradients[tier], boxShadow: `0 4px 14px ${glow[tier]}` }}
            title={`Peringkat #${rank} · ${milestone}+ unit disiapkan`}
        >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 55%)" }} />
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="relative leading-tight">
                <p className="text-[11px] sm:text-xs font-black text-white tracking-wide">{milestone}+ UNIT</p>
                <p className="text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Penyedia Barang
                </p>
            </div>
        </div>
    );
}

// ✅ NEW — badge lencana Sales: pola sama persis dengan ProviderMilestoneBadge
// (MILESTONE kumulatif all-time, TIDAK dibatasi Top 3) tapi satuannya total
// TRANSAKSI Lunas (1000/2000/.../20000), bukan unit laptop disiapkan.
function SalesMilestoneBadge({ rank, milestone }: { rank: number; milestone: number }) {
    const tier: "gold" | "silver" | "bronze" = milestone >= 10000 ? "gold" : milestone >= 4000 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #fb7185, #e11d48, #9f1239)",
        silver: "linear-gradient(135deg, #fda4af, #f43f5e, #be123c)",
        bronze: "linear-gradient(135deg, #fecdd3, #fb7185, #f43f5e)",
    };
    const glow: Record<typeof tier, string> = {
        gold: "rgba(225,29,72,0.35)",
        silver: "rgba(244,63,94,0.35)",
        bronze: "rgba(251,113,133,0.35)",
    };

    return (
        <div
            className="relative flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-3 sm:pr-3.5 py-1.5 rounded-full overflow-hidden"
            style={{ background: gradients[tier], boxShadow: `0 4px 14px ${glow[tier]}` }}
            title={`Peringkat #${rank} · ${milestone}+ transaksi`}
        >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 55%)" }} />
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="relative leading-tight">
                <p className="text-[11px] sm:text-xs font-black text-white tracking-wide">{milestone}+ TRX</p>
                <p className="text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Sales
                </p>
            </div>
        </div>
    );
}

// ✅ NEW — badge lencana berjenjang (Level 1-10) untuk Kualitas Absensi di
// halaman profil. Beda dari AchievementTitleBadge (yang berbasis rank bulan
// ini): ini berbasis level konsistensi, dan tetap tampil "Permanen" walau
// bulan ini performanya turun (kalau sudah pernah tembus Level 3).
function LevelBadgeDisplay({
    level, isPermanent, isOngoingMonth, label = "Kualitas Absensi", colorScheme = "emerald",
}: {
    level: number; isPermanent: boolean; isOngoingMonth: boolean;
    label?: string; colorScheme?: "emerald" | "indigo";
}) {
    const tier: "gold" | "silver" | "bronze" = isPermanent ? "gold" : level >= 2 ? "silver" : "bronze";
    const gradientsByScheme: Record<"emerald" | "indigo", Record<typeof tier, string>> = {
        emerald: {
            gold: "linear-gradient(135deg, #34d399, #059669, #047857)",
            silver: "linear-gradient(135deg, #fde68a, #f59e0b, #b45309)",
            bronze: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)",
        },
        indigo: {
            gold: "linear-gradient(135deg, #818cf8, #4f46e5, #3730a3)",
            silver: "linear-gradient(135deg, #93c5fd, #2563eb, #1e3a8a)",
            bronze: "linear-gradient(135deg, #a5b4fc, #6366f1, #4338ca)",
        },
    };
    const glowByScheme: Record<"emerald" | "indigo", Record<typeof tier, string>> = {
        emerald: {
            gold: "rgba(5,150,105,0.35)",
            silver: "rgba(245,158,11,0.35)",
            bronze: "rgba(194,65,12,0.35)",
        },
        indigo: {
            gold: "rgba(79,70,229,0.35)",
            silver: "rgba(37,99,235,0.35)",
            bronze: "rgba(99,102,241,0.35)",
        },
    };
    const gradients = gradientsByScheme[colorScheme];
    const glow = glowByScheme[colorScheme];

    const showProvisional = !isPermanent && isOngoingMonth;

    return (
        <div
            className="relative flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-3 sm:pr-3.5 py-1.5 rounded-full overflow-hidden"
            style={{ background: gradients[tier], boxShadow: `0 4px 14px ${glow[tier]}` }}
            title={isPermanent ? `Level ${level} · Lencana Permanen` : showProvisional ? `Level ${level} · Sementara, bulan berjalan belum final` : `Level ${level}`}
        >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 55%)" }} />
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="relative leading-tight">
                <p className="text-[11px] sm:text-xs font-black text-white tracking-wide">LEVEL {level}</p>
                <p className="text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {label}{isPermanent ? " · Permanen" : showProvisional ? " · Sementara" : ""}
                </p>
                {showProvisional && (
                    <p className="text-[7px] sm:text-[7.5px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>Bulan berjalan, belum final</p>
                )}
            </div>
        </div>
    );
}

function AchievementTitleBadge({ rank, label }: { rank: number; label: string }) {
    const tier: "gold" | "silver" | "bronze" = rank === 1 ? "gold" : rank <= 3 ? "silver" : "bronze";
    const gradients: Record<typeof tier, string> = {
        gold: "linear-gradient(135deg, #fde047, #f59e0b, #b45309)",
        silver: "linear-gradient(135deg, #f8fafc, #94a3b8, #475569)",
        bronze: "linear-gradient(135deg, #fdba74, #c2410c, #7c2d12)",
    };
    const glow: Record<typeof tier, string> = {
        gold: "rgba(245,158,11,0.35)",
        silver: "rgba(148,163,184,0.35)",
        bronze: "rgba(194,65,12,0.35)",
    };

    return (
        <div
            className="relative flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-3 sm:pr-3.5 py-1.5 rounded-full overflow-hidden"
            style={{ background: gradients[tier], boxShadow: `0 4px 14px ${glow[tier]}` }}
            title={`Top ${rank} ${label} bulan ini`}
        >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.35), transparent 55%)" }} />
            <div className="absolute inset-y-0 w-8 pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)", animation: "solitShimmerSweep 2.2s ease-out 0.4s 1 both" }} />
            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="relative leading-tight">
                <p className="text-[11px] sm:text-xs font-black text-white tracking-wide">TOP {rank}</p>
                <p className="text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>{label}</p>
            </div>
        </div>
    );
}