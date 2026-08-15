"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import { Cake, PartyPopper } from "lucide-react";

interface BirthdayUser {
    id: string;
    name: string;
    role: string;
    birth_date: string;
}

function isBirthdayToday(birthDate: string | null): boolean {
    if (!birthDate) return false;
    const today = new Date();
    const clean = birthDate.slice(0, 10);
    const [y, m, d] = clean.split("-").map(Number);
    if (!y || !m || !d) return false;
    return d === today.getDate() && m === (today.getMonth() + 1);
}

function getAge(birthDate: string): number {
    const today = new Date();
    const clean = birthDate.slice(0, 10);
    const [y, m, d] = clean.split("-").map(Number);
    if (!y || !m || !d) return 0;
    let age = today.getFullYear() - y;
    const currentMonth = today.getMonth() + 1;
    if (currentMonth < m || (currentMonth === m && today.getDate() < d)) age--;
    return age;
}

function getDismissKey(): string {
    const d = new Date();
    return `solit_bday_dismissed_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function BirthdayBanner() {
    const [birthdayUsers, setBirthdayUsers] = useState<BirthdayUser[]>([]);
    const [dismissed, setDismissed] = useState(true); // start hidden until loaded
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Check dismissed state
    useEffect(() => {
        try {
            const wasDismissed = sessionStorage.getItem(getDismissKey()) === "1";
            setDismissed(wasDismissed);
        } catch {
            setDismissed(false);
        }
    }, []);

    // Fetch current user
    useEffect(() => {
        getCurrentUserClient().then(u => {
            if (u) setCurrentUserId(u.id);
        });
    }, []);

    // Fetch birthday users
    useEffect(() => {
        const fetchBirthdays = async () => {
            try {
                const res = await fetch("/api/users", { cache: "no-store" });
                const data = await res.json();
                if (data.success) {
                    const bdays = (data.users ?? []).filter(
                        (u: any) => u.birth_date && isBirthdayToday(u.birth_date)
                    );
                    setBirthdayUsers(bdays);
                }
            } catch { /* silent */ }
        };
        fetchBirthdays();
    }, []);

    const handleDismiss = useCallback(() => {
        setDismissed(true);
        try { sessionStorage.setItem(getDismissKey(), "1"); } catch { }
    }, []);

    const handleSend = useCallback(async () => {
        const text = message.trim();
        if (!text || !currentUserId || sending) return;
        setSending(true);
        try {
            // Send DM to each birthday user
            const promises = birthdayUsers
                .filter(u => u.id !== currentUserId) // don't send to self
                .map(u =>
                    fetch("/api/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ receiver_id: u.id, content: ` ${text}` }),
                    })
                );
            await Promise.allSettled(promises);
            setSent(true);
            setMessage("");
            // Auto-hide sent state after 3s
            setTimeout(() => setSent(false), 3000);
        } catch { /* silent */ }
        finally { setSending(false); }
    }, [message, currentUserId, birthdayUsers, sending]);

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Don't render if no birthday users, dismissed, or not loaded yet
    if (birthdayUsers.length === 0 || dismissed) return null;

    const names = birthdayUsers.map(u => {
        const age = getAge(u.birth_date);
        return `${u.name}${age ? ` (${age} th)` : ""}`;
    }).join(", ");

    // Check if current user IS the birthday person (don't show send-to-self)
    const canSendWish = birthdayUsers.some(u => u.id !== currentUserId);

    return (
        <div
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[9998] w-full max-w-md px-4"
            style={{ animation: "bdaySlideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
            <div
                className="rounded-2xl overflow-hidden shadow-2xl"
                style={{
                    background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%)",
                    border: "1px solid #f59e0b",
                    boxShadow: "0 8px 32px rgba(245,158,11,0.25)",
                }}
            >
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                    <Cake size={24} className="flex-shrink-0 text-amber-700" />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-amber-900 flex items-center gap-1"><PartyPopper size={14} className="flex-shrink-0" />Selamat Ulang Tahun!</p>
                        <p className="text-[11px] text-amber-800 font-semibold mt-0.5 truncate">{names}</p>
                    </div>
                    <PartyPopper size={24} className="flex-shrink-0 text-amber-700" />
                    {/* Close button */}
                    <button
                        onClick={handleDismiss}
                        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition hover:scale-110 active:scale-95"
                        style={{ background: "rgba(146,64,14,0.15)", color: "#92400e" }}
                        title="Tutup"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Send wish input */}
                {canSendWish && (
                    <div className="px-3 pb-3">
                        {sent ? (
                            <div className="flex items-center justify-center gap-2 h-9 rounded-xl text-[11px] font-bold text-emerald-800"
                                style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(5,150,105,0.2)" }}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Ucapan terkirim via chat! <PartyPopper size={14} className="flex-shrink-0" />
                            </div>
                        ) : (
                            <div className="flex gap-1.5">
                                <input
                                    ref={inputRef}
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    onKeyDown={handleKey}
                                    placeholder="Kirim ucapan ulang tahun..."
                                    maxLength={500}
                                    disabled={sending}
                                    className="flex-1 h-9 rounded-xl px-3 text-[11px] font-medium outline-none disabled:opacity-50"
                                    style={{
                                        background: "rgba(255,255,255,0.6)",
                                        border: "1px solid rgba(245,158,11,0.3)",
                                        color: "#78350f",
                                    }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!message.trim() || sending}
                                    className="h-9 px-3.5 rounded-xl text-[10px] font-black text-white flex items-center gap-1.5 transition hover:scale-[1.02] active:scale-95 disabled:opacity-40 flex-shrink-0"
                                    style={{
                                        background: "linear-gradient(135deg, #92400e, #78350f)",
                                        boxShadow: "0 2px 8px rgba(120,53,15,0.3)",
                                    }}
                                >
                                    {sending ? (
                                        <div className="w-3 h-3 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                                    ) : (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                    )}
                                    Kirim
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style>{`
        @keyframes bdaySlideDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
        </div>
    );
}