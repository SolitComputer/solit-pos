"use client";

import { useEffect, useState } from "react";

// Kalender mini pilih rentang tanggal (klik tanggal awal → klik tanggal akhir).
// DIPINDAH apa adanya dari src/app/dashboard/cashflow/page.tsx supaya bisa dipakai
// bareng oleh Cashflow & Laporan Marketing. Tampilan & cara kerjanya SAMA PERSIS.
//
// Kontrak nilai (format YYYY-MM-DD, zona Asia/Jakarta):
//   from=""  , to=""   → "Semua" (tanpa filter tanggal)
//   from="X" , to=""   → baru pilih tanggal awal (mulai X dan seterusnya)
//   from="X" , to="Y"  → rentang X s/d Y (inklusif)
//
// Kenapa harus file terpisah: page.tsx di App Router TIDAK boleh punya named
// export selain yang diizinkan Next.js (default, metadata, dynamic, dll) —
// jadi komponen ini tidak bisa di-import langsung dari cashflow/page.tsx.

const IconChevronLeft = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
    </svg>
);
const IconChevronRight = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 6 15 12 9 18" />
    </svg>
);

export default function InlineDateRange({ from, to, onChange }: { from: string, to: string, onChange: (from: string, to: string) => void }) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const viewDate = from ? new Date(from) : new Date();
    const [currMonth, setCurrMonth] = useState(viewDate.getMonth());
    const [currYear, setCurrYear] = useState(viewDate.getFullYear());

    useEffect(() => {
        if (from) {
            const d = new Date(from);
            setCurrMonth(d.getMonth());
            setCurrYear(d.getFullYear());
        }
    }, [from]);

    const prevMonth = () => setCurrMonth(m => m === 0 ? (setCurrYear(y => y - 1), 11) : m - 1);
    const nextMonth = () => setCurrMonth(m => m === 11 ? (setCurrYear(y => y + 1), 0) : m + 1);

    const daysInMonth = new Date(currYear, currMonth + 1, 0).getDate();
    const firstDay = new Date(currYear, currMonth, 1).getDay();
    const blanks = Array.from({ length: firstDay });
    const days = Array.from({ length: daysInMonth }).map((_, i) => i + 1);
    const monthName = new Date(currYear, currMonth).toLocaleDateString("id-ID", { month: "long" });

    const handleDayClick = (d: number) => {
        const dateStr = `${currYear}-${String(currMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (!from || (from && to)) { onChange(dateStr, ""); }
        else {
            if (dateStr < from) onChange(dateStr, from);
            else onChange(from, dateStr);
        }
    };
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm inline-block w-full max-w-[170px]">
            <div className="flex items-center justify-between mb-1.5">
                <button onClick={prevMonth} className="p-0.5 hover:bg-violet-50 rounded-md text-gray-600 hover:text-violet-700 transition"><IconChevronLeft /></button>
                <div className="font-bold text-[10px] text-gray-800">
                    {monthName} {currYear}
                </div>
                <button onClick={nextMonth} className="p-0.5 hover:bg-violet-50 rounded-md text-gray-600 hover:text-violet-700 transition"><IconChevronRight /></button>
            </div>
            <div className="grid grid-cols-7 gap-0 text-center text-[8px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0 text-center">
                {blanks.map((_, i) => <div key={`blank-${i}`} />)}
                {days.map(d => {
                    const dateStr = `${currYear}-${String(currMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === from || dateStr === to;
                    const inRange = from && to && dateStr > from && dateStr < to;

                    let cls = "h-5 w-5 mx-auto rounded flex items-center justify-center cursor-pointer transition text-[9px] font-semibold ";
                    if (isSelected) cls += "bg-gradient-to-br from-[#1a1545] to-[#0f0c29] text-white shadow-sm ring-1 ring-[#1a1545]";
                    else if (inRange) cls += "bg-violet-50 text-violet-900";
                    else if (isToday) cls += "bg-gray-50 text-gray-900 font-bold border border-gray-200 hover:bg-gray-100";
                    else cls += "text-gray-600 hover:bg-gray-50 hover:text-gray-900";

                    return (
                        <div key={d} onClick={() => handleDayClick(d)} className={cls}>
                            {d}
                        </div>
                    );
                })}
            </div>
            <div className="mt-2 flex justify-between items-center border-t border-gray-100 pt-2">
                <button onClick={() => onChange(todayStr, todayStr)} className="text-[9px] font-semibold text-gray-500 hover:text-violet-700 transition">Hari Ini</button>
                <button onClick={() => onChange("", "")} className="text-[9px] font-semibold text-gray-500 hover:text-violet-700 transition">Semua</button>
            </div>
        </div>
    );
}