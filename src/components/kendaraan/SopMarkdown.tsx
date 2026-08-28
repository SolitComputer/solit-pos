"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renderer markdown untuk SOP (bold, italic, heading, list, tabel, dll).
// Styling mengikuti pola MarkdownMessage yang sudah ada di app.
export default function SopMarkdown({ content }: { content: string }) {
  return (
    <div
      className="text-[13px] leading-relaxed text-gray-700
        [&_p]:mb-2.5 [&_p:last-child]:mb-0
        [&_strong]:font-bold [&_strong]:text-gray-900
        [&_em]:italic
        [&_a]:text-violet-600 [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-violet-300 [&_a:hover]:decoration-violet-600
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2.5 [&_ul]:space-y-1
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2.5 [&_ol]:space-y-1
        [&_li]:leading-relaxed [&_li_ul]:mt-1 [&_li_ol]:mt-1
        [&_h1]:text-base [&_h1]:font-black [&_h1]:text-gray-900 [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-sm [&_h2]:font-black [&_h2]:text-gray-900 [&_h2]:mt-3.5 [&_h2]:mb-1.5
        [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-gray-900 [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:uppercase [&_h3]:tracking-wide
        [&_hr]:my-4 [&_hr]:border-gray-200
        [&_code]:bg-gray-100 [&_code]:text-violet-700 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-[12px] [&_code]:font-mono
        [&_blockquote]:border-l-2 [&_blockquote]:border-violet-300 [&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:my-2.5 [&_blockquote]:text-gray-600"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-gray-200 my-3">
              <table className="w-full text-[12px] border-collapse min-w-max">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => (
            <th className="text-gray-800 text-left border-b border-gray-200 px-3 py-2 font-bold whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-gray-100 px-3 py-2 text-gray-700 align-top">{children}</td>
          ),
          tr: ({ children }) => <tr className="even:bg-gray-50/50">{children}</tr>,
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}
