"use client";

import { Music, Search, Play, Pause, Loader2, Check, X } from "lucide-react";
import { CLIP_LENGTH, SongPickerState } from "./useSongPicker";
import SongTrimBar from "./SongTrimBar";

interface SongPickerPanelProps {
    picker: SongPickerState;
}

// Isi UI "cari lagu → pilih potongan → simpan" yang dipakai bareng di
// ProfileView (inline di kartu profil) dan SocialFeed (di dalam modal).
// Styling/markup persis sama seperti yang tadinya nempel di ProfileView.
export default function SongPickerPanel({ picker }: SongPickerPanelProps) {
    const {
        showSongSearch, openSearch, closeSearch,
        songQuery, setSongQuery, songResults, searchingSong,
        savingSong, pendingSong, clipStart, clipDuration, setClipDuration,
        cropPlaying, cropAudioRef,
        handlePickSearchResult, handleCancelCrop, toggleCropPlay,
        handleCropTimeUpdate, handleCropSliderChange, handleCropEnded, handleConfirmSong,
    } = picker;

    if (!showSongSearch) {
        return (
            <button onClick={openSearch}
                className="w-full h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                style={{ background: "rgb(var(--surface-2))", color: "rgb(var(--fg-muted))", border: "1px dashed rgb(var(--border))" }}>
                <Music className="w-4 h-4" /> Tambahkan lagu
            </button>
        );
    }

    if (pendingSong) {
        return (
            <div className="space-y-3 p-3 rounded-2xl border border-slate-100" style={{ background: "rgb(var(--surface-2))" }}>
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                        {pendingSong.artworkUrl && <img src={pendingSong.artworkUrl} alt={pendingSong.trackName} className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate" style={{ color: "rgb(var(--fg))" }}>{pendingSong.trackName}</p>
                        <p className="text-xs truncate" style={{ color: "rgb(var(--fg-subtle))" }}>{pendingSong.artistName}</p>
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
                        <p className="text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "rgb(var(--fg-subtle))" }}>
                            Pilih potongan {CLIP_LENGTH} detik yang ditampilkan
                        </p>
                        <SongTrimBar
                            seed={String(pendingSong.trackId)}
                            duration={clipDuration}
                            clipStart={clipStart}
                            onChange={handleCropSliderChange}
                        />
                        <div className="flex justify-between text-[9px] mt-1" style={{ color: "rgb(var(--fg-subtle))" }}>
                            <span>{Math.floor(clipStart / 60)}:{String(Math.floor(clipStart % 60)).padStart(2, "0")}</span>
                            <span>{Math.floor(Math.min(clipDuration, clipStart + CLIP_LENGTH) / 60)}:{String(Math.floor(Math.min(clipDuration, clipStart + CLIP_LENGTH) % 60)).padStart(2, "0")}</span>
                        </div>
                        <audio
                            ref={cropAudioRef}
                            src={pendingSong.previewUrl}
                            autoPlay
                            onTimeUpdate={handleCropTimeUpdate}
                            onEnded={handleCropEnded}
                        />
                    </div>
                ) : (
                    <p className="text-[10.5px] italic" style={{ color: "rgb(var(--fg-subtle))" }}>Preview audio tidak tersedia untuk lagu ini</p>
                )}

                <div className="flex gap-2">
                    <button onClick={handleCancelCrop}
                        className="flex-1 h-9 sm:h-10 rounded-xl text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" style={{ background: "rgb(var(--surface-2))", color: "rgb(var(--fg-muted))" }}>
                        Batal
                    </button>
                    <button onClick={handleConfirmSong} disabled={savingSong}
                        className="flex-1 h-9 sm:h-10 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                        style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}>
                        {savingSong ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Gunakan Potongan Ini
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "rgb(var(--fg-subtle))" }} />
                <input value={songQuery} onChange={(e) => setSongQuery(e.target.value)} autoFocus
                    placeholder="Cari judul lagu atau artis..."
                    className="w-full h-10 rounded-xl pl-9 pr-8 text-sm border focus:outline-none focus:ring-2 focus:ring-violet-400/30"
                    style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--surface-2))", color: "rgb(var(--fg))" }} />
                <button onClick={closeSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5" style={{ color: "rgb(var(--fg-subtle))" }} />
                </button>
            </div>
            {searchingSong && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Mencari...</p>
            )}
            {songResults.length > 0 && (
                <div className="max-h-56 overflow-y-auto space-y-1 rounded-xl border border-slate-100 p-1.5 bg-white">
                    {songResults.map((song) => (
                        <button key={song.trackId} onClick={() => handlePickSearchResult(song)}
                            className="w-full flex items-center gap-2.5 p-1.5 rounded-lg text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200">
                            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                                {song.artworkUrl && <img src={song.artworkUrl} alt={song.trackName} className="w-full h-full object-cover" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate" style={{ color: "rgb(var(--fg))" }}>{song.trackName}</p>
                                <p className="text-[10.5px] truncate" style={{ color: "rgb(var(--fg-subtle))" }}>{song.artistName}</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}