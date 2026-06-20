// src/components/ui/ChatBarBackground.tsx
"use client";

import { useChatContext } from "@/contexts/ChatContext";
import { useEffect, useState } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";

interface ChatUser {
    id: string;
    name: string;
    role: string;
}

/**
 * Strip hitam di bawah layar (Facebook Messenger style).
 * Berisi tombol Grup Chat + Notifikasi.
 * Chat bubble muncul di atas strip ini lewat ChatManager.
 */
export default function ChatBarBackground() {
    const { setOpenGroupChat, openGroupChat, activeChats } = useChatContext();
    const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);

    useEffect(() => {
        getCurrentUserClient().then(u => {
            if (u) setCurrentUser({ id: u.id, name: u.name, role: u.role });
        });
    }, []);

    // Tidak perlu render strip jika tidak ada user
    if (!currentUser) return null;

    return (
        <div
            className="fixed bottom-0 left-0 z-[9997] flex items-center"
            style={{
                // Hanya muncul di sisi kiri, tidak menabrak chat bubbles di kanan
                right: 0,
                height: 42,
                background: "linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)",
                borderTop: "1px solid rgba(255,255,255,0.07)",
                paddingLeft: 16,
                paddingRight: 16,
                gap: 8,
                // Hanya tampil di lg ke atas (desktop)
            }}
        >
            {/* Solit POS logo kecil */}
            <div className="flex items-center gap-2 mr-4">
                <div className="w-6 h-6 rounded-md overflow-hidden bg-[#1a1a2e] flex-shrink-0">
                    <img
                        src="/assets/solit03.jpeg"
                        alt="Solit"
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                </div>
                <span className="text-[10px] font-bold text-white/40 tracking-wider hidden sm:block">
                    SOLIT CHAT
                </span>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-white/10 mr-2" />

            {/* Grup Chat Button */}
            <button
                onClick={() => setOpenGroupChat(!openGroupChat)}
                className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold transition ${openGroupChat
                    ? "bg-indigo-600 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                    }`}
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                <span>Grup Chat</span>
            </button>

            {/* Active chats count badge */}
            {activeChats.length > 0 && (
                <div className="flex items-center gap-1 px-2 h-5 rounded-full text-[9px] font-bold text-white/50"
                    style={{ background: "rgba(255,255,255,0.06)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {activeChats.length} chat aktif
                </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Status indicator */}
            <div className="flex items-center gap-1.5 text-[10px] text-white/25">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
            </div>
        </div>
    );
}