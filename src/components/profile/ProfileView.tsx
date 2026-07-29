"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import imageCompression from "browser-image-compression";
import { humanizeRoleKey } from "@/lib/permissions";
import {
    Camera, Trash2, Trophy, Flame, Clock, CalendarCheck,
    Loader2, Pencil, Check, X, Music, Search, Play, Pause,
    MessageCircle,
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
}

interface SongResult {
    trackId: number;
    trackName: string;
    artistName: string;
    artworkUrl: string | null;
    previewUrl: string | null;
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
const CLIP_LENGTH = 10;

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

function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className={`fixed top-4 right-4 left-4 sm:left-auto sm:top-5 sm:right-5 sm:max-w-sm z-[9999] px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold ${type === "ok" ? "bg-white text-slate-700 border border-slate-100" : "bg-white text-red-600 border border-red-100"}`}>
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
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const [showPhotoModal, setShowPhotoModal] = useState(false);

    const [editingNote, setEditingNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");
    const [savingNote, setSavingNote] = useState(false);

    const [showSongSearch, setShowSongSearch] = useState(false);
    const [songQuery, setSongQuery] = useState("");
    const [songResults, setSongResults] = useState<SongResult[]>([]);
    const [searchingSong, setSearchingSong] = useState(false);
    const [savingSong, setSavingSong] = useState(false);
    const [removingSong, setRemovingSong] = useState(false);
    const [playingPreview, setPlayingPreview] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const [pendingSong, setPendingSong] = useState<SongResult | null>(null);
    const [clipStart, setClipStart] = useState(0);
    const [clipDuration, setClipDuration] = useState(30);
    const [cropPlaying, setCropPlaying] = useState(false);
    const cropAudioRef = useRef<HTMLAudioElement>(null);

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

    useEffect(() => {
        if (!showSongSearch || songQuery.trim().length < 2) { setSongResults([]); return; }
        const t = setTimeout(async () => {
            setSearchingSong(true);
            try {
                const res = await fetch(`/api/profile/song?q=${encodeURIComponent(songQuery.trim())}`);
                const data = await res.json();
                if (data.success) setSongResults(data.data);
            } catch {
                // diam-diam gagal, biarkan hasil pencarian sebelumnya
            } finally {
                setSearchingSong(false);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [songQuery, showSongSearch]);

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

    const handlePickSearchResult = (song: SongResult) => {
        setPendingSong(song);
        setClipStart(0);
        setClipDuration(30);
        setCropPlaying(false);
    };

    const handleCancelCrop = () => {
        cropAudioRef.current?.pause();
        setCropPlaying(false);
        setPendingSong(null);
    };

    const toggleCropPlay = () => {
        const audio = cropAudioRef.current;
        if (!audio) return;
        if (cropPlaying) {
            audio.pause();
            setCropPlaying(false);
        } else {
            audio.currentTime = clipStart;
            audio.play().catch(() => { });
            setCropPlaying(true);
        }
    };

    // Otomatis stop tepat CLIP_LENGTH detik setelah titik awal yang dipilih
    const handleCropTimeUpdate = () => {
        const audio = cropAudioRef.current;
        if (!audio) return;
        if (audio.currentTime >= clipStart + CLIP_LENGTH) {
            audio.pause();
            setCropPlaying(false);
        }
    };

    const handleCropSliderChange = (value: number) => {
        setClipStart(value);
        if (cropAudioRef.current) {
            cropAudioRef.current.currentTime = value;
        }
    };

    const handleConfirmSong = async () => {
        if (!pendingSong) return;
        setSavingSong(true);
        try {
            const res = await fetch("/api/profile/song", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: pendingSong.trackName,
                    artist: pendingSong.artistName,
                    artwork_url: pendingSong.artworkUrl,
                    preview_url: pendingSong.previewUrl,
                    clip_start: clipStart,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? {
                    ...p,
                    song_title: pendingSong.trackName,
                    song_artist: pendingSong.artistName,
                    song_artwork_url: pendingSong.artworkUrl,
                    song_preview_url: pendingSong.previewUrl,
                    song_clip_start: clipStart,
                } : p));
                cropAudioRef.current?.pause();
                setPendingSong(null);
                setShowSongSearch(false);
                setSongQuery("");
                setSongResults([]);
                setPlayingPreview(false);
                showToast("Lagu berhasil ditambahkan", "ok");
            } else {
                showToast(data.message ?? "Gagal menyimpan lagu", "err");
            }
        } catch {
            showToast("Terjadi kesalahan", "err");
        } finally {
            setSavingSong(false);
        }
    };

    const handleRemoveSong = async () => {
        setRemovingSong(true);
        try {
            const res = await fetch("/api/profile/song", { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setProfile((p) => (p ? { ...p, song_title: null, song_artist: null, song_artwork_url: null, song_preview_url: null, song_clip_start: 0 } : p));
                setPlayingPreview(false);
                showToast("Lagu dihapus", "ok");
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
            audio.currentTime = profile.song_clip_start ?? 0;
            audio.play().catch(() => { });
            setPlayingPreview(true);
        }
    };

    const handleMainTimeUpdate = () => {
        const audio = audioRef.current;
        if (!audio || !profile) return;
        const start = profile.song_clip_start ?? 0;
        if (audio.currentTime >= start + CLIP_LENGTH) {
            audio.pause();
            setPlayingPreview(false);
        }
    };

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

    const handleBannerFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setUploadingBanner(true);
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
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

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-0 py-6 sm:py-8 lg:py-10 space-y-4 sm:space-y-5 lg:space-y-6">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {showPhotoModal && profile.profile_photo_url && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={() => setShowPhotoModal(false)}>
                    <div className="absolute inset-0 bg-black/80" style={{ backdropFilter: "blur(4px)" }} />
                    <button onClick={() => setShowPhotoModal(false)}
                        className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                        <X className="w-5 h-5 text-white" />
                    </button>
                    <img src={profile.profile_photo_url} alt={profile.name} onClick={(e) => e.stopPropagation()}
                        className="relative max-w-full max-h-[85vh] rounded-2xl object-contain" />
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
                                className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                                style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)" }}>
                                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Ya, Hapus</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-3xl overflow-hidden border border-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div className="relative h-24 sm:h-32 lg:h-40 overflow-hidden" style={{ background: profile.banner_url ? undefined : "linear-gradient(135deg, #0f0c29 0%, #1a1545 100%)" }}>
                    {profile.banner_url && (
                        <img src={profile.banner_url} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {(isSelf || isAdmin) && (
                        <button onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} title="Ganti banner"
                            className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/30 hover:bg-black/45 backdrop-blur-sm flex items-center justify-center transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
                            {uploadingBanner ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Camera className="w-3.5 h-3.5 text-white" />}
                        </button>
                    )}
                    <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleBannerFileSelected} />
                </div>

                <div className="px-5 sm:px-7 lg:px-8 pb-6 lg:pb-8">
                    <div className="flex items-end justify-between -mt-10 sm:-mt-12 lg:-mt-14">
                        <div className="relative">
                            <div onClick={() => profile.profile_photo_url && setShowPhotoModal(true)}
                                className={`w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-full border-4 border-white overflow-hidden bg-slate-100 flex items-center justify-center text-white text-2xl lg:text-3xl font-black ${profile.profile_photo_url ? "cursor-pointer" : ""}`}
                                style={{ background: profile.profile_photo_url ? undefined : "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                                {profile.profile_photo_url
                                    ? <img src={profile.profile_photo_url} alt={profile.name} className="w-full h-full object-cover" />
                                    : getInitials(profile.name)}
                            </div>
                            {(isSelf || isAdmin) && (
                                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Ganti foto profil"
                                    className="absolute -bottom-1 -right-1 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:scale-110 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40">
                                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : <Camera className="w-3.5 h-3.5 text-slate-600" />}
                                </button>
                            )}
                            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileSelected} />
                        </div>
                        {isAdmin && !isSelf && profile.profile_photo_url && (
                            <button onClick={() => setConfirmDelete(true)}
                                className="mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                                style={{ background: "#fff1f2", color: "#dc2626", border: "1px solid #fecdd3" }}>
                                <Trash2 className="w-3.5 h-3.5" /> Hapus Foto
                            </button>
                        )}
                    </div>

                    <div className="mt-3">
                        <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-900">{profile.name}</h1>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1.5">
                            {roles.map((r) => (
                                <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                                    {humanizeRoleKey(r)}
                                </span>
                            ))}
                        </div>
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
                        ) : profile.status_note ? (
                            <div className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full max-w-full"
                                style={{ background: "#f5f3ff", border: "1px solid #ddd6fe" }}>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#ede9fe" }}>
                                    <MessageCircle className="w-3 h-3" style={{ color: "#7c3aed" }} />
                                </div>
                                <p className="text-xs font-semibold truncate" style={{ color: "#5b21b6" }}>{profile.status_note}</p>
                                {isSelf && (
                                    <>
                                        <span className="text-[9px] flex-shrink-0" style={{ color: "#a78bfa" }}>
                                            · {profile.status_note_expires_at ? noteTimeLeft(profile.status_note_expires_at) : ""}
                                        </span>
                                        <button onClick={handleRemoveNote} className="flex-shrink-0 opacity-50 hover:opacity-100">
                                            <X className="w-3 h-3" style={{ color: "#7c3aed" }} />
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : isSelf ? (
                            <button onClick={() => { setEditingNote(true); setNoteDraft(""); }}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                                style={{ background: "#f8fafc", color: "#94a3b8", border: "1px dashed #cbd5e1" }}>
                                <MessageCircle className="w-3.5 h-3.5" /> Tulis catatan
                            </button>
                        ) : null}
                    </div>

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
                            <div>
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm text-slate-500 leading-relaxed">
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
                </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 lg:p-6 border border-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div className="flex items-center gap-1.5 mb-3">
                    <Music className="w-4 h-4" style={{ color: "#1db954" }} />
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
                        {isSelf ? "Lagu Favorit" : `Lagu Favorit ${profile.name.split(" ")[0]}`}
                    </p>
                </div>

                {profile.song_title ? (
                    <div className="flex items-center gap-3">
                        <button onClick={togglePreview} disabled={!profile.song_preview_url}
                            className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden flex-shrink-0 shadow-md disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                            style={{ animation: playingPreview ? "solitSongSpin 3s linear infinite" : "none" }}>
                            {profile.song_artwork_url
                                ? <img src={profile.song_artwork_url} alt={profile.song_title} className="w-full h-full object-cover" />
                                : (
                                    <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1db954,#159c46)" }}>
                                        <Music className="w-5 h-5 text-white" />
                                    </div>
                                )}
                            <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.85)" }} />
                            <div className="absolute rounded-full bg-white" style={{ inset: "38%" }} />
                        </button>

                        <div className="flex-1 min-w-0 rounded-full pl-4 pr-1.5 py-1.5 flex items-center justify-between gap-2"
                            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                            <div className="min-w-0 overflow-hidden">
                                <p className="text-xs font-bold text-white truncate">{profile.song_title}</p>
                                <p className="text-[10.5px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{profile.song_artist}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                {profile.song_preview_url && (
                                    <button onClick={togglePreview}
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        style={{ background: "rgba(255,255,255,0.15)" }}>
                                        {playingPreview ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white ml-0.5" />}
                                    </button>
                                )}
                                {isSelf && (
                                    <button onClick={handleRemoveSong} disabled={removingSong}
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        style={{ background: "rgba(255,255,255,0.15)" }}>
                                        {removingSong ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <X className="w-3.5 h-3.5 text-white" />}
                                    </button>
                                )}
                            </div>
                        </div>

                        {profile.song_preview_url && (
                            <audio ref={audioRef} src={profile.song_preview_url} onEnded={() => setPlayingPreview(false)} onTimeUpdate={handleMainTimeUpdate} />
                        )}
                    </div>
                ) : isSelf ? (
                    !showSongSearch ? (
                        <button onClick={() => setShowSongSearch(true)}
                            className="w-full h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                            style={{ background: "#f8fafc", color: "#64748b", border: "1px dashed #cbd5e1" }}>
                            <Music className="w-4 h-4" /> Tambahkan lagu
                        </button>
                    ) : pendingSong ? (
                        <div className="space-y-3 p-3 rounded-2xl border border-slate-100" style={{ background: "#fafafa" }}>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                                    {pendingSong.artworkUrl && <img src={pendingSong.artworkUrl} alt={pendingSong.trackName} className="w-full h-full object-cover" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold truncate" style={{ color: "#0f172a" }}>{pendingSong.trackName}</p>
                                    <p className="text-xs truncate" style={{ color: "#94a3b8" }}>{pendingSong.artistName}</p>
                                </div>
                                {pendingSong.previewUrl && (
                                    <button onClick={toggleCropPlay}
                                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                                        style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                                        {cropPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                                    </button>
                                )}
                            </div>

                            {pendingSong.previewUrl ? (
                                <div>
                                    <p className="text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#94a3b8" }}>
                                        Pilih potongan {CLIP_LENGTH} detik yang ditampilkan
                                    </p>
                                    <input
                                        type="range"
                                        min={0}
                                        max={Math.max(0, Math.floor(clipDuration - CLIP_LENGTH))}
                                        value={clipStart}
                                        onChange={(e) => handleCropSliderChange(Number(e.target.value))}
                                        className="w-full accent-violet-600"
                                    />
                                    <div className="flex justify-between text-[9px] mt-1" style={{ color: "#cbd5e1" }}>
                                        <span>0:{String(Math.floor(clipStart)).padStart(2, "0")}</span>
                                        <span>0:{String(Math.min(Math.floor(clipDuration), Math.floor(clipStart + CLIP_LENGTH))).padStart(2, "0")}</span>
                                    </div>
                                    <audio
                                        ref={cropAudioRef}
                                        src={pendingSong.previewUrl}
                                        onLoadedMetadata={(e) => setClipDuration(e.currentTarget.duration || 30)}
                                        onTimeUpdate={handleCropTimeUpdate}
                                        onEnded={() => setCropPlaying(false)}
                                    />
                                </div>
                            ) : (
                                <p className="text-[10.5px] italic" style={{ color: "#cbd5e1" }}>Preview audio tidak tersedia untuk lagu ini</p>
                            )}

                            <div className="flex gap-2">
                                <button onClick={handleCancelCrop}
                                    className="flex-1 h-9 sm:h-10 rounded-xl text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" style={{ background: "#f1f5f9", color: "#64748b" }}>
                                    Batal
                                </button>
                                <button onClick={handleConfirmSong} disabled={savingSong}
                                    className="flex-1 h-9 sm:h-10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                                    style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                                    {savingSong ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Gunakan Potongan Ini
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                                <input value={songQuery} onChange={(e) => setSongQuery(e.target.value)} autoFocus
                                    placeholder="Cari judul lagu atau artis..."
                                    className="w-full h-10 rounded-xl pl-9 pr-8 text-sm border focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#334155" }} />
                                <button onClick={() => { setShowSongSearch(false); setSongQuery(""); setSongResults([]); }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                    <X className="w-3.5 h-3.5" style={{ color: "#94a3b8" }} />
                                </button>
                            </div>
                            {searchingSong && (
                                <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Mencari...</p>
                            )}
                            {songResults.length > 0 && (
                                <div className="max-h-56 overflow-y-auto space-y-1 rounded-xl border border-slate-100 p-1.5">
                                    {songResults.map((song) => (
                                        <button key={song.trackId} onClick={() => handlePickSearchResult(song)}
                                            className="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200">
                                            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                                                {song.artworkUrl && <img src={song.artworkUrl} alt={song.trackName} className="w-full h-full object-cover" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold truncate" style={{ color: "#0f172a" }}>{song.trackName}</p>
                                                <p className="text-[10.5px] truncate" style={{ color: "#94a3b8" }}>{song.artistName}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <p className="text-xs italic" style={{ color: "#cbd5e1" }}>Belum ada lagu favorit</p>
                )}

                <style jsx>{`
                    @keyframes solitSongSpin {
                        from { transform: rotate(0deg); }
                        to   { transform: rotate(360deg); }
                    }
                `}</style>
            </div>

            {achievements && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
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
        <div className="bg-white rounded-2xl p-4 sm:p-5 lg:p-6 relative overflow-hidden border border-slate-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: accent }} />
            <div className="pl-2.5 sm:pl-3">
                <div className="flex items-start justify-between mb-2">
                    <span className="text-slate-700">{icon}</span>
                    {hasAchievement && <RankBadge rank={rank as number} />}
                </div>
                <p className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>{title} · {monthLabel}</p>
                <p className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "#0f172a" }}>{value}</p>
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
        <div className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0" title={`Peringkat #${rank} bulan ini`}>
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