"use client";

import { useRef, useState } from "react";
import { Bold, Italic, Heading2, List, ListOrdered, Table, Link2, Eye, Pencil } from "lucide-react";
import { inp } from "@/components/kendaraan/ui";
import SopMarkdown from "@/components/kendaraan/SopMarkdown";

const TABLE_TEMPLATE = `| Kolom 1 | Kolom 2 |\n| --- | --- |\n| Isi | Isi |\n| Isi | Isi |`;

// Editor markdown sederhana: toolbar buat nyisipin format + tab preview.
// Admin nggak perlu hafal sintaks — tinggal blok teks lalu klik tombolnya.
export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  const focusSel = (from: number, to: number) => {
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(from, to);
    });
  };

  const wrap = (before: string, after: string, placeholderText: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const sel = value.slice(s, e) || placeholderText;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    focusSel(s + before.length, s + before.length + sel.length);
  };

  const linePrefix = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(lineStart, e) || "teks";
    const prefixed = block.split("\n").map((l) => prefix + l).join("\n");
    onChange(value.slice(0, lineStart) + prefixed + value.slice(e));
    focusSel(lineStart, lineStart + prefixed.length);
  };

  const insertBlock = (text: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const pad = s > 0 && value[s - 1] !== "\n" ? "\n\n" : "";
    onChange(value.slice(0, s) + pad + text + value.slice(s));
    const pos = s + pad.length + text.length;
    focusSel(pos, pos);
  };

  const tools = [
    { icon: <Bold size={14} />, title: "Tebal", run: () => wrap("**", "**", "teks tebal") },
    { icon: <Italic size={14} />, title: "Miring", run: () => wrap("*", "*", "teks miring") },
    { icon: <Heading2 size={14} />, title: "Judul", run: () => linePrefix("## ") },
    { icon: <List size={14} />, title: "Daftar", run: () => linePrefix("- ") },
    { icon: <ListOrdered size={14} />, title: "Daftar bernomor", run: () => linePrefix("1. ") },
    { icon: <Table size={14} />, title: "Tabel", run: () => insertBlock(TABLE_TEMPLATE) },
    { icon: <Link2 size={14} />, title: "Tautan", run: () => wrap("[", "](https://)", "teks") },
  ];

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/70">
        <div className={`flex items-center gap-0.5 ${tab === "preview" ? "opacity-40 pointer-events-none" : ""}`}>
          {tools.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={t.run}
              title={t.title}
              className="w-8 h-8 rounded-lg text-gray-500 hover:bg-white hover:text-violet-600 hover:shadow-sm flex items-center justify-center transition active:scale-95"
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          <TabBtn active={tab === "write"} onClick={() => setTab("write")} icon={<Pencil size={12} />} label="Tulis" />
          <TabBtn active={tab === "preview"} onClick={() => setTab("preview")} icon={<Eye size={12} />} label="Preview" />
        </div>
      </div>

      {/* Body */}
      {tab === "write" ? (
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          placeholder={placeholder}
          className={`${inp} h-auto rounded-none border-0 focus:ring-0 py-3 leading-relaxed resize-y font-mono text-[12px]`}
        />
      ) : (
        <div className="px-3.5 py-3 min-h-[200px] max-h-[46vh] overflow-y-auto">
          {value.trim() ? (
            <SopMarkdown content={value} />
          ) : (
            <p className="text-xs text-gray-300 italic">Belum ada isi untuk ditampilkan…</p>
          )}
        </div>
      )}
    </div>
  );
}

const TAB_ACTIVE = "bg-violet-600 text-white shadow-sm";
const TAB_IDLE = "text-gray-500 hover:text-gray-700";

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold transition ${active ? TAB_ACTIVE : TAB_IDLE}`}
    >
      {icon}
      {label}
    </button>
  );
}
