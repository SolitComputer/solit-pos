// src/app/dashboard/attendance/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { getCurrentUserClient } from "@/lib/auth-client";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type Attendance = {
  id: string; user_name: string; user_role: string; date: string;
  check_in_time: string; status: string; method: string;
  latitude: number | null; longitude: number | null; accuracy: number | null;
  device: string; ip_address: string; face_distance: number | null; created_at: string;
  displayStatus?: "PRESENT" | "LATE"; user_shift?: "PAGI" | "SORE";
};
type DayOff  = { id: string; user_id: string; day_of_week: number; notes?: string; users?: { id: string; name: string; role: string }; };
type DateOff = { id: string; user_id: string; off_date: string;   notes?: string; users?: { id: string; name: string; role: string }; };
type UserInfo = { id: string; name: string; role: string };

// ─── Constants ────────────────────────────────────────────────────────────────
const OFFICE_LAT = -6.402593;
const OFFICE_LNG = 106.787233;
const MONTH_NAMES = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DAY_NAMES   = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const DAY_FULL    = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R=6371000,dLat=((lat2-lat1)*Math.PI)/180,dLng=((lng2-lng1)*Math.PI)/180;
  const a=Math.sin(dLat/2)**2+Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function toWIBTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
}
function isLate(t: string, shift: "PAGI"|"SORE"="PAGI"): boolean {
  const wib=new Date(new Date(t).getTime()+7*60*60*1000);
  return wib.getUTCHours()*60+wib.getUTCMinutes()>(shift==="PAGI"?8*60:16*60);
}
function getDisplayStatus(a: Attendance): "PRESENT"|"LATE" {
  if(a.method==="FORCE") return "PRESENT";
  if(isLate(a.check_in_time||a.created_at,a.user_shift??"PAGI")) return "LATE";
  return "PRESENT";
}
function toWIBDateKey(iso: string): string {
  return new Date(new Date(iso).getTime()+7*60*60*1000).toISOString().slice(0,10);
}
function countWorkingDays(year: number, month: number, dayOffDows: Set<number>, offDates: Set<string>): number {
  const dim=new Date(year,month+1,0).getDate(); let c=0;
  for(let d=1;d<=dim;d++){
    const dk=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dow=new Date(dk+"T12:00:00").getDay();
    if(!dayOffDows.has(dow)&&!offDates.has(dk)) c++;
  }
  return c;
}

// ─── DayOffModal ──────────────────────────────────────────────────────────────
function DayOffModal({users,dayOffs,onClose,onSaved}:{users:UserInfo[];dayOffs:DayOff[];onClose:()=>void;onSaved:()=>void}) {
  const [saving,setSaving]=useState(false);
  const [filter,setFilter]=useState("");
  const [error,setError]=useState("");
  const origMap=useMemo(()=>{const m:Record<string,Set<number>>={};dayOffs.forEach(d=>{if(!m[d.user_id])m[d.user_id]=new Set();m[d.user_id].add(d.day_of_week);});return m;},[dayOffs]);
  const [local,setLocal]=useState<Record<string,Set<number>>>(()=>{const m:Record<string,Set<number>>={};dayOffs.forEach(d=>{if(!m[d.user_id])m[d.user_id]=new Set();m[d.user_id].add(d.day_of_week);});return m;});
  const toggle=(uid:string,dow:number)=>setLocal(prev=>{const n={...prev};if(!n[uid])n[uid]=new Set();const s=new Set(n[uid]);s.has(dow)?s.delete(dow):s.add(dow);n[uid]=s;return n;});
  const save=async()=>{setSaving(true);setError("");try{const ops:Promise<any>[]=[];users.forEach(u=>{const orig=origMap[u.id]||new Set<number>(),cur=local[u.id]||new Set<number>();cur.forEach(d=>{if(!orig.has(d))ops.push(fetch("/api/attendance/day-off",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:u.id,day_of_week:d})}));});orig.forEach(d=>{if(!cur.has(d))ops.push(fetch(`/api/attendance/day-off?user_id=${u.id}&day_of_week=${d}`,{method:"DELETE"}));});});await Promise.all(ops);onSaved();onClose();}catch{setError("Gagal menyimpan.");}finally{setSaving(false);}};
  const shown=filter?users.filter(u=>u.id===filter):users;
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="bg-[#1a1a2e] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div><p className="font-bold text-white text-sm">Libur Mingguan Berulang</p><p className="text-xs text-slate-400 mt-0.5">Pilih hari libur tetap per karyawan</p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <select value={filter} onChange={e=>setFilter(e.target.value)} className="w-full sm:w-64 h-9 border border-gray-200 rounded-xl px-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20">
            <option value="">Semua Karyawan</option>
            {users.map(u=><option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g," ")}</option>)}
          </select>
        </div>
        <div className="overflow-y-auto flex-1 px-5 pb-4">
          <div className="space-y-2 mt-2">
            {shown.map(u=>(
              <div key={u.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{u.name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()}</div>
                  <div><p className="text-xs font-semibold text-gray-800">{u.name}</p><p className="text-[10px] text-gray-400">{u.role.replace(/_/g," ")}</p></div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {DAY_NAMES.map((day,dow)=>{const off=local[u.id]?.has(dow)??false;return(<button key={dow} type="button" onClick={()=>toggle(u.id,dow)} title={DAY_FULL[dow]} className={`h-8 rounded-lg text-[10px] font-semibold transition-all border ${off?"bg-red-100 text-red-700 border-red-200 ring-1 ring-red-300":"bg-white text-gray-400 border-gray-200 hover:bg-gray-100"}`}>{day}</button>);})}
                </div>
                {local[u.id]&&local[u.id].size>0&&<p className="text-[10px] text-red-600 mt-1.5">🔴 Libur: {Array.from(local[u.id]).sort().map(d=>DAY_FULL[d]).join(", ")}</p>}
              </div>
            ))}
          </div>
        </div>
        {error&&<div className="px-5 py-2 bg-red-50 border-t border-red-100"><p className="text-xs text-red-600">{error}</p></div>}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 bg-[#1a1a2e] text-white rounded-xl text-sm font-semibold hover:bg-[#16213e] transition disabled:opacity-50 flex items-center justify-center gap-2">{saving?<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</>:"💾 Simpan"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── DateOffModal ─────────────────────────────────────────────────────────────
function DateOffModal({users,calYear,calMonth,dateOffs,onClose,onSaved}:{users:UserInfo[];calYear:number;calMonth:number;dateOffs:DateOff[];onClose:()=>void;onSaved:()=>void}) {
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [uid,setUid]=useState<string>(users[0]?.id??"");
  const origSet=useMemo(()=>{const s=new Set<string>();dateOffs.forEach(d=>{if(d.user_id===uid)s.add(d.off_date);});return s;},[dateOffs,uid]);
  const [local,setLocal]=useState<Set<string>>(()=>{const s=new Set<string>();dateOffs.forEach(d=>{if(d.user_id===(users[0]?.id??""))s.add(d.off_date);});return s;});
  useEffect(()=>{const s=new Set<string>();dateOffs.forEach(d=>{if(d.user_id===uid)s.add(d.off_date);});setLocal(s);},[uid,dateOffs]);
  const dim=new Date(calYear,calMonth+1,0).getDate(),firstDow=new Date(calYear,calMonth,1).getDay();
  const cells:(number|null)[]=[]; for(let i=0;i<firstDow;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(d);
  const save=async()=>{if(!uid) return;setSaving(true);setError("");try{const ops:Promise<any>[]=[];local.forEach(d=>{if(!origSet.has(d))ops.push(fetch("/api/attendance/date-off",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id:uid,off_date:d})}));});origSet.forEach(d=>{if(!local.has(d))ops.push(fetch(`/api/attendance/date-off?user_id=${uid}&off_date=${d}`,{method:"DELETE"}));});await Promise.all(ops);onSaved();onClose();}catch{setError("Gagal menyimpan.");}finally{setSaving(false);}};
  const sel=users.find(u=>u.id===uid);
  const today=new Date().toISOString().slice(0,10);
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        <div className="bg-orange-500 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div><p className="font-bold text-white text-sm">Libur Tanggal Spesifik</p><p className="text-xs text-orange-100 mt-0.5">{MONTH_NAMES[calMonth]} {calYear}</p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/20 transition"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        </div>
        <div className="px-5 pt-4 pb-3 flex-shrink-0 border-b border-gray-100">
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Pilih Karyawan</label>
          <select value={uid} onChange={e=>setUid(e.target.value)} className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30">
            {users.map(u=><option key={u.id} value={u.id}>{u.name} — {u.role.replace(/_/g," ")}</option>)}
          </select>
          {local.size>0&&<p className="text-[10px] text-orange-600 mt-1.5">🟠 {local.size} tanggal dipilih untuk {sel?.name}</p>}
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div className="grid grid-cols-7 mb-1.5">{DAY_NAMES.map((d,i)=><div key={d} className={`text-center text-[10px] font-semibold uppercase py-1 ${i===0?"text-red-400":"text-gray-400"}`}>{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day,idx)=>{
              if(day===null) return <div key={`e-${idx}`}/>;
              const k=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const off=local.has(k),isT=k===today,dow=new Date(calYear,calMonth,day).getDay();
              return(<button key={day} onClick={()=>setLocal(prev=>{const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);return n;})} className={`relative flex flex-col items-center justify-center h-11 rounded-xl text-xs font-bold transition-all border ${off?"bg-orange-500 text-white border-orange-500 shadow-sm":isT?"bg-blue-50 text-blue-600 border-blue-200":dow===0||dow===6?"text-gray-300 border-transparent hover:bg-gray-50":"text-gray-700 border-transparent hover:bg-orange-50 hover:text-orange-600"}`}>{day}{off&&<span className="absolute bottom-1 w-1 h-1 rounded-full bg-white/70"/>}</button>);
            })}
          </div>
          {local.size>0&&(<div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5"><p className="text-[10px] font-semibold text-orange-700 mb-1.5">Tanggal libur {sel?.name}:</p><div className="flex flex-wrap gap-1">{Array.from(local).sort().map(date=>(<span key={date} className="inline-flex items-center gap-1 text-[10px] font-mono bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">{new Date(date+"T12:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short"})}<button type="button" onClick={()=>setLocal(p=>{const n=new Set(p);n.delete(date);return n;})} className="text-orange-400 hover:text-red-600 font-bold ml-0.5">×</button></span>))}</div></div>)}
        </div>
        {error&&<div className="px-5 py-2 bg-red-50 border-t border-red-100"><p className="text-xs text-red-600">{error}</p></div>}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
          <button onClick={onClose} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Batal</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50 flex items-center justify-center gap-2">{saving?<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Menyimpan...</>:"💾 Simpan Libur"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MonthSelector ────────────────────────────────────────────────────────────
function MonthSelector({onSelect}:{onSelect:(year:number,month:number)=>void}) {
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const years=Array.from({length:4},(_,i)=>today.getFullYear()-1+i);
  return(
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fadeIn">
      <div className="mb-8"><h1 className="text-2xl font-bold text-gray-900 tracking-tight">Absensi Karyawan</h1><p className="text-sm text-gray-400 mt-1">Pilih bulan untuk melihat laporan absensi</p></div>
      <div className="flex items-center gap-2 mb-6">
        <button onClick={()=>setYear(y=>y-1)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg></button>
        <div className="flex gap-1.5 flex-wrap">{years.map(y=>(<button key={y} onClick={()=>setYear(y)} className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition border ${year===y?"bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-sm":"bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>{y}</button>))}</div>
        <button onClick={()=>setYear(y=>y+1)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition shadow-sm"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {MONTH_NAMES.map((name,idx)=>{
          const isCurrent=year===today.getFullYear()&&idx===today.getMonth();
          const isFuture=year>today.getFullYear()||(year===today.getFullYear()&&idx>today.getMonth());
          const isPast=year<today.getFullYear()||(year===today.getFullYear()&&idx<today.getMonth());
          return(<button key={idx} onClick={()=>!isFuture&&onSelect(year,idx)} disabled={isFuture} className={`relative group flex flex-col items-center justify-center gap-1 py-5 rounded-2xl border transition-all duration-200 ${isCurrent?"bg-[#1a1a2e] border-[#1a1a2e] text-white shadow-lg shadow-[#1a1a2e]/20 scale-[1.02]":isFuture?"bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed":"bg-white border-gray-200 text-gray-700 hover:border-[#1a1a2e] hover:bg-[#1a1a2e]/5 hover:text-[#1a1a2e] hover:scale-[1.02] hover:shadow-md cursor-pointer shadow-sm"}`}>
            {isCurrent&&<span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400"/>}
            <span className="text-2xl font-black tracking-tight">{String(idx+1).padStart(2,"0")}</span>
            <span className={`text-[11px] font-medium ${isCurrent?"text-white/70":isFuture?"text-gray-300":"text-gray-400 group-hover:text-[#1a1a2e]/60"}`}>{MONTH_SHORT[idx]}</span>
            {isCurrent&&<span className="text-[9px] text-emerald-300 font-semibold tracking-wider uppercase">Bulan ini</span>}
            {isPast&&!isCurrent&&<span className="text-[9px] text-gray-300 font-medium">{year}</span>}
          </button>);
        })}
      </div>
      <p className="text-center text-[11px] text-gray-300 mt-6">Bulan yang akan datang belum tersedia</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AttendanceDashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState<{year:number;month:number}|null>(null);
  const [attendances,  setAttendances]  = useState<Attendance[]>([]);
  const [dayOffs,      setDayOffs]      = useState<DayOff[]>([]);
  const [dateOffs,     setDateOffs]     = useState<DateOff[]>([]);
  const [allDateOffs,  setAllDateOffs]  = useState<DateOff[]>([]);
  const [allUsers,     setAllUsers]     = useState<UserInfo[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [currentUser,  setCurrentUser]  = useState<any>(null);
  const [filterUser,   setFilterUser]   = useState("Semua");
  const [selectedDate, setSelectedDate] = useState<string|null>(null);
  const [showDayOffModal,  setShowDayOffModal]  = useState(false);
  const [showDateOffModal, setShowDateOffModal] = useState(false);

  const calYear  = selectedMonth?.year  ?? new Date().getFullYear();
  const calMonth = selectedMonth?.month ?? new Date().getMonth();

  useEffect(()=>{ getCurrentUserClient().then(u=>setCurrentUser(u)); },[]);

  useEffect(()=>{
    if(!selectedMonth) return;
    const {year,month}=selectedMonth;
    setLoading(true); setSelectedDate(null); setFilterUser("Semua");
    const tasks=[fetchAttendance(),fetchDayOffs(),fetchDateOffs(year,month),fetchAllDateOffs()];
    if(currentUser?.role==="ADMIN") tasks.push(fetchAllUsers());
    Promise.all(tasks).finally(()=>setLoading(false));
  },[selectedMonth]); // eslint-disable-line

  const fetchAttendance=async()=>{ try{const r=await fetch("/api/attendance");const d=await r.json();if(d.success) setAttendances((d.data||[]).map((a:Attendance)=>({...a,displayStatus:getDisplayStatus(a)})));}catch{} };
  const fetchDayOffs=async()=>{ try{const r=await fetch("/api/attendance/day-off");const d=await r.json();if(d.success) setDayOffs(d.data||[]);}catch{} };
  const fetchDateOffs=async(year:number,month:number)=>{ try{const r=await fetch(`/api/attendance/date-off?year=${year}&month=${month+1}`);const d=await r.json();if(d.success) setDateOffs(d.data||[]);}catch{} };
  const fetchAllDateOffs=async()=>{ try{const r=await fetch("/api/attendance/date-off");const d=await r.json();if(d.success) setAllDateOffs(d.data||[]);}catch{} };
  const fetchAllUsers=async()=>{ try{const r=await fetch("/api/attendance/users");const d=await r.json();if(d.success) setAllUsers(d.data||[]);}catch{} };

  const dayOffByName=useMemo(()=>{ const m:Record<string,Set<number>>={};dayOffs.forEach(d=>{const n=d.users?.name;if(!n) return;if(!m[n])m[n]=new Set();m[n].add(d.day_of_week);});return m;},[dayOffs]);
  const dateOffByName=useMemo(()=>{ const m:Record<string,Set<string>>={};allDateOffs.forEach(d=>{const n=d.users?.name;if(!n) return;if(!m[n])m[n]=new Set();m[n].add(d.off_date);});return m;},[allDateOffs]);

  const isDayOffForUser=(userName:string,dk:string)=>{
    const dow=new Date(dk+"T12:00:00").getDay();
    return (dayOffByName[userName]?.has(dow)??false)||(dateOffByName[userName]?.has(dk)??false);
  };
  const getOffUsersForDate=(dk:string)=>{
    const dow=new Date(dk+"T12:00:00").getDay();
    const weekly=Object.entries(dayOffByName).filter(([,s])=>s.has(dow)).map(([n])=>n);
    const specific=Object.entries(dateOffByName).filter(([,s])=>s.has(dk)).map(([n])=>n);
    return [...new Set([...weekly,...specific])];
  };

  const thisMonthKey=`${calYear}-${String(calMonth+1).padStart(2,"0")}`;
  const thisMonthAtt=attendances.filter(a=>toWIBDateKey(a.check_in_time||a.created_at).startsWith(thisMonthKey));

  const byDate=useMemo(()=>{
    const m:Record<string,Attendance[]>={};
    const filtered=filterUser==="Semua"?attendances:attendances.filter(a=>a.user_name===filterUser);
    filtered.forEach(a=>{const k=toWIBDateKey(a.check_in_time||a.created_at);if(!m[k])m[k]=[];m[k].push(a);});
    return m;
  },[attendances,filterUser]);

  const calDays=useMemo(()=>{
    const fd=new Date(calYear,calMonth,1).getDay(),dim=new Date(calYear,calMonth+1,0).getDate();
    const c:(number|null)[]=[]; for(let i=0;i<fd;i++) c.push(null); for(let d=1;d<=dim;d++) c.push(d); return c;
  },[calYear,calMonth]);

  const todayKey=toWIBDateKey(new Date().toISOString());

  // ── Ringkasan per user bulan ini ──────────────────────────────────────────
  const uniqueUsers=useMemo(()=>{
    if(allUsers.length>0) return allUsers.map(u=>u.name).sort();
    return [...new Set(attendances.map(a=>a.user_name))].sort();
  },[allUsers,attendances]);

  const userSummary=useMemo(()=>{
    const m:Record<string,{name:string;present:number;late:number;score:number;workdays:number;pct:number}> = {};
    thisMonthAtt.forEach(a=>{
      if(!m[a.user_name]) m[a.user_name]={name:a.user_name,present:0,late:0,score:0,workdays:0,pct:0};
      if(a.displayStatus==="PRESENT"){m[a.user_name].present++;m[a.user_name].score+=1.0;}
      else{m[a.user_name].late++;m[a.user_name].score+=0.5;}
    });
    Object.values(m).forEach(u=>{
      const dows=dayOffByName[u.name]??new Set();
      const offDts=dateOffByName[u.name]??new Set();
      const workdays=countWorkingDays(calYear,calMonth,dows,offDts);
      u.workdays=workdays; u.pct=workdays>0?Math.round((u.score/workdays)*100):0;
    });
    return Object.values(m).sort((a,b)=>b.pct-a.pct);
  },[thisMonthAtt,dayOffByName,dateOffByName,calYear,calMonth]);

  const thisMonthPresent=thisMonthAtt.filter(a=>a.displayStatus==="PRESENT").length;
  const thisMonthLate=thisMonthAtt.filter(a=>a.displayStatus==="LATE").length;
  const thisMonthDays=new Set(thisMonthAtt.map(a=>toWIBDateKey(a.check_in_time||a.created_at))).size;

  // ── Pilih bulan ───────────────────────────────────────────────────────────
  if(!selectedMonth) {
    return(
      <DashboardLayout>
        <MonthSelector onSelect={(y,m)=>setSelectedMonth({year:y,month:m})}/>
        <style jsx global>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.animate-fadeIn{animation:fadeIn 0.35s ease-out;}`}</style>
      </DashboardLayout>
    );
  }

  // ── Detail tanggal yang dipilih ───────────────────────────────────────────
  const selectedAttendances = selectedDate
    ? (byDate[selectedDate]||[]).sort((a,b)=>new Date(a.check_in_time).getTime()-new Date(b.check_in_time).getTime())
    : [];

  return(
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5 animate-fadeIn">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={()=>setSelectedMonth(null)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                {currentUser?.role==="ADMIN"?"Laporan Absensi":"Absensi Saya"}
                <span className="text-sm font-normal text-gray-400 mx-2">—</span>
                <span className="text-base font-semibold text-[#1a1a2e]">{MONTH_NAMES[calMonth]} {calYear}</span>
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{thisMonthDays} hari hadir · {thisMonthPresent} tepat waktu · {thisMonthLate} terlambat</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {currentUser?.role==="ADMIN"&&(<>
              <button onClick={()=>setShowDayOffModal(true)} className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl hover:bg-red-100 transition">📅 Libur Mingguan</button>
              <button onClick={()=>setShowDateOffModal(true)} className="flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 px-3 py-2 rounded-xl hover:bg-orange-100 transition">⚠️ Libur Spesifik</button>
            </>)}
            <button onClick={()=>{setLoading(true);Promise.all([fetchAttendance(),fetchDayOffs(),fetchDateOffs(calYear,calMonth),fetchAllDateOffs()]).finally(()=>setLoading(false));}} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl bg-white transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Refresh
            </button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {label:"Hari Hadir",  value:thisMonthDays,     icon:"📅",color:"text-gray-800",   border:"border-gray-100"},
            {label:"Tepat Waktu", value:thisMonthPresent,  icon:"✅",color:"text-emerald-700",border:"border-emerald-100"},
            {label:"Terlambat",   value:thisMonthLate,     icon:"⏰",color:"text-amber-700",  border:"border-amber-100"},
            {label:"Karyawan",    value:uniqueUsers.length,icon:"👥",color:"text-gray-800",   border:"border-gray-100"},
          ].map(c=>(
            <div key={c.label} className={`bg-white rounded-2xl border ${c.border} shadow-sm p-4`}>
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{c.label}</p>
                <span className="text-base opacity-60">{c.icon}</span>
              </div>
              <p className={`text-2xl font-bold mt-1.5 ${c.color}`}>
                {loading?<span className="inline-block w-10 h-7 bg-gray-100 rounded animate-pulse"/>:c.value}
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5">{MONTH_SHORT[calMonth]} {calYear}</p>
            </div>
          ))}
        </div>

        {/* ── Filter user (admin) ── */}
        {currentUser?.role==="ADMIN"&&(
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2.5">Filter Karyawan</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={()=>setFilterUser("Semua")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterUser==="Semua"?"bg-[#1a1a2e] text-white":"bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Semua</button>
              {uniqueUsers.map(n=>(
                <button key={n} onClick={()=>setFilterUser(n)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filterUser===n?"bg-[#1a1a2e] text-white":"bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── KALENDER FULL WIDTH ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-gray-800">{MONTH_NAMES[calMonth]} {calYear}</span>
              {calYear===new Date().getFullYear()&&calMonth===new Date().getMonth()&&(
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Bulan ini</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Legenda */}
              <div className="hidden sm:flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"/>Tepat</div>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"/>Terlambat</div>
                <div className="flex items-center gap-1.5 text-[11px] text-red-400"><span className="w-3 h-3 rounded-full bg-red-300 inline-block"/>Libur</div>
              </div>
              <button onClick={()=>setSelectedMonth(null)} className="text-[11px] text-gray-400 hover:text-[#1a1a2e] transition flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                Ganti bulan
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {/* Header hari */}
            <div className="grid grid-cols-7 mb-3">
              {DAY_NAMES.map(d=>(
                <div key={d} className="text-center text-[11px] font-bold uppercase py-1.5 text-gray-400 tracking-wider">{d}</div>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-2">
                {Array(35).fill(0).map((_,i)=><div key={i} className="h-20 rounded-xl bg-gray-50 animate-pulse"/>)}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {calDays.map((day,idx)=>{
                  if(day===null) return <div key={`e-${idx}`}/>;
                  const dk=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dd=byDate[dk]||[];
                  const pc=dd.filter(a=>a.displayStatus==="PRESENT").length;
                  const lc=dd.filter(a=>a.displayStatus==="LATE").length;
                  const tot=dd.length;
                  const isTod=dk===todayKey, isSel=dk===selectedDate;
                  let isUserDayOff=false, hasAnyDayOff=false;
                  if(filterUser!=="Semua") isUserDayOff=isDayOffForUser(filterUser,dk);
                  else hasAnyDayOff=getOffUsersForDate(dk).length>0;

                  return(
                    <button key={day} onClick={()=>setSelectedDate(p=>p===dk?null:dk)}
                      title={isUserDayOff?`Libur ${filterUser}`:undefined}
                      className={`relative flex flex-col items-start justify-start p-2 rounded-xl min-h-[72px] transition-all ${
                        isSel     ? "bg-[#1a1a2e] shadow-lg ring-2 ring-[#1a1a2e]/30"
                        : isTod   ? "bg-blue-50 ring-1 ring-blue-200"
                        : isUserDayOff&&!tot ? "bg-red-50/80"
                        : tot     ? "bg-gray-50 hover:bg-gray-100"
                                  : "hover:bg-gray-50"
                      }`}>

                      {/* Dot libur */}
                      {isUserDayOff&&filterUser!=="Semua"&&<span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${isSel?"bg-red-300":"bg-red-400"}`}/>}
                      {filterUser==="Semua"&&hasAnyDayOff&&!isSel&&<span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-red-300"/>}

                      {/* Angka hari */}
                      <span className={`text-sm font-bold leading-none mb-1.5 ${
                        isSel?"text-white":isTod?"text-blue-600":isUserDayOff?"text-red-500":"text-gray-800"
                      }`}>{day}</span>

                      {/* Dot kehadiran */}
                      {tot>0&&(
                        <div className="flex flex-col gap-0.5 w-full">
                          {pc>0&&<div className={`w-full h-1 rounded-full ${isSel?"bg-emerald-300":"bg-emerald-400"}`}/>}
                          {lc>0&&<div className={`w-full h-1 rounded-full ${isSel?"bg-amber-300":"bg-amber-400"}`}/>}
                          <span className={`text-[10px] font-bold mt-0.5 ${isSel?"text-white/60":"text-gray-400"}`}>{tot} hadir</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Detail tanggal yang dipilih ── */}
        {selectedDate&&(
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <p className="text-sm font-bold text-gray-800">
                  {new Date(selectedDate+"T12:00:00+07:00").toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selectedAttendances.filter(a=>a.displayStatus==="PRESENT").length>0&&(
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      ✅ {selectedAttendances.filter(a=>a.displayStatus==="PRESENT").length} tepat waktu
                    </span>
                  )}
                  {selectedAttendances.filter(a=>a.displayStatus==="LATE").length>0&&(
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      ⏰ {selectedAttendances.filter(a=>a.displayStatus==="LATE").length} terlambat
                    </span>
                  )}
                  {(()=>{const off=getOffUsersForDate(selectedDate);return off.length>0?(<span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">🔴 Libur: {off.slice(0,3).join(", ")}{off.length>3?` +${off.length-3}`:""}</span>):null;})()}
                </div>
              </div>
              <button onClick={()=>setSelectedDate(null)} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {selectedAttendances.length===0?(
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-4xl mb-3 opacity-40">📅</div>
                {(()=>{const off=getOffUsersForDate(selectedDate);return off.length>0?(<div className="text-center"><div className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-2">🔴 Hari Libur</div>{off.map(n=><p key={n} className="text-xs text-red-400">• {n}</p>)}</div>):<p className="text-sm text-gray-400">Tidak ada absensi hari ini</p>;})()}
              </div>
            ):(
              /* Tabel absensi hari ini */
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Karyawan</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Jam Masuk</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Metode</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Lokasi</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Perangkat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedAttendances.map(a=>(
                      <tr key={a.id} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${a.displayStatus==="PRESENT"?"bg-[#1a1a2e]":"bg-amber-500"}`}>
                              {a.user_name.split(" ").slice(0,2).map((w:string)=>w[0]).join("").toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 text-sm">{a.user_name}</p>
                              <p className="text-[10px] text-gray-400">{a.user_role?.replace(/_/g," ")}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-gray-800">{toWIBTime(a.check_in_time||a.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${a.displayStatus==="PRESENT"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200"}`}>
                            {a.displayStatus==="PRESENT"?"✓ Tepat":"⏰ Terlambat"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${a.method==="FACE"?"bg-blue-50 text-blue-600 border-blue-200":"bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {a.method==="FACE"?"🫦 Wajah":"✋ Manual"}
                            </span>
                            {a.user_shift&&<span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${a.user_shift==="PAGI"?"bg-amber-50 text-amber-600 border-amber-200":"bg-indigo-50 text-indigo-600 border-indigo-200"}`}>{a.user_shift==="PAGI"?"🌅":"🌆"} {a.user_shift}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {a.latitude&&a.longitude?(
                            <a href={`https://maps.google.com/?q=${a.latitude},${a.longitude}`} target="_blank" rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border no-underline ${Math.round(haversine(a.latitude,a.longitude,OFFICE_LAT,OFFICE_LNG))<=80?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-red-50 text-red-600 border-red-200"}`}>
                              📍 {Math.round(haversine(a.latitude,a.longitude,OFFICE_LAT,OFFICE_LNG))}m
                            </a>
                          ):<span className="text-[10px] text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{a.device||"—"}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TABEL RINGKASAN PER KARYAWAN (di bawah kalender) ── */}
        {currentUser?.role==="ADMIN"&&(
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-800">Ringkasan Kehadiran — {MONTH_NAMES[calMonth]} {calYear}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Persentase = skor hadir ÷ hari kerja wajib · Tepat=1.0 · Terlambat=0.5 · Absen=0</p>
              </div>
            </div>

            {loading?(
              <div className="p-6 space-y-3">{Array(5).fill(0).map((_,i)=><div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse"/>)}</div>
            ):userSummary.length===0?(
              <div className="py-12 text-center text-sm text-gray-400">Belum ada data kehadiran bulan ini</div>
            ):(
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider w-8">#</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">Karyawan</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tepat</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Terlambat</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Absen</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Skor</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">Wajib Hadir</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider min-w-[180px]">Persentase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {userSummary.map((u,i)=>{
                      const absent=Math.max(0,u.workdays-u.present-u.late);
                      const pctColor=u.pct>=90?"text-emerald-600":u.pct>=70?"text-amber-600":"text-red-500";
                      const barColor=u.pct>=90?"bg-emerald-400":u.pct>=70?"bg-amber-400":"bg-red-400";
                      return(
                        <tr key={u.name} className="hover:bg-gray-50/30 transition">
                          <td className="px-6 py-3.5 text-[11px] text-gray-400 font-semibold">{i+1}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#1a1a2e] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                {u.name.split(" ").slice(0,2).map((w:string)=>w[0]).join("").toUpperCase()}
                              </div>
                              <span className="font-semibold text-gray-800">{u.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-bold">{u.present}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {u.late>0?(
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-700 text-sm font-bold">{u.late}</span>
                            ):<span className="text-gray-300 text-sm font-bold">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {absent>0?(
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 text-red-600 text-sm font-bold">{absent}</span>
                            ):<span className="text-gray-300 text-sm font-bold">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-sm font-bold text-gray-700">{u.score.toFixed(1)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="text-sm font-semibold text-gray-500">{u.workdays} hari</span>
                          </td>
                          <td className="px-6 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                                <div className={`h-full rounded-full transition-all ${barColor}`} style={{width:`${Math.min(u.pct,100)}%`}}/>
                              </div>
                              <span className={`text-sm font-bold w-12 text-right flex-shrink-0 ${pctColor}`}>{u.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer legenda */}
            <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center gap-5 flex-wrap">
              <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"/>Tepat waktu = 1.0 poin</span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"/>Terlambat = 0.5 poin</span>
              <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"/>Tidak hadir = 0 poin</span>
              <span className="text-[10px] text-gray-300 ml-auto">Hari libur tidak dihitung sebagai wajib hadir</span>
            </div>
          </div>
        )}
      </div>

      {showDayOffModal&&currentUser?.role==="ADMIN"&&(
        <DayOffModal users={allUsers} dayOffs={dayOffs} onClose={()=>setShowDayOffModal(false)} onSaved={()=>{fetchDayOffs();setShowDayOffModal(false);}}/>
      )}
      {showDateOffModal&&currentUser?.role==="ADMIN"&&(
        <DateOffModal users={allUsers} calYear={calYear} calMonth={calMonth} dateOffs={dateOffs} onClose={()=>setShowDateOffModal(false)} onSaved={()=>{fetchDateOffs(calYear,calMonth);fetchAllDateOffs();setShowDateOffModal(false);}}/>
      )}

      <style jsx global>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .animate-fadeIn{animation:fadeIn 0.3s ease-out;}
      `}</style>
    </DashboardLayout>
  );
}