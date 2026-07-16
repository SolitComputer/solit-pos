# Handoff: Ganti Emoji → Lucide Icons

## Tujuan
Ganti emoji/emoticon yang tampil di UI jadi komponen `lucide-react` (`^1.14.0`, sudah terinstall).

## SCOPE (penting — sudah disepakati)
- **Ganti: HANYA emoji di JSX yang tampil ke user** (title, tombol, badge, header, empty-state, dll).
- **JANGAN diganti:**
  - Emoji di **komentar kode** (`// ✅ ...`, `{/* 🏆 ... */}`) → biarkan.
  - Emoji di **string** yang dikirim keluar: pesan WhatsApp, push notification, toast/alert, `console.log`, **tooltip chart.js** (string di canvas, bukan JSX) → biarkan, karena tidak bisa jadi komponen React.

## Konvensi styling yang dipakai (ikuti biar konsisten)
- Inline / header kecil: `className="w-3.5 h-3.5"` atau `w-4 h-4`
- Empty-state (icon besar di tengah): `className="w-8 h-8 mx-auto text-gray-300 mb-1"` (atau `w-10`/`w-12` kalau aslinya `text-3xl`/`text-5xl`)
- Warna: ikut konteks aksen. Empty-state pakai `text-gray-300`. Yang aktif pakai warna aksennya (amber/blue/emerald dll).

## Mapping emoji → Lucide (yang sudah dipakai, pakai ulang untuk konsistensi)
| Emoji | Lucide |
|---|---|
| 🥇🥈🥉 | `Medal` + warna `["text-amber-400","text-gray-400","text-amber-600"]` per rank |
| 🏆 | `Trophy` (text-amber-500) |
| 💻 | `Laptop` |
| 📊 | `BarChart3` |
| 📭 | `Inbox` |
| ✅ | `CheckCircle2` |
| ⏳ (hourglass) | `Hourglass` |
| ⏳/⌛ status | `Clock` |
| ❌ | `XCircle` |
| 📋 | `ClipboardList` |
| 🔧 | `Wrench` |
| 💤 | `Moon` |
| ▲ / ▼ | `ArrowUp` / `ArrowDown` |

### Pola refactor untuk map string→emoji
Kalau ada `Record<string, string>` berisi emoji yang dirender, ubah jadi `Record<string, React.ComponentType<{ className?: string }>>` berisi komponen, lalu render:
```tsx
const Ico = STATUS_ICON[status] || ClipboardList;
return <Ico className="w-3 h-3" />;
```
Untuk array medali, simpan **array warna** (bukan emoji) dan render `<Medal className={color} />` berdasarkan index.

## ⚠️ GOTCHA scan (WAJIB pakai range lengkap)
Scan awal pakai range yang **kelewat U+2300–U+25FF**, jadi emoji kayak ⏳ ⏰ ⌚ ▶️ ◀️ ⭐ TIDAK ketangkep. Angka count awal per-halaman (tabel 1730) itu **undercount** — jangan dipercaya.

**Pakai range lengkap ini untuk scan:**
```
grep -nP "[\x{2190}-\x{2BFF}\x{1F000}-\x{1FAFF}\x{FE00}-\x{FE0F}]" <file>
```

## GOTCHA komponen anak
Emoji yang tampil di sebuah halaman sering datang dari **komponen anak**, bukan file `page.tsx`-nya. Contoh: dashboard menampilkan emoji dari `ServiceDashboardWidget`. Jadi saat kerjain 1 halaman, cek juga komponen yang dirender di dalamnya (`src/components/**`), bukan cuma `src/app/**/page.tsx`.

## Verifikasi tiap file
1. `grep -nP "[\x{2190}-\x{2BFF}\x{1F000}-\x{1FAFF}\x{FE00}-\x{FE0F}]" <file>` → pastikan sisa cuma komentar/string.
2. `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "<namafile>"` → pastikan no error.
3. Ingat React namespace sudah tersedia di file client (`React.ReactNode` dipakai tanpa import eksplisit).

## STATUS
### ✅ Selesai
- `src/app/dashboard/page.tsx` — medali, status transaksi, Trophy, Laptop, BarChart3, Inbox, trend arrow. (String tooltip chart.js `💻 Terjual` sengaja dibiarkan.)
- `src/components/service/ServiceDashboardWidget.tsx` — Hourglass (Antrian Terlama), Wrench (Sedang Dikerjakan + empty), Trophy (Ranking Teknisi), Moon (empty dikerjakan), CheckCircle2 (empty antrian), Medal (ranking).

### ⬜ Belum (semua halaman UI lain)
Contoh yang emoji-nya banyak (butuh re-scan pakai range lengkap dulu untuk angka akurat):
- `src/app/dashboard/attendance/page.tsx` (paling banyak — banyak di `emoji:` config object & string; hati-hati pisahkan yang JSX vs string)
- `src/app/dashboard/attendance/overtime/page.tsx`
- `src/app/dashboard/users/page.tsx`
- `src/app/dashboard/transactions/page.tsx`
- `src/app/dashboard/preparation/**` (banyak file)
- `src/app/payment/create/CreatePaymentClient.tsx`
- `src/app/dashboard/cashflow/page.tsx`
- `src/app/dashboard/pkl-reports/page.tsx`
- ...dan sisa ~40 halaman + komponen terkait di `src/components/**`.

Daftar file lengkap: jalankan grep range-lengkap di seluruh `src/**/*.{tsx,jsx}` lalu filter yang di JSX.

## Catatan attendance
Di `attendance/page.tsx` banyak `{ label: "...", emoji: "✅" }` di config object. Kalau dirender ke UI, ubah field jadi komponen icon (`icon: CheckCircle2`) dan render `<Cfg.icon className="..." />`. Tapi cek dulu — sebagian mungkin cuma dipakai di string/tidak dirender.
