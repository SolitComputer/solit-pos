// src/components/ui/ChatBarBackground.tsx
// Floating button pojok kanan bawah — tidak menghalangi sidebar sama sekali
"use client";

import { useChatContext } from "@/contexts/ChatContext";
import { useEffect, useState, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";

export default function ChatBarBackground() {
    const { setOpenGroupChat, openGroupChat, activeChats, expandedChatId, setExpandedChatId } = useChatContext();
    const [ready, setReady] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getCurrentUserClient().then(u => { if (u) setReady(true); });
    }, []);

    // Tutup menu saat klik di luar
    useEffect(() => {
        if (!showMenu) return;
        const h = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [showMenu]);

    if (!ready) return null;

    const totalUnread = activeChats.length; // bisa diganti dengan unread count nanti

    return (
        <div
            ref={menuRef}
            className="fixed z-[9990]"
            style={{ bottom: 20, right: 20 }}
        >
            {/* Menu popup — muncul ke atas saat tombol diklik */}
            {showMenu && (
                <div
                    className="absolute bottom-14 right-0 bg-white rounded-2xl shadow-2xl overflow-hidden"
                    style={{
                        width: 200,
                        border: "1px solid #e5e7eb",
                        animation: "floatMenuIn 0.15s ease-out",
                    }}
                >
                    {/* Header menu */}
                    <div className="px-4 py-3 border-b border-gray-100" style={{ background: "#1a1a2e" }}>
                        <p className="text-xs font-bold text-white">Solit Chat</p>
                        <p className="text-[10px] text-white/40 mt-0.5">
                            {activeChats.length > 0
                                ? `${activeChats.length} percakapan aktif`
                                : "Tidak ada chat aktif"}
                        </p>
                    </div>

                    {/* Grup Chat */}
                    <button
                        onClick={() => { setOpenGroupChat(!openGroupChat); setShowMenu(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition hover:bg-gray-50"
                        style={{ color: openGroupChat ? "#4f46e5" : "#374151" }}
                    >
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: openGroupChat ? "#eef2ff" : "#f3f4f6" }}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                            </svg>
                        </div>
                        <span>Grup Chat</span>
                        {openGroupChat && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        )}
                    </button>

                    {/* Daftar chat aktif */}
                    {activeChats.length > 0 && (
                        <div className="border-t border-gray-100">
                            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                Chat Aktif
                            </p>
                            {activeChats.map(chat => (
                                <div key={chat.id}
                                    className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 transition cursor-pointer"
                                    onClick={() => {
                                        setExpandedChatId(expandedChatId === chat.id ? null : chat.id);
                                        setShowMenu(false);
                                    }}
                                >
                                    <div
                                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                                        style={{ background: "#4f46e5" }}
                                    >
                                        {chat.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 truncate">{chat.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Floating button utama */}
            <button
                onClick={() => setShowMenu(v => !v)}
                className="relative w-12 h-12 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
                style={{
                    background: showMenu
                        ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                        : "linear-gradient(135deg, #1a1a2e, #16213e)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)",
                }}
                title="Buka Chat"
            >
                {/* Icon berganti saat menu terbuka */}
                {showMenu ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                )}

                {/* Badge jumlah chat aktif */}
                {!showMenu && (activeChats.length > 0 || openGroupChat) && (
                    <span
                        className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white text-[8px] font-black flex items-center justify-center"
                        style={{ background: "#ef4444" }}
                    >
                        {activeChats.length + (openGroupChat ? 1 : 0)}
                    </span>
                )}
            </button>

            <style>{`
                @keyframes floatMenuIn {
                    from { opacity: 0; transform: translateY(8px) scale(0.96); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    );
}