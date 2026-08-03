"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserClient } from "@/lib/auth-client";
import { useChatContext } from "@/contexts/ChatContext";
import { humanizeRoleKey } from "@/lib/permissions";
import { useSongPicker } from "./song/useSongPicker";
import SongPickerPanel from "./song/SongPickerPanel";
import { Search, MessageCircle, Music, Play, Pause, X, Plus, Eye, Loader2, Check } from "lucide-react";

const MAX_NOTE_LENGTH = 60;

interface SocialUser {
    id: string;
    name: string;
    role: string;
    roles: string[];
    profile_photo_url: string | null;
    bio: string | null;
    status_note: string | null;
    status_note_expires_at: string | null;
    song_title: string | null;
    song_artist: string | null;
    song_artwork_url: string | null;
    song_preview_url: string | null;
    song_clip_start: number;
    song_expires_at: string | null;
}
const CLIP_LENGTH = 15; // durasi klip lagu — 15 detik (preview iTunes)

function getInitials(name: string) {
    return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function hasActiveStory(u: SocialUser): boolean {
    return !!u.status_note || !!u.song_title;
}

function timeLeft(expiresAtIso: string): string {
    const diffMs = new Date(expiresAtIso).getTime() - Date.now();
    if (diffMs <= 0) return "Kadaluarsa";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours >= 1) return `${hours} jam lagi`;
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${minutes} menit lagi`;
}

// Gabungkan catatan + lagu + sisa waktu jadi satu deskripsi untuk baris user
function describeUser(u: SocialUser): string {
    const parts: string[] = [];
    if (u.status_note) {
        parts.push(u.status_note_expires_at ? `${u.status_note} · ${timeLeft(u.status_note_expires_at)}` : u.status_note);
    }
    if (u.song_title) {
        const songLabel = `🎵 ${u.song_title} · ${u.song_artist}`;
        parts.push(u.song_expires_at ? `${songLabel} · ${timeLeft(u.song_expires_at)}` : songLabel);
    }
    return parts.length > 0 ? parts.join(" · ") : humanizeRoleKey(u.roles?.[0] ?? u.role);
}

export default function SocialFeed() {
    const { openChat } = useChatContext();
    const [me, setMe] = useState<{ id: string; name: string } | null>(null);
    const [users, setUsers] = useState<SocialUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [viewingUser, setViewingUser] = useState<SocialUser | null>(null);
    const [showAddChooser, setShowAddChooser] = useState(false);
    const [showSongPicker, setShowSongPicker] = useState(false);
    const [showNoteEditor, setShowNoteEditor] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [noteError, setNoteError] = useState<string | null>(null);
    const [playingSongId, setPlayingSongId] = useState<string | null>(null);
    const listAudioRef = useRef<HTMLAudioElement>(null);
    const router = useRouter();

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/users");
            const data = await res.json();
            if (data.success) setUsers(data.users);
        } catch {
            // diam-diam gagal, list lama tetap ditampilkan
        } finally {
            setLoading(false);
        }
    };

    const songPicker = useSongPicker(() => {
        setShowSongPicker(false);
        fetchUsers();
    });

    const closeSongPicker = () => {
        songPicker.handleCancelCrop();
        songPicker.closeSearch();
        setShowSongPicker(false);
    };

    const handleSaveNote = async () => {
        const trimmed = noteDraft.trim();
        if (!trimmed) return;
        setSavingNote(true);
        setNoteError(null);
        try {
            const res = await fetch("/api/profile/note", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note: trimmed }),
            });
            const data = await res.json();
            if (data.success) {
                setShowNoteEditor(false);
                setNoteDraft("");
                fetchUsers();
            } else {
                setNoteError(data.message ?? "Gagal membuat catatan");
            }
        } catch {
            setNoteError("Terjadi kesalahan");
        } finally {
            setSavingNote(false);
        }
    };

    const closeNoteEditor = () => {
        setShowNoteEditor(false);
        setNoteDraft("");
        setNoteError(null);
    };

    useEffect(() => {
        getCurrentUserClient().then((u) => { if (u) setMe({ id: u.id, name: u.name }); });
    }, []);

    useEffect(() => { fetchUsers(); }, []);

    // Refresh berkala biar catatan/lagu yang kadaluarsa (24 jam) langsung hilang dari tampilan
    useEffect(() => {
        const t = setInterval(fetchUsers, 60000);
        return () => clearInterval(t);
    }, []);

    const storyUsers = useMemo(
        () => users.filter((u) => me && u.id !== me.id && hasActiveStory(u)),
        [users, me]
    );

    const myUser = useMemo(() => users.find((u) => u.id === me?.id) ?? null, [users, me]);

    const directoryUsers = useMemo(() => {
        let list = users.filter((u) => !me || u.id !== me.id);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter((u) => u.name.toLowerCase().includes(q));
        }
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }, [users, me, search]);

    const handlePlaySong = (u: SocialUser) => {
        if (!u.song_preview_url) return;
        const audio = listAudioRef.current;
        if (!audio) return;
        if (playingSongId === u.id) {
            audio.pause();
            setPlayingSongId(null);
            return;
        }
        audio.src = u.song_preview_url;
        audio.currentTime = 0;
        audio.play().catch(() => { });
        setPlayingSongId(u.id);
    };

    const handleListAudioTimeUpdate = () => {
        const audio = listAudioRef.current;
        if (!audio) return;
        if (audio.currentTime >= CLIP_LENGTH) {
            audio.pause();
            setPlayingSongId(null);
        }
    };

    const handleChat = (u: SocialUser) => {
        openChat({ id: u.id, name: u.name, role: u.role, profile_photo_url: u.profile_photo_url });
    };

    return (
        <div className="min-h-screen bg-[#F7F7F8]">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5">

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)", boxShadow: "0 4px 14px rgba(15,12,41,0.35)" }}>
                        <svg width="18" height="18" fill="none" stroke="white" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="18" height="18" rx="5" />
                            <circle cx="12" cy="12" r="4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Sosial</h1>
                        <p className="text-[11px] text-slate-400">Catatan & obrolan seluruh tim</p>
                    </div>
                </div>


                <div className="bg-white rounded-2xl border border-slate-100 pb-4 px-1" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                    <div className="flex gap-3 sm:gap-4 lg:gap-5 overflow-x-auto pt-9 sm:pt-10 px-3 lg:px-5 pb-1 snap-x snap-mandatory scrollbar-hide">
                        {myUser && (
                            <StoryBubble
                                user={myUser}
                                isSelf
                                onClick={() =>
                                    hasActiveStory(myUser)
                                        ? setViewingUser(myUser)
                                        : setShowAddChooser(true)
                                }
                                onAddClick={() => setShowAddChooser(true)}
                            />
                        )}
                        {loading && !myUser && (
                            <div className="w-16 h-16 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                        )}
                        {storyUsers.map((u) => (
                            <StoryBubble key={u.id} user={u} onClick={() => setViewingUser(u)} />
                        ))}
                        {!loading && storyUsers.length === 0 && (
                            <p className="text-xs text-slate-300 italic py-4 px-2 whitespace-nowrap">
                                Belum ada catatan aktif dari tim
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Search ────────────────────────────────────────────────────── */}
                <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama rekan kerja..."
                        className="w-full h-11 rounded-2xl pl-9 pr-4 text-sm font-medium border focus:outline-none focus:ring-2 focus:ring-violet-400/30 bg-white"
                        style={{ borderColor: "#e8ecf5", color: "#334155" }}
                    />
                </div>

                {/* ── Directory list ────────────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                    {loading ? (
                        <div className="flex flex-col gap-2">
                            {Array(6).fill(0).map((_, i) => (
                                <div key={i} className="rounded-2xl px-4 py-3 flex items-center gap-3 animate-pulse bg-slate-50/60">
                                    <div className="w-11 h-11 rounded-full bg-slate-100 flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-32 bg-slate-100 rounded-full" />
                                        <div className="h-2.5 w-20 bg-slate-50 rounded-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : directoryUsers.length === 0 ? (
                        <div className="text-center py-14 px-4">
                            <p className="text-sm font-bold text-slate-400">Tidak ada user ditemukan</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {directoryUsers.map((u) => (
                                <div
                                    key={u.id}
                                    className="px-4 py-3 flex items-center gap-3 rounded-2xl border border-slate-100 hover:border-violet-200 hover:bg-slate-50/70 transition-colors cursor-pointer"
                                    onClick={() => (hasActiveStory(u) ? setViewingUser(u) : handleChat(u))}
                                >
                                    <div
                                        className="relative flex-shrink-0 cursor-pointer"
                                        title={`Lihat profil ${u.name}`}
                                        onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/profile/${u.id}`); }}
                                    >
                                        <div
                                            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-black overflow-hidden"
                                            style={{
                                                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                                                boxShadow: hasActiveStory(u) ? "0 0 0 2px #fff, 0 0 0 4px #a78bfa" : "none",
                                            }}
                                        >
                                            {u.profile_photo_url
                                                ? <img src={u.profile_photo_url} alt={u.name} className="w-full h-full object-cover" />
                                                : getInitials(u.name)}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p
                                            className="text-sm font-bold text-slate-800 truncate w-fit cursor-pointer hover:text-violet-600 hover:underline"
                                            onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/profile/${u.id}`); }}
                                        >
                                            {u.name}
                                        </p>
                                        <p
                                            className={`text-[11px] text-slate-400 truncate ${u.song_preview_url ? "cursor-pointer hover:text-emerald-600" : ""}`}
                                            onClick={(e) => {
                                                if (!u.song_preview_url) return;
                                                e.stopPropagation();
                                                handlePlaySong(u);
                                            }}
                                            title={u.song_preview_url ? "Putar lagu" : undefined}
                                        >
                                            {playingSongId === u.id && <Pause className="w-3 h-3 inline -mt-0.5 mr-1" />}
                                            {describeUser(u)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleChat(u); }}
                                        title={`Chat dengan ${u.name}`}
                                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
                                        style={{ background: "#eff6ff", color: "#3b82f6" }}
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <audio ref={listAudioRef} onEnded={() => setPlayingSongId(null)} onTimeUpdate={handleListAudioTimeUpdate} />

            {viewingUser && (
                <StoryModal
                    user={viewingUser}
                    isSelf={me?.id === viewingUser.id}
                    onClose={() => setViewingUser(null)}
                    onChat={() => { handleChat(viewingUser); setViewingUser(null); }}
                    onEditSong={() => {
                        setViewingUser(null);
                        songPicker.openSearch();
                        setShowSongPicker(true);
                    }}
                />
            )}

            {showAddChooser && (
                <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddChooser(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden p-2">
                        <button
                            onClick={() => { setShowAddChooser(false); setNoteDraft(""); setNoteError(null); setShowNoteEditor(true); }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-slate-50 text-left"
                        >
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#ede9fe", color: "#7c3aed" }}>
                                <MessageCircle className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-bold text-slate-700">Tulis Catatan</span>
                        </button>
                        <button
                            onClick={() => { setShowAddChooser(false); songPicker.openSearch(); setShowSongPicker(true); }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl hover:bg-slate-50 text-left"
                        >
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#dcfce7", color: "#16a34a" }}>
                                <Music className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-bold text-slate-700">Tambah Lagu</span>
                        </button>
                    </div>
                </div>
            )}

            {showSongPicker && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70" style={{ backdropFilter: "blur(6px)" }} onClick={closeSongPicker} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                            <div className="flex items-center gap-2 min-w-0">
                                <Music className="w-4 h-4 text-white flex-shrink-0" />
                                <p className="text-sm font-bold text-white truncate">Tambah Lagu</p>
                            </div>
                            <button onClick={closeSongPicker} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
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

            {showNoteEditor && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70" style={{ backdropFilter: "blur(6px)" }} onClick={closeNoteEditor} />
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                            <div className="flex items-center gap-2 min-w-0">
                                <MessageCircle className="w-4 h-4 text-white flex-shrink-0" />
                                <p className="text-sm font-bold text-white truncate">Tulis Catatan</p>
                            </div>
                            <button onClick={closeNoteEditor} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: "rgba(255,255,255,0.1)" }}>
                                <X className="w-4 h-4 text-white" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <input
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                                    placeholder="Tulis catatan singkat... (hilang dalam 24 jam)"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(); }}
                                    className="w-full h-11 rounded-xl px-3.5 text-sm border focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                                    style={{ borderColor: "#e2e8f0", background: "#f8fafc", color: "#334155" }}
                                />
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[10px] text-slate-300">{noteDraft.length}/{MAX_NOTE_LENGTH}</span>
                                    {noteError && <span className="text-[10px] font-semibold text-red-500">{noteError}</span>}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={closeNoteEditor}
                                    className="flex-1 h-10 rounded-xl text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                    style={{ background: "#f1f5f9", color: "#64748b" }}>
                                    Batal
                                </button>
                                <button onClick={handleSaveNote} disabled={savingNote || !noteDraft.trim()}
                                    className="flex-1 h-10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Simpan
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
        </div>
    );
}

function StoryBubble({ user, isSelf, onClick, onAddClick }: { user: SocialUser; isSelf?: boolean; onClick: () => void; onAddClick?: () => void }) {
    const active = hasActiveStory(user);
    const hasNote = !!user.status_note;
    const hasSong = !!user.song_title;

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
            className="relative flex flex-col items-center gap-2 flex-shrink-0 w-20 snap-start group cursor-pointer"
        >
            <div className="relative">
                {/* Sticker gelap menumpuk di atas foto — gaya Instagram Music/Notes.
                     Sekarang SATU kotak (bukan dua kotak terpisah): lagu selalu di baris
                     atas, catatan di baris bawah, dipisah garis tipis kalau dua-duanya ada.
                     Lebar dikunci w-20 (80px) supaya tidak pernah nyerempet ke bubble tetangga. */}
                {(hasNote || hasSong) && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-20">
                        <div className="rounded-2xl shadow-lg overflow-hidden" style={{ background: "rgba(15,15,20,0.9)" }}>
                            {hasSong && (
                                <div className="px-2 py-1 text-left">
                                    <div className="flex items-center gap-1">
                                        <Music className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#1db954" }} />
                                        <span className="text-[8.5px] font-bold text-white truncate">{user.song_title}</span>
                                    </div>
                                    <p className="text-[7.5px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{user.song_artist}</p>
                                </div>
                            )}
                            {hasNote && (
                                <div
                                    className="px-2 py-1 text-center"
                                    style={hasSong ? { borderTop: "1px solid rgba(255,255,255,0.12)" } : undefined}
                                >
                                    <p className="text-[8.5px] font-semibold text-white truncate">{user.status_note}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div
                    className="w-16 h-16 mx-auto rounded-full p-[2.5px] transition-transform group-active:scale-95"
                    style={{ background: active ? "linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)" : "#e2e8f0" }}
                >
                    <div className="w-full h-full rounded-full border-2 border-white overflow-hidden flex items-center justify-center text-white text-lg font-black"
                        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                        {user.profile_photo_url
                            ? <img src={user.profile_photo_url} alt={user.name} className="w-full h-full object-cover" />
                            : getInitials(user.name)}
                    </div>
                </div>
                {isSelf && onAddClick && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onAddClick(); }}
                        title="Tambah catatan atau lagu"
                        className="absolute bottom-0 right-1 w-5 h-5 rounded-full bg-[#1a1a2e] text-white flex items-center justify-center border-2 border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                )}
            </div>
            <p className="text-[10.5px] font-semibold text-slate-600 truncate w-full text-center">
                {isSelf ? "Catatan Anda" : user.name.split(" ")[0]}
            </p>
        </div>
    );
}

function StoryModal({ user, isSelf, onClose, onChat, onEditSong }: { user: SocialUser; isSelf?: boolean; onClose: () => void; onChat: () => void; onEditSong?: () => void }) {
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [viewers, setViewers] = useState<{ id: string; name: string; profile_photo_url: string | null; viewed_at: string }[]>([]);
    const [showViewers, setShowViewers] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (user.song_preview_url && audioRef.current) {
            audioRef.current.currentTime = user.song_clip_start ?? 0;
            audioRef.current.play().then(() => setPlaying(true)).catch(() => { });
        }
        return () => { audioRef.current?.pause(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.id]);

    // Catat bahwa user LAIN sudah melihat catatan/lagu kita — dilewati untuk cerita sendiri
    useEffect(() => {
        if (isSelf) return;
        fetch("/api/profile/note/views", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner_id: user.id }),
        }).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.id, isSelf]);

    // Kalau ini catatan/lagu milik sendiri — ambil daftar siapa saja yang sudah melihat
    useEffect(() => {
        if (!isSelf) { setViewers([]); return; }
        fetch(`/api/profile/note/views?ownerId=${user.id}`)
            .then((r) => r.json())
            .then((d) => { if (d.success) setViewers(d.data); })
            .catch(() => { });
    }, [isSelf, user.id]);

    const handleTimeUpdate = () => {
        const audio = audioRef.current;
        if (!audio || !user) return;
        // Berhenti setelah CLIP_LENGTH habis dari titik mulai
        if (audio.currentTime >= (user.song_clip_start ?? 0) + CLIP_LENGTH) {
            audio.pause();
            setPlaying(false);
            audio.currentTime = user.song_clip_start ?? 0;
        }
    };

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
            setPlaying(false);
        } else {
            audio.currentTime = user.song_clip_start ?? 0;
            audio.play().catch(() => { });
            setPlaying(true);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="p-5 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                   <div
                        className="flex items-center gap-3 min-w-0 cursor-pointer group"
                        title={`Lihat profil ${user.name}`}
                        onClick={() => router.push(`/dashboard/profile/${user.id}`)}
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-sm font-black"
                            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                            {user.profile_photo_url
                                ? <img src={user.profile_photo_url} alt={user.name} className="w-full h-full object-cover" />
                                : getInitials(user.name)}
                        </div>
                        <p className="text-sm font-bold text-white truncate group-hover:underline">{user.name}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(255,255,255,0.1)" }}>
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {user.status_note && (
                        <div className="text-center">
                            <p className="text-base font-semibold text-slate-700 leading-relaxed">"{user.status_note}"</p>
                            {user.status_note_expires_at && (
                                <p className="text-[10.5px] text-slate-400 mt-1">{timeLeft(user.status_note_expires_at)}</p>
                            )}
                        </div>
                    )}

                    {user.song_title && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#f8fafc" }}>
                                <button onClick={togglePlay} disabled={!user.song_preview_url}
                                    className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 shadow-md disabled:cursor-default"
                                    style={{ animation: playing ? "solitSongSpin 3s linear infinite" : "none" }}>
                                    {user.song_artwork_url
                                        ? <img src={user.song_artwork_url} alt={user.song_title} className="w-full h-full object-cover" />
                                        : <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#1db954,#159c46)" }}><Music className="w-5 h-5 text-white" /></div>}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate text-slate-800">{user.song_title}</p>
                                    <p className="text-[10.5px] truncate text-slate-400">
                                        {user.song_artist}
                                        {user.song_expires_at && ` · ${timeLeft(user.song_expires_at)}`}
                                    </p>
                                </div>
                                {user.song_preview_url && (
                                    <button onClick={togglePlay} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100">
                                        {playing ? <Pause className="w-3.5 h-3.5 text-slate-600" /> : <Play className="w-3.5 h-3.5 text-slate-600 ml-0.5" />}
                                    </button>
                                )}
                                {user.song_preview_url && (
                                    <audio ref={audioRef} src={user.song_preview_url} onTimeUpdate={handleTimeUpdate} onEnded={() => setPlaying(false)} />
                                )}
                            </div>
                            {isSelf && onEditSong && (
                                <button onClick={onEditSong} className="flex items-center justify-center gap-1 mt-1 text-[11px] font-semibold text-slate-400 hover:text-violet-500 transition-colors">
                                    Edit lagu
                                </button>
                            )}
                        </div>
                    )}

                    {isSelf && (
                        <div>
                            <button onClick={() => setShowViewers((v) => !v)}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                                <Eye className="w-3.5 h-3.5" />
                                {viewers.length > 0 ? `Dilihat ${viewers.length} orang` : "Belum ada yang melihat"}
                            </button>
                            {showViewers && (
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-1 rounded-xl border border-slate-100 p-1.5">
                                    {viewers.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic text-center py-3">Belum ada yang melihat</p>
                                    ) : (
                                        viewers.map((v) => (
                                            <div key={v.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50">
                                                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-white text-[10px] font-black"
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
                            )}
                        </div>
                    )}

                    {!isSelf && (
                        <button onClick={onChat}
                            className="w-full h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                            <MessageCircle className="w-4 h-4" /> Chat dengan {user.name.split(" ")[0]}
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
        @keyframes solitSongSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}