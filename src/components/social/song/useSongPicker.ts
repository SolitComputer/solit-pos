"use client";

import { useEffect, useRef, useState } from "react";

export interface SongResult {
    trackId: number;
    trackName: string;
    artistName: string;
    artworkUrl: string | null;
    previewUrl: string | null;
    trackTimeMillis?: number;
}

export interface SavedSong {
    title: string;
    artist: string;
    artwork_url: string | null;
    preview_url: string | null;
    clip_start: number;
    expires_at: string;
}

export const CLIP_LENGTH = 15;

// Semua state + handler buat alur "cari lagu di iTunes → pilih hasil →
// tentukan potongan 15 detik → simpan ke /api/profile/song". Dipakai bareng
// oleh ProfileView (inline di kartu profil) dan SocialFeed (di dalam modal),
// biar logikanya nggak dobel.
export function useSongPicker(onSaved: (song: SavedSong) => void, onError?: (msg: string) => void) {
    const [showSongSearch, setShowSongSearch] = useState(false);
    const [songQuery, setSongQuery] = useState("");
    const [songResults, setSongResults] = useState<SongResult[]>([]);
    const [searchingSong, setSearchingSong] = useState(false);
    const [savingSong, setSavingSong] = useState(false);

    const [pendingSong, setPendingSong] = useState<SongResult | null>(null);
    const [clipStart, setClipStart] = useState(0);
    const [clipDuration, setClipDuration] = useState(30);
    const [cropPlaying, setCropPlaying] = useState(false);
    const cropAudioRef = useRef<HTMLAudioElement>(null);
    const clipStartRef = useRef(0); // Supaya onTimeUpdate selalu dapat nilai paling baru walau state belum render

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

    const openSearch = () => setShowSongSearch(true);

    const closeSearch = () => {
        setShowSongSearch(false);
        setSongQuery("");
        setSongResults([]);
    };

    const handlePickSearchResult = (song: SongResult) => {
        setPendingSong(song);
        setClipStart(0);
        clipStartRef.current = 0;
        // Preview iTunes API selalu 30 detik
        setClipDuration(30);
        setCropPlaying(true);
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

    const handleCropTimeUpdate = () => {
        const audio = cropAudioRef.current;
        if (!audio) return;
        // Berhenti setelah durasi clip habis
        if (audio.currentTime >= clipStartRef.current + CLIP_LENGTH) {
            audio.pause();
            setCropPlaying(false);
            audio.currentTime = clipStartRef.current;
        }
    };

    const handleCropEnded = () => setCropPlaying(false);

    const handleCropSliderChange = (value: number) => {
        setClipStart(value);
        clipStartRef.current = value;
        if (cropAudioRef.current) {
            cropAudioRef.current.currentTime = value;
            if (!cropPlaying) {
                cropAudioRef.current.play().catch(() => {});
                setCropPlaying(true);
            }
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
                cropAudioRef.current?.pause();
                onSaved({
                    title: pendingSong.trackName,
                    artist: pendingSong.artistName,
                    artwork_url: pendingSong.artworkUrl,
                    preview_url: pendingSong.previewUrl,
                    clip_start: clipStart,
                    expires_at: data.data.expires_at,
                });
                setPendingSong(null);
                closeSearch();
            } else {
                onError?.(data.message ?? "Gagal menyimpan lagu");
            }
        } catch {
            onError?.("Terjadi kesalahan");
        } finally {
            setSavingSong(false);
        }
    };

    return {
        showSongSearch, openSearch, closeSearch,
        songQuery, setSongQuery,
        songResults, searchingSong,
        savingSong,
        pendingSong, clipStart, clipDuration, setClipDuration, cropPlaying,
        cropAudioRef,
        handlePickSearchResult, handleCancelCrop, toggleCropPlay,
        handleCropTimeUpdate, handleCropSliderChange, handleCropEnded, handleConfirmSong,
    };
}

export type SongPickerState = ReturnType<typeof useSongPicker>;
