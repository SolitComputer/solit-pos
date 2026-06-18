// src/contexts/ChatContext.tsx
"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export interface ChatUser {
    id: string;
    name: string;
    role: string;
}

interface ChatContextValue {
    activeChats: ChatUser[];
    openChat: (user: ChatUser) => void;
    closeChat: (userId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [activeChats, setActiveChats] = useState<ChatUser[]>([]);

    const openChat = useCallback((user: ChatUser) => {
        setActiveChats(prev => {
            // Sudah terbuka → tidak duplikat
            if (prev.some(c => c.id === user.id)) return prev;
            // Maksimal 3 bubble sekaligus
            const next = prev.length >= 3 ? prev.slice(1) : prev;
            return [...next, user];
        });
    }, []);

    const closeChat = useCallback((userId: string) => {
        setActiveChats(prev => prev.filter(c => c.id !== userId));
    }, []);

    return (
        <ChatContext.Provider value={{ activeChats, openChat, closeChat }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChatContext(): ChatContextValue {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error("useChatContext harus dipakai di dalam ChatProvider");
    return ctx;
}