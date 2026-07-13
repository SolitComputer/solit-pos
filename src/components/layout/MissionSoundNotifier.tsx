// src/components/layout/MissionSoundNotifier.tsx
"use client";
import { useEffect, useRef } from "react";
import { supabase } from "@/services/supabase";

interface Props {
    userId: string | null;
    unlockAudio: () => Promise<void>;
    playMissionSound: () => Promise<void>;
}

export function MissionSoundNotifier({ userId, playMissionSound }: Props) {
    // Ref supaya callback selalu fresh tanpa perlu re-subscribe channel
    const playRef = useRef(playMissionSound);
    useEffect(() => { playRef.current = playMissionSound; }, [playMissionSound]);

    useEffect(() => {
        if (!userId) return;

        const ch = supabase
            .channel(`msn-${userId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "missions",
                    // Server-side filter — hanya event untuk user ini yang dikirim
                    filter: `assigned_to=eq.${userId}`,
                },
                () => {
                    void playRef.current();
                }
            )
            .subscribe();

        return () => { void supabase.removeChannel(ch); };
    }, [userId]);

    return null;
}