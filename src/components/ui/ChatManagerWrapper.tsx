// src/components/ui/ChatManagerWrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useChatContext } from "@/contexts/ChatContext";
import { ChatPanel } from "@/components/ui/ChatBubble";
import { GroupChatPanel } from "@/components/ui/GroupChatPanel";
import { getCurrentUserClient } from "@/lib/auth-client";
import { useIncomingChat } from "@/hooks/useIncomingChat";

interface ChatUser {
    id: string;
    name: string;
    role: string;
}

export function ChatManagerWrapper() {
    const {
        activeChats,
        closeChat,
        openGroupChat,
        setOpenGroupChat,
        expandedChatId,
        setExpandedChatId,
    } = useChatContext();
    const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);

    useIncomingChat();

    useEffect(() => {
        getCurrentUserClient().then(user => {
            if (user) setCurrentUser({ id: user.id, name: user.name, role: user.role });
        });
    }, []);

    useEffect(() => {
        if (activeChats.length > 0) {
            const latest = activeChats[activeChats.length - 1];
            setExpandedChatId(latest.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChats.length]);

    if (!currentUser) return null;

    const hasAnything = activeChats.length > 0 || openGroupChat;
    if (!hasAnything) return null;

    // Panel DM yang sedang aktif (expanded)
    const expandedChat = activeChats.find(u => u.id === expandedChatId) ?? null;

    return (
        <>
            {/*
             * Layout: semua panel duduk di pojok kanan bawah, tersusun ke kiri.
             * Urutan dari kanan ke kiri: GroupChatPanel → DM Panel(s)
             * Pakai flex-row-reverse agar GroupChat selalu paling kanan (dekat button),
             * dan DM panels tumbuh ke kiri secara natural.
             */}
            <div
                className="fixed z-[9991] flex flex-row-reverse items-end"
                style={{
                    bottom: 80,
                    right: 20,
                    gap: 10,
                    // max-width agar tidak overflow ke kiri layar
                    maxWidth: "calc(100vw - 280px)", // 280px = lebar sidebar dashboard
                    alignItems: "flex-end",
                }}
            >
                {/* GroupChat Panel — paling kanan */}
                {openGroupChat && (
                    <div style={{ animation: "chatSlideUp 0.18s ease-out", flexShrink: 0 }}>
                        <GroupChatPanel
                            currentUser={currentUser}
                            onClose={() => setOpenGroupChat(false)}
                        />
                    </div>
                )}

                {/* DM Panel — muncul di kiri GroupChat */}
                {expandedChat && (
                    <div
                        key={expandedChat.id}
                        style={{ animation: "chatSlideUp 0.18s ease-out", flexShrink: 0 }}
                    >
                        <ChatPanel
                            currentUser={currentUser}
                            targetUser={expandedChat}
                            isMinimized={false}
                            onToggleMinimize={() =>
                                setExpandedChatId(expandedChatId === expandedChat.id ? null : expandedChat.id)
                            }
                            onClose={() => {
                                closeChat(expandedChat.id);
                                setExpandedChatId(null);
                            }}
                            unread={0}
                        />
                    </div>
                )}
            </div>

            <style>{`
                @keyframes chatSlideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
}