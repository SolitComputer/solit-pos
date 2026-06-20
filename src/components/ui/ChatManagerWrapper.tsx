// src/components/ui/ChatManagerWrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useChatContext } from "@/contexts/ChatContext";
import { ChatPanel } from "@/components/ui/ChatBubble";
import { GroupChatPanel } from "@/components/ui/GroupChatPanel";
import { getCurrentUserClient } from "@/lib/auth-client";

interface ChatUser {
    id: string;
    name: string;
    role: string;
}

export function ChatManagerWrapper() {
    const { activeChats, closeChat, openGroupChat, setOpenGroupChat, expandedChatId, setExpandedChatId } = useChatContext();
    const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);

    useEffect(() => {
        getCurrentUserClient().then(user => {
            if (user) setCurrentUser({ id: user.id, name: user.name, role: user.role });
        });
    }, []);

    // Auto-expand chat terbaru ketika ditambahkan
    useEffect(() => {
        if (activeChats.length > 0) {
            const latest = activeChats[activeChats.length - 1];
            setExpandedChatId(latest.id);
        }
    }, [activeChats.length]);

    if (!currentUser) return null;

    const hasAnything = activeChats.length > 0 || openGroupChat;
    if (!hasAnything) return null;

    return (
        <div
            className="fixed z-[9991] flex items-end gap-2"
            style={{ bottom: 80, right: 20 }}
        >
            {/* GroupChat Panel */}
            {openGroupChat && (
                <div style={{ animation: "chatSlideUp 0.18s ease-out" }}>
                    <GroupChatPanel
                        currentUser={currentUser}
                        onClose={() => setOpenGroupChat(false)}
                    />
                </div>
            )}

            {/* DM Panels — hanya yang expanded */}
            {activeChats
                .filter(u => expandedChatId === u.id)
                .map(user => (
                    <div key={user.id} style={{ animation: "chatSlideUp 0.18s ease-out" }}>
                        <ChatPanel
                            currentUser={currentUser}
                            targetUser={user}
                            isMinimized={false}
                            onToggleMinimize={() =>
                                setExpandedChatId(expandedChatId === user.id ? null : user.id)
                            }
                            onClose={() => {
                                closeChat(user.id);
                                setExpandedChatId(null);
                            }}
                            unread={0}
                        />
                    </div>
                ))
            }

            <style>{`
                @keyframes chatSlideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}