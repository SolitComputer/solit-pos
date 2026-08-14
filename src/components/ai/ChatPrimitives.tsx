"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, Check, Copy } from "lucide-react";

export function ThinkingIndicator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2.5 bg-gray-100/80 border border-gray-200/80 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 w-fit shadow-xs">
            <div className="w-5 h-5 rounded-lg bg-[#1a1a2e]/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-[#1a1a2e] animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
                <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e]" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e]" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e]" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "300ms" }} />
                </span>
                <span key={label} className="text-[11px] sm:text-xs font-medium text-gray-700">{label}</span>
            </div>
        </div>
    );
}

export function MarkdownMessage({ content }: { content: string | null | undefined }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(content || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group/msg space-y-2">
            <div className="text-xs sm:text-[15px] leading-relaxed text-gray-800 font-normal
                [&_p]:mb-3 [&_p:last-child]:mb-0
                [&_strong]:font-semibold [&_strong]:text-gray-900
                [&_em]:italic
                [&_a]:text-[#1a1a2e] [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-gray-300 [&_a]:font-medium [&_a:hover]:decoration-[#1a1a2e]
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_ul]:space-y-1.5
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3 [&_ol]:space-y-1.5
                [&_li]:leading-relaxed [&_li_ul]:mt-1.5 [&_li_ol]:mt-1.5
                [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-5 [&_h1]:mb-2
                [&_h2]:text-[13px] sm:[&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-4 [&_h2]:mb-1.5
                [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-gray-900 [&_h3]:mt-3 [&_h3]:mb-1
                [&_hr]:my-4 [&_hr]:border-gray-200
                [&_code]:bg-gray-100 [&_code]:text-[#1a1a2e] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-[12px] [&_code]:font-mono
                [&_pre]:bg-[#1a1a2e] [&_pre]:text-gray-100 [&_pre]:rounded-xl [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_pre]:shadow-xs
                [&_pre_code]:bg-transparent [&_pre_code]:text-inherit [&_pre_code]:p-0
                [&_blockquote]:border-l-2 [&_blockquote]:border-[#1a1a2e]/40 [&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:my-3 [&_blockquote]:italic [&_blockquote]:text-gray-600
            ">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        table: ({ children }) => (
                            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-xs my-2 -mx-1 px-1">
                                <table className="w-full text-[11px] sm:text-xs border-collapse min-w-max">{children}</table>
                            </div>
                        ),
                        thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
                        th: ({ children }) => <th className="text-gray-800 text-left border-b border-gray-200 px-2.5 py-1.5 font-semibold whitespace-nowrap">{children}</th>,
                        td: ({ children }) => <td className="border-b border-gray-100 px-2.5 py-1.5 text-gray-700 whitespace-nowrap">{children}</td>,
                        tr: ({ children }) => <tr className="even:bg-gray-50/60 hover:bg-gray-100/70 transition-colors">{children}</tr>,
                    }}
                >
                    {content || ""}
                </ReactMarkdown>
            </div>
            <div className="flex items-center gap-2 pt-1 opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity duration-200">
                <button onClick={handleCopy} className="flex items-center gap-1 text-[11px] sm:text-xs text-gray-400 hover:text-gray-700 transition px-2 py-0.5 rounded-md hover:bg-gray-100">
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? "Tersalin" : "Salin"}</span>
                </button>
            </div>
        </div>
    );
}

export const CHAT_DOT_KEYFRAMES = `@keyframes aiCeoDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.3; } 30% { transform: translateY(-4px); opacity: 1; } }`;