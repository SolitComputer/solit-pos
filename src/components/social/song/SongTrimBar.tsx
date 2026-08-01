"use client";

import { useMemo } from "react";
import { CLIP_LENGTH } from "./useSongPicker";

const BAR_COUNT = 48;

// Hash sederhana biar pola bar "waveform" stabil per lagu (di-seed dari
// trackId/previewUrl), bukan Math.random() polos yang berubah tiap render.
function seededHeight(seed: string, index: number): number {
    let h = 0;
    const str = `${seed}:${index}`;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return 22 + (Math.abs(h) % 100) * 0.78; // 22% – 100% tinggi
}

interface SongTrimBarProps {
    seed: string;
    duration: number;
    clipStart: number;
    onChange: (value: number) => void;
}

// Visual ala trim bar Instagram: strip bar mirip waveform dengan jendela
// potongan 30 detik yang di-highlight. Drag tetap pakai native range input
// (di-overlay transparan) supaya interaksinya reliable, cuma tampilannya
// yang dibikin lebih hidup.
export default function SongTrimBar({ seed, duration, clipStart, onChange }: SongTrimBarProps) {
    const heights = useMemo(
        () => Array.from({ length: BAR_COUNT }, (_, i) => seededHeight(seed, i)),
        [seed]
    );

    const safeDuration = duration > 0 ? duration : CLIP_LENGTH;
    const windowStartPct = (clipStart / safeDuration) * 100;
    const windowEndPct = (Math.min(safeDuration, clipStart + CLIP_LENGTH) / safeDuration) * 100;
    const maxStart = Math.max(0, Math.floor(safeDuration - CLIP_LENGTH));

    return (
        <div className="relative w-full h-12 rounded-xl overflow-hidden" style={{ background: "#eef1f6" }}>
            <div className="absolute inset-0 flex items-center gap-[2px] px-1">
                {heights.map((h, i) => {
                    const barPct = (i / BAR_COUNT) * 100;
                    const inWindow = barPct >= windowStartPct && barPct <= windowEndPct;
                    return (
                        <div
                            key={i}
                            className="flex-1 rounded-full transition-colors"
                            style={{
                                height: `${h}%`,
                                background: inWindow ? "#1db954" : "#cbd5e1",
                                opacity: inWindow ? 1 : 0.6,
                            }}
                        />
                    );
                })}
            </div>

            <div
                className="absolute inset-y-0 rounded-lg pointer-events-none"
                style={{
                    left: `${windowStartPct}%`,
                    width: `${Math.max(0, windowEndPct - windowStartPct)}%`,
                    boxShadow: "inset 0 0 0 2px rgba(29,185,84,0.55)",
                }}
            />

            <input
                type="range"
                min={0}
                max={maxStart}
                value={clipStart}
                onChange={(e) => onChange(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Pilih potongan lagu"
            />
        </div>
    );
}
