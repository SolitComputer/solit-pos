// src/components/ui/ChatManagerWrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useChatContext } from "@/contexts/ChatContext";
import { ChatPanel } from "@/components/ui/ChatBubble";
import { GroupChatPanel } from "@/components/ui/GroupChatPanel";
import { getCurrentUserClient } from "@/lib/auth-client";
import { useIncomingChat } from "@/hooks/useIncomingChat";

interface ChatUser { id: string; name: string; role: string; }

const ROLE_COLOR: Record<string, string> = {
    ADMIN: "#7c3aed", PROGRAMMER: "#4f46e5", ASISTEN_CEO: "#9333ea",
    KEPALA_SALES: "#059669", KEPALA_MARKETING: "#e11d48", KEPALA_TEKNISI: "#dc2626",
    CREW_SALES: "#0284c7", SOTECH: "#65a30d", ACCOUNTING: "#d97706",
    PENGELOLA_BARANG: "#2563eb", TEKNISI: "#ea580c", PENGANTARAN: "#0d9488",
    MARKETING: "#db2777", KEBERSIHAN: "#0891b2", PENYEDIA_BARANG: "#ca8a04",
    KEPALA_PENYEDIA_BARANG: "#c2410c", KONTEN: "#a21caf", KEPALA_ONPOINT: "#16a34a",
    ONPOINT: "#15803d", KEPALA_SOTECH: "#4d7c0f", PKL: "#475569", CUSTOMER_SERVICE: "#0369a1",
};
const getInitials = (n: string) => n.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
const getColor = (r: string) => ROLE_COLOR[r] ?? "#6b7280";

function MinimizedHead({ user, onOpen, onClose }: { user: ChatUser; onOpen: () => void; onClose: () => void; }) {
    return (
        <div className="group relative flex items-center"
            style={{ animation: "headSlideIn .22s cubic-bezier(0.22,1,0.36,1)" }}>
            <button onClick={onOpen} title={`Buka chat ${user.name}`}
                className="relative flex items-center justify-center text-white font-bold select-none transition hover:scale-105"
                style={{ width: 48, height: 48, borderRadius: 16, background: `linear-gradient(135deg, ${getColor(user.role)}cc, ${getColor(user.role)})`, boxShadow: "0 4px 14px rgba(0,0,0,.22)", fontSize: 15 }}>
                {getInitials(user.name)}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400" style={{ border: "2px solid #fff" }} />
            </button>
            {/* Nama muncul saat hover */}
            <span className="absolute right-full mr-2 whitespace-nowrap px-2 py-1 rounded-lg text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition pointer-events-none" style={{ background: "#1a1a2e" }}>
                {user.name}
            </span>
            {/* Tutup */}
            <button onClick={onClose}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                ✕
            </button>
        </div>
    );
}

export function ChatManagerWrapper() {
    const { activeChats, closeChat, openGroupChat, setOpenGroupChat, expandedChatId, setExpandedChatId } = useChatContext();
    const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);

    useIncomingChat();

    useEffect(() => {
        getCurrentUserClient().then(user => {
            if (user) setCurrentUser({ id: user.id, name: user.name, role: user.role });
        });
    }, []);

    // Chat baru dibuka → expand yang terbaru (yang lama otomatis geser jadi head)
    useEffect(() => {
        if (activeChats.length > 0) setExpandedChatId(activeChats[activeChats.length - 1].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChats.length]);

    if (!currentUser) return null;
    if (activeChats.length === 0 && !openGroupChat) return null;

    const expandedChat = activeChats.find(u => u.id === expandedChatId) ?? null;
    const minimizedChats = activeChats.filter(u => u.id !== expandedChat?.id);

    return (
        <>
            {/* Group modal — overlay full-screen sendiri (z-9998), tetap di atas floating button */}
            {openGroupChat && (
                <GroupChatPanel currentUser={currentUser} onClose={() => setOpenGroupChat(false)} />
            )}

            {/* DM bubbles — z DI BAWAH floating button (9990) supaya popup daftar user tidak terhalang,
                dan digeser ke kiri (right:80) supaya tombol FAB tidak menutupi tombol kirim/mic */}
            {(expandedChat || minimizedChats.length > 0) && (
                <div className="fixed z-[9985] flex flex-row-reverse items-end"
                    style={{ bottom: 150, right: 20, gap: 10, maxWidth: "calc(100vw - 40px)" }}>

                    {/* DM expanded — full panel */}
                    {expandedChat && (
                        <div key={expandedChat.id} style={{ animation: "chatSlideRight .2s ease-out", flexShrink: 0 }}>
                            <ChatPanel
                                currentUser={currentUser}
                                targetUser={expandedChat}
                                isMinimized={false}
                                onToggleMinimize={() => setExpandedChatId(null)}
                                onClose={() => { closeChat(expandedChat.id); setExpandedChatId(null); }}
                                unread={0}
                            />
                        </div>
                    )}

                    {/* Chat head (minimized) */}
                    {minimizedChats.length > 0 && (
                        <div className="flex flex-col-reverse gap-2 flex-shrink-0" style={{ marginBottom: 4 }}>
                            {minimizedChats.map(u => (
                                <MinimizedHead key={u.id} user={u}
                                    onOpen={() => setExpandedChatId(u.id)}
                                    onClose={() => { closeChat(u.id); if (expandedChatId === u.id) setExpandedChatId(null); }} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes chatSlideUp { from { opacity:0; transform: translateY(12px);} to { opacity:1; transform: translateY(0);} }
                @keyframes chatSlideRight { from { opacity:0; transform: translateX(16px);} to { opacity:1; transform: translateX(0);} }
                @keyframes headPop { from { opacity:0; transform: scale(.6);} to { opacity:1; transform: scale(1);} }
                @keyframes headSlideIn { from { opacity:0; transform: translateX(28px) scale(.6);} to { opacity:1; transform: translateX(0) scale(1);} }
            `}</style>
        </>
    );
}