// src/components/ui/ChatManagerWrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useChatContext } from "@/contexts/ChatContext";
import { ChatManager } from "@/components/ui/ChatBubble";
import { getCurrentUserClient } from "@/lib/auth-client";

interface ChatUser {
    id: string;
    name: string;
    role: string;
}

export function ChatManagerWrapper() {
    const { activeChats, closeChat } = useChatContext();
    const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);

    useEffect(() => {
        getCurrentUserClient().then(user => {
            if (user) setCurrentUser({ id: user.id, name: user.name, role: user.role });
        });
    }, []);

    if (!currentUser) return null;

    return (
        <ChatManager
            currentUser={currentUser}
            activeChats={activeChats.map(u => ({ user: u }))}
            onClose={closeChat}
        />
    );
}