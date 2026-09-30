"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSupabaseClient } from "@/services/supabaseClient";
import { useChatContext } from "@/contexts/ChatContext";
import { getCurrentUserClient } from "@/lib/auth-client";

interface ChatUser {
    id: string;
    name: string;
    role: string;
}

const supabase = getSupabaseClient();

export function useIncomingChat() {
    const { openChat, setExpandedChatId } = useChatContext();

    const usersRef = useRef<Map<string, ChatUser>>(new Map());
    const inflightRef = useRef<Promise<void> | null>(null);

    // Pakai ref supaya callback realtime selalu memakai fungsi terbaru
    // tanpa perlu resubscribe channel tiap render.
    const openChatRef = useRef(openChat);
    const setExpandedRef = useRef(setExpandedChatId);
    useEffect(() => { openChatRef.current = openChat; }, [openChat]);
    useEffect(() => { setExpandedRef.current = setExpandedChatId; }, [setExpandedChatId]);

    // ── Cache daftar user (resolve nama + role dari sender_id) ────────────────
    const loadUsers = useCallback((): Promise<void> => {
        if (inflightRef.current) return inflightRef.current; // dedupe pemanggilan bersamaan
        const p = (async () => {
            try {
                const res = await fetch("/api/users");
                const data = await res.json();
                if (data.success) {
                    const map = new Map<string, ChatUser>();
                    for (const u of data.users as ChatUser[]) {
                        map.set(u.id, { id: u.id, name: u.name, role: u.role });
                    }
                    usersRef.current = map;
                }
            } catch {
                /* diamkan — ada fallback di resolveSender */
            } finally {
                inflightRef.current = null;
            }
        })();
        inflightRef.current = p;
        return p;
    }, []);

    const resolveSender = useCallback(async (senderId: string): Promise<ChatUser> => {
        let u = usersRef.current.get(senderId);
        if (!u) {
            await loadUsers(); // ada user baru? refresh sekali
            u = usersRef.current.get(senderId);
        }
        return u ?? { id: senderId, name: "Pengguna", role: "" };
    }, [loadUsers]);

    // ── Aksi utama: buka + expand panel pengirim ──────────────────────────────
    const openConversation = useCallback(async (senderId: string) => {
        if (!senderId) return;
        const sender = await resolveSender(senderId);
        openChatRef.current(sender);
        setExpandedRef.current(sender.id);
    }, [resolveSender]);

    const openConvRef = useRef(openConversation);
    useEffect(() => { openConvRef.current = openConversation; }, [openConversation]);

    // ── 1) Preload daftar user (TANPA auto-open) ──────────────────────────────
    // DULU: DM masuk lewat realtime → panel chat kebuka sendiri (mengganggu).
    // SEKARANG: pesan masuk cukup tampil sebagai push notification (dari service
    // worker). Panel chat baru kebuka kalau NOTIFNYA DIKLIK — lihat efek deep-link
    // ?dm= dan listener NOTIFICATION_CLICK di bawah, yang sudah ada.
    // User di-preload di sini supaya begitu notif diklik, panel langsung kebuka instan.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const me = await getCurrentUserClient();
            if (!me || cancelled) return;
            await loadUsers();
        })();
        return () => { cancelled = true; };
    }, [loadUsers]);

    // ── 2) Deep-link dari klik push notif: /dashboard?dm=<senderId> ───────────
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const dmId = params.get("dm");
        if (!dmId) return;

        openConvRef.current(dmId);

        // bersihkan query agar tidak ke-trigger lagi saat refresh
        params.delete("dm");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }, []);

    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
        const handler = (event: MessageEvent) => {
            const data = event.data as { type?: string; url?: string } | null;
            if (!data || data.type !== "NOTIFICATION_CLICK" || !data.url) return;
            try {
                const url = new URL(data.url, window.location.origin);
                const dmId = url.searchParams.get("dm");
                if (dmId) openConvRef.current(dmId);
            } catch {
                /* ignore */
            }
        };
        navigator.serviceWorker.addEventListener("message", handler);
        return () => navigator.serviceWorker.removeEventListener("message", handler);
    }, []);
}