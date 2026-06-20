
"use client";

import { useChatContext } from "@/contexts/ChatContext";

interface ChatUser {
    id: string;
    name: string;
    role: string;
}

interface Props {
    user: ChatUser;
    currentUserId: string; 
    className?: string;
    label?: string;
}

export function OpenChatButton({ user, currentUserId, className, label }: Props) {
    const { openChat } = useChatContext();

    if (user.id === currentUserId) return null;

    return (
        <button
            onClick={() => openChat(user)}
            title={`Chat dengan ${user.name}`}
            className={className ?? "w-8 h-8 flex items-center justify-center text-blue-500 hover:bg-blue-50 rounded-xl transition-all hover:scale-110"}
        >
            {label ? (
                <span className="text-xs font-semibold">{label}</span>
            ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            )}
        </button>
    );
}