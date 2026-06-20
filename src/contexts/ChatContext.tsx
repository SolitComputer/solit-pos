// src/contexts/ChatContext.tsx
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

export interface ChatUser {
    id: string;
    name: string;
    role: string;
}

interface ChatContextType {
    activeChats: ChatUser[];
    openChat: (user: ChatUser) => void;
    closeChat: (userId: string) => void;
    openGroupChat: boolean;
    setOpenGroupChat: (v: boolean) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
    const [activeChats, setActiveChats] = useState<ChatUser[]>([]);
    const [openGroupChat, setOpenGroupChat] = useState(false);

    const openChat = (user: ChatUser) => {
        setActiveChats(prev => {
            if (prev.some(c => c.id === user.id)) return prev;
            const limited = prev.length >= 3 ? prev.slice(1) : prev;
            return [...limited, user];
        });
    };

    const closeChat = (userId: string) => {
        setActiveChats(prev => prev.filter(c => c.id !== userId));
    };

    return (
        <ChatContext.Provider value={{
            activeChats,
            openChat,
            closeChat,
            openGroupChat,
            setOpenGroupChat,
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChatContext() {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
    return ctx;
}