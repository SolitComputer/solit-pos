# 📚 Katalog Lengkap API Solit POS

Dokumentasi seluruh API Route yang ada di project **Solit POS** (Next.js App Router).
Total API Route: **319 endpoint** terorganisir ke dalam **11 modul fungsional**.

## 📑 Daftar Isi Modul

- [📦 Inventori (Laptop, Unit, Aksesoris & Aset) (#50 endpoint)](#inventory)
- [🎯 Tugas, Pesan Internal & Gamifikasi (Misi/Koin) (#30 endpoint)](#collaboration_gamification)
- [🔐 Autentikasi, Pengguna & Hak Akses (#25 endpoint)](#auth_users)
- [🤖 AI Assistant & AI CEO Workspace (#15 endpoint)](#ai_features)
- [📊 Keuangan, Kas & Akuntansi (#28 endpoint)](#finance_accounting)
- [👥 SDM, Presensi, Lembur, Gaji & Laporan Karyawan (#50 endpoint)](#hr_attendance)
- [💬 CRM, Leads Chat & Integrasi Webhook (WA, IG, FB) (#29 endpoint)](#crm_leads)
- [⚙️ Sistem, Notifikasi & Utilitas Umum (#30 endpoint)](#system_utilities)
- [🚚 Operasional, Preparation & Kendaraan (#35 endpoint)](#operations_prep)
- [💰 Penjualan, Transaksi & Laporan Sales (#16 endpoint)](#sales_transactions)
- [🔧 Servis & Garansi Unit (#11 endpoint)](#service_warranty)

---

<a id="inventory"></a>
## 📦 Inventori (Laptop, Unit, Aksesoris & Aset) (50 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `POST` | `/api/accessories` | GET: _ctx: unknown, user: AuthUser <br/> POST: Authenticated | Master produk aksesoris (mouse, tas, charger, dll) |
| `GET` `DELETE` `PATCH` | `/api/accessories/[id]` | GET: { params }, user: AuthUser <br/> DELETE: Authenticated <br/> PATCH: { params }: { params: Promise<{ id: string }> }, user: AuthUser | Detail & update master aksesoris |
| `GET` `PATCH` | `/api/accessories/[id]/audit` | GET: AUDIT_VIEW_ROLES <br/> PATCH: AUDIT_ROLES | Audit stok aksesoris |
| `GET` `PATCH` | `/api/accessories/[id]/so` | GET: ctx: { params: Promise<{ id: string }> } <br/> PATCH: ctx: { params: Promise<{ id: string }> }, user: AuthUser | Stock opname barang aksesoris |
| `GET` | `/api/accessories/search` | GET: name, category, brand, spec, sell_price, stock" | Pencarian data aksesoris |
| `GET` `POST` | `/api/accessory-outflows` | GET: VIEW_ROLES <br/> POST: EDIT_ROLES | Pencatatan pengeluaran / penjualan aksesoris |
| `GET` `POST` | `/api/accessory-units` | GET: _ctx: unknown, user: AuthUser <br/> POST: error: "Body tidak valid" }, { status: 400 } | Stok fisik & varian serial number aksesoris |
| `DELETE` `PATCH` | `/api/accessory-units/[id]` | DELETE: { params }: { params: Promise<{ id: string }> } <br/> PATCH: { params }: { params: Promise<{ id: string }> },
    user: AuthUser | Detail & update stok unit aksesoris |
| `GET` `PATCH` | `/api/accessory-units/[id]/so` | GET: ctx: { params: Promise<{ id: string }> } <br/> PATCH: ctx: { params: Promise<{ id: string }> }, user: AuthUser | Stock opname unit aksesoris |
| `POST` | `/api/accessory-units/bulk` | POST: message: "Body tidak valid" },
            { status: 400 } | Input stok aksesoris massal |
| `GET` | `/api/accessory-units/search-sn` | GET: data: [] } | Cari serial number item aksesoris |
| `GET` `POST` | `/api/categories` | GET: DATA_BARANG_LAPTOP_ROLES <br/> POST: Authenticated | Kelola master kategori barang & aksesoris |
| `PUT` `DELETE` | `/api/categories/[id]` | PUT: Authenticated <br/> DELETE: Authenticated | Kelola master kategori barang & aksesoris |
| `GET` `POST` | `/api/dead-assets` | None / Internal / Custom | Manajemen aset mati / unit rusak afkir / sparepart |
| `DELETE` | `/api/dead-assets/[id]` | None / Internal / Custom | Manajemen aset mati / unit rusak afkir / sparepart |
| `GET` `POST` | `/api/fixed-assets` | None / Internal / Custom | Manajemen aset tetap operasional toko |
| `PUT` `DELETE` | `/api/fixed-assets/[id]` | None / Internal / Custom | Manajemen aset tetap operasional toko |
| `GET` `POST` | `/api/item-outflows` | GET: ITEM_OUTFLOW_ROLES <br/> POST: Authenticated | Riwayat barang keluar (laptop & aksesoris) |
| `PATCH` | `/api/item-outflows/[id]/audit` | PATCH: ITEM_OUTFLOW_ROLES | Endpoint modul item-outflows/[id]/audit |
| `POST` | `/api/item-outflows/[id]/restore` | POST: ITEM_OUTFLOW_ROLES | Endpoint modul item-outflows/[id]/restore |
| `GET` | `/api/item-outflows/options` | GET: ITEM_OUTFLOW_ROLES | Endpoint modul item-outflows/options |
| `GET` | `/api/laptops` | GET: LAPTOP_VIEW_ROLES | Katalog laptop master, filter kategori, brand & harga |
| `GET` `PUT` `DELETE` | `/api/laptops/[id]` | GET: LAPTOP_VIEW_ROLES <br/> PUT: Authenticated <br/> DELETE: Authenticated | Detail, update spesifikasi, atau hapus laptop master |
| `GET` `PATCH` | `/api/laptops/[id]/audit` | GET: BARANG_PRIVATE_VIEW_ROLES <br/> PATCH: BARANG_PRIVATE_VIEW_ROLES | Endpoint modul laptops/[id]/audit |
| `PATCH` | `/api/laptops/[id]/bulk-price` | PATCH: Authenticated | Endpoint modul laptops/[id]/bulk-price |
| `POST` | `/api/laptops/[id]/convert-to-accessory` | POST: Authenticated | Endpoint modul laptops/[id]/convert-to-accessory |
| `GET` `PATCH` | `/api/laptops/[id]/so` | GET: Authenticated <br/> PATCH: Authenticated | Endpoint modul laptops/[id]/so |
| `POST` | `/api/laptops/[id]/sync-units` | POST: PERMISSIONS.EDIT_LAPTOP | Endpoint modul laptops/[id]/sync-units |
| `GET` `POST` | `/api/laptops/[id]/units` | GET: PERMISSIONS.VIEW_UNITS <br/> POST: Authenticated | Daftar fisik unit berdasarkan model laptop |
| `POST` | `/api/laptops/[id]/units/bulk` | POST: Authenticated | Daftar fisik unit berdasarkan model laptop |
| `PATCH` | `/api/laptops/[id]/units/price` | PATCH: PERMISSIONS.EDIT_UNITS | Daftar fisik unit berdasarkan model laptop |
| `PATCH` | `/api/laptops/[id]/units/source` | PATCH: PERMISSIONS.EDIT_UNITS | Sumber asal unit laptop (supplier/tukar tambah) |
| `POST` | `/api/laptops/create` | POST: Authenticated | Endpoint modul laptops/create |
| `GET` `PUT` | `/api/laptops/minus` | GET: ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG"] <br/> PUT: ["ADMIN", "PROGRAMMER", "ASISTEN_CEO", "ACCOUNTING", "PENGELOLA_BARANG", "TEKNISI", "KEPALA_TEKNISI", "KEPALA_PENGELOLA_BARANG"] | Endpoint modul laptops/minus |
| `POST` | `/api/laptops/minus/decision` | POST: MINUS_REVIEW_ROLES | Endpoint modul laptops/minus/decision |
| `GET` | `/api/laptops/monitoring` | GET: MONITORING_STOCK_ROLES | Endpoint modul laptops/monitoring |
| `POST` | `/api/laptops/monitoring/reconcile` | POST: MONITORING_STOCK_ROLES | Endpoint modul laptops/monitoring/reconcile |
| `GET` `POST` | `/api/laptops/pengelola-points` | GET: Authenticated <br/> POST: Authenticated | Endpoint modul laptops/pengelola-points |
| `GET` | `/api/laptops/ready` | GET: LAPTOP_READY_VIEW_ROLES | Endpoint modul laptops/ready |
| `GET` | `/api/laptops/ready-units` | GET: LAPTOP_READY_VIEW_ROLES | Endpoint modul laptops/ready-units |
| `GET` | `/api/laptops/so-history` | GET: SO_HISTORY_VIEW_ROLES | Endpoint modul laptops/so-history |
| `GET` | `/api/units` | GET: PERMISSIONS.VIEW_ALL_UNITS | Daftar seluruh unit fisik laptop & statusnya |
| `PUT` `DELETE` `PATCH` | `/api/units/[id]` | PUT: Authenticated <br/> DELETE: Authenticated <br/> PATCH: Authenticated | Detail fisik unit, edit status, harga modal & jual |
| `GET` `PATCH` | `/api/units/[id]/audit` | GET: BARANG_PRIVATE_VIEW_ROLES <br/> PATCH: BARANG_PRIVATE_VIEW_ROLES | Riwayat audit fisik pada unit |
| `PATCH` | `/api/units/[id]/pedagang` | PATCH: BARANG_FULL_ACCESS_ROLES | Data alokasi unit untuk mitra pedagang |
| `GET` `PATCH` | `/api/units/[id]/so` | GET: Authenticated <br/> PATCH: Authenticated | Stock Opname (SO) pada unit laptop |
| `GET` | `/api/units/check-sn` | GET: Authenticated | Validasi serial number unit unik |
| `POST` | `/api/units/confirm-payment` | POST: [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "KEPALA_ZENITH",
  "CREW_SALES",
  "KEPALA_SOTECH",
  "KEPALA_ONPOINT",
  "ONPOINT",
] | Konfirmasi pelunasan pembayaran unit |
| `POST` | `/api/units/reserve` | POST: [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "KEPALA_ZENITH",
  "CREW_SALES",
  "SOTECH",
  "PENGANTARAN",
  "PENYEDIA_BARANG",
  "KEPALA_PENYEDIA_BARANG",
  "KEPALA_SOTECH",
  "KEPALA_ONPOINT",
  "ONPOINT",
] | Booking / reservasi unit oleh tim sales |
| `GET` | `/api/units/search-sn` | GET: accessoryResult] = await Promise.all([
        supabase
            .from("laptop_units" | Pencarian cepat unit berdasarkan Serial Number (SN) |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="collaboration_gamification"></a>
## 🎯 Tugas, Pesan Internal & Gamifikasi (Misi/Koin) (30 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/achievements` | GET: Authenticated | Daftar badge pencapaian (Achievement) karyawan |
| `GET` `POST` | `/api/chat-groups` | GET: Authenticated <br/> POST: Authenticated | Grup obrolan divisi / departemen internal |
| `GET` `DELETE` `PATCH` | `/api/chat-groups/[id]` | GET: Authenticated <br/> DELETE: Authenticated <br/> PATCH: Authenticated | Grup obrolan divisi / departemen internal |
| `GET` | `/api/chat-groups/addable-members` | GET: Authenticated | Grup obrolan divisi / departemen internal |
| `GET` | `/api/coins/border` | GET: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `GET` | `/api/coins/quests` | GET: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `POST` | `/api/coins/quests/claim` | POST: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `GET` | `/api/coins/shop` | GET: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `POST` | `/api/coins/shop/equip` | POST: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `POST` | `/api/coins/shop/purchase` | POST: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `GET` | `/api/coins/wallet` | GET: Authenticated | Reward Solit Coins (saldo, transaksi koin, transfer) |
| `GET` `POST` `DELETE` | `/api/custom-awards` | GET: Authenticated <br/> POST: Authenticated <br/> DELETE: Authenticated | Pemberian penghargaan custom / apresiasi khusus |
| `GET` `POST` `DELETE` `PATCH` | `/api/group-chat` | GET: Authenticated <br/> POST: Authenticated <br/> DELETE: Authenticated <br/> PATCH: Authenticated | Grup obrolan divisi / departemen internal |
| `POST` | `/api/group-chat/upload` | POST: Authenticated | Grup obrolan divisi / departemen internal |
| `GET` `POST` `DELETE` `PATCH` | `/api/messages` | GET: Authenticated <br/> POST: Authenticated <br/> DELETE: Authenticated <br/> PATCH: Authenticated | Kirim & terima pesan internal antar karyawan |
| `GET` | `/api/messages/conversations` | GET: ctx, user | Daftar room percakapan pesan internal |
| `POST` | `/api/messages/upload` | POST: Authenticated | Upload media lampiran chat internal |
| `GET` `POST` | `/api/missions` | GET: Authenticated <br/> POST: Authenticated | Daftar quest / misi kerja gamifikasi karyawan |
| `GET` `DELETE` `PATCH` | `/api/missions/[id]` | GET: Authenticated <br/> DELETE: Authenticated <br/> PATCH: Authenticated | Detail misi, penilaian reward & poin |
| `PATCH` | `/api/missions/[id]/items` | PATCH: Authenticated | Checklist sub-tugas pada misi |
| `GET` | `/api/missions/assignable-users` | GET: Authenticated | Daftar staf yang dapat diberikan misi |
| `GET` | `/api/missions/leaderboard` | GET: Authenticated | Papan peringkat poin misi kerja |
| `GET` | `/api/missions/stats` | GET: Authenticated | Statistik penyelesaian misi kerja |
| `POST` | `/api/missions/upload` | POST: Authenticated | Upload bukti penyelesaian misi kerja |
| `GET` `POST` | `/api/sop` | None / Internal / Custom | Katalog Standard Operating Procedure (SOP) perusahaan |
| `PUT` `DELETE` | `/api/sop/[id]` | None / Internal / Custom | Katalog Standard Operating Procedure (SOP) perusahaan |
| `GET` `POST` | `/api/todos` | None / Internal / Custom | Daftar to-do list tugas harian tim |
| `DELETE` `PATCH` | `/api/todos/[id]` | None / Internal / Custom | Detail, edit status, atau hapus to-do list |
| `GET` `POST` | `/api/todos/[id]/items` | None / Internal / Custom | Kelola checklist item di dalam to-do |
| `DELETE` `PATCH` | `/api/todos/[id]/items/[itemId]` | None / Internal / Custom | Kelola checklist item di dalam to-do |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="auth_users"></a>
## 🔐 Autentikasi, Pengguna & Hak Akses (25 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/activity-logs` | GET: _ctx, user | Riwayat log aktivitas perubahan data sistem |
| `GET` | `/api/admin/pages` | GET: Authenticated | Daftar halaman dan pengaturan akses menu admin |
| `GET` `PUT` | `/api/admin/role-permissions` | GET: Authenticated <br/> PUT: Authenticated | Konfigurasi hak akses (permission) per role |
| `GET` `POST` `PUT` `DELETE` | `/api/admin/roles` | GET: Authenticated <br/> POST: Authenticated <br/> PUT: Authenticated <br/> DELETE: Authenticated | Manajemen daftar role jabatan pengguna |
| `POST` `PUT` `DELETE` | `/api/auth/face-enroll` | None / Internal / Custom | Pendaftaran data biometrik wajah pengguna |
| `GET` `POST` | `/api/auth/face-status` | None / Internal / Custom | Cek status pendaftaran wajah pengguna |
| `POST` `PUT` | `/api/auth/face-verify` | None / Internal / Custom | Verifikasi wajah untuk login/presensi |
| `POST` | `/api/auth/login` | None / Internal / Custom | Login pengguna (email & password / auth credential) |
| `POST` `DELETE` | `/api/auth/logout` | None / Internal / Custom | Logout pengguna & hapus sesi token |
| `GET` | `/api/auth/me` | None / Internal / Custom | Mendapatkan profil & sesi pengguna yang sedang login |
| `POST` | `/api/auth/set-password` | None / Internal / Custom | Mengubah/mengatur kata sandi akun pengguna |
| `POST` | `/api/auth/webauthn/auth-options` | None / Internal / Custom | Generate tantangan (challenge) autentikasi WebAuthn |
| `POST` | `/api/auth/webauthn/auth-verify` | None / Internal / Custom | Verifikasi autentikasi login via passkey WebAuthn |
| `POST` | `/api/auth/webauthn/register-options` | None / Internal / Custom | Generate opsi registrasi passkey / biometric WebAuthn |
| `POST` | `/api/auth/webauthn/register-verify` | None / Internal / Custom | Verifikasi & simpan kredensial passkey WebAuthn baru |
| `GET` | `/api/auth/webauthn/status` | None / Internal / Custom | Cek status kredensial WebAuthn pengguna |
| `GET` | `/api/login-logs` | GET: { count: "exact" } | Riwayat log aktivitas login pengguna |
| `GET` | `/api/me/menu` | GET: Authenticated | Daftar menu navigasi sesuai izin user aktif |
| `GET` | `/api/me/permissions` | GET: Authenticated | Daftar permission granular milik user aktif |
| `GET` `PUT` | `/api/profile` | GET: Authenticated <br/> PUT: Authenticated | Kelola profil diri user |
| `POST` `DELETE` | `/api/profile/note` | POST: Authenticated <br/> DELETE: Authenticated | Kelola catatan profil / status user |
| `GET` `POST` | `/api/profile/note/views` | GET: Authenticated <br/> POST: Authenticated | Statistik view catatan profil user |
| `POST` `DELETE` | `/api/profile/photo` | POST: Authenticated <br/> DELETE: Authenticated | Upload / update foto profil pengguna |
| `GET` `POST` `DELETE` | `/api/profile/song` | GET: Authenticated <br/> POST: Authenticated <br/> DELETE: Authenticated | Pengaturan audio/soundtrack profil user |
| `GET` `POST` `PUT` `DELETE` | `/api/users` | GET: Authenticated <br/> POST: Authenticated <br/> PUT: Authenticated <br/> DELETE: Authenticated | CRUD daftar seluruh pengguna sistem / karyawan |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="ai_features"></a>
## 🤖 AI Assistant & AI CEO Workspace (15 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/ai-assistant/chat` | POST: AI_ASSISTANT_ROLES | Streaming chat interaktif dengan AI Assistant POS |
| `GET` | `/api/ai-assistant/conversations` | GET: AI_ASSISTANT_ROLES | Daftar sesi riwayat obrolan AI Assistant |
| `GET` | `/api/ai-assistant/conversations/[id]` | GET: AI_ASSISTANT_ROLES | Detail obrolan sesi AI Assistant |
| `GET` | `/api/ai-assistant/escalations` | GET: AI_CEO_ROLES | Eskalasi pertanyaan sulit AI ke staff manusia |
| `POST` | `/api/ai-assistant/escalations/[id]/reply` | POST: AI_CEO_ROLES | Staff merespon eskalasi obrolan AI |
| `GET` | `/api/ai-assistant/reminders` | GET: AI_ASSISTANT_ROLES | Pengingat otomatis dari rekomendasi AI |
| `GET` `PATCH` | `/api/ai-assistant/reminders/[id]` | GET: AI_ASSISTANT_ROLES <br/> PATCH: AI_ASSISTANT_ROLES | Pengingat otomatis dari rekomendasi AI |
| `POST` | `/api/ai-ceo/chat` | POST: AI_CEO_ROLES | AI CEO Executive Agent (analisis strategi & keputusan) |
| `GET` | `/api/ai-ceo/conversations` | GET: AI_CEO_ROLES | Sesi percakapan khusus ruang AI CEO |
| `GET` `DELETE` `PATCH` | `/api/ai-ceo/conversations/[id]` | GET: AI_CEO_ROLES <br/> DELETE: AI_CEO_ROLES <br/> PATCH: AI_CEO_ROLES | Endpoint modul ai-ceo/conversations/[id] |
| `GET` | `/api/ai-ceo/escalations/count` | GET: AI_CEO_ROLES | Jumlah eskalasi penting ke CEO |
| `GET` | `/api/ai-ceo/reminders` | GET: AI_CEO_ROLES | Pengingat tugas strategis dari AI CEO |
| `GET` | `/api/ai-ceo/suggestions` | GET: AI_CEO_ROLES | Rekomendasi taktis & saran bisnis dari AI CEO |
| `PATCH` | `/api/ai-ceo/suggestions/[id]` | PATCH: AI_CEO_ROLES | Rekomendasi taktis & saran bisnis dari AI CEO |
| `GET` | `/api/ai-ceo/usage` | GET: AI_CEO_ROLES | Statistik penggunaan token & kuota AI CEO |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="finance_accounting"></a>
## 📊 Keuangan, Kas & Akuntansi (28 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `POST` | `/api/akutansi/accounts` | GET: error } = await supabase
    .from("chart_of_accounts" <br/> POST: _ctx, user: any | Chart of Accounts (COA) / Master akun keuangan |
| `PUT` `DELETE` | `/api/akutansi/accounts/[code]` | PUT: ctx, user: any <br/> DELETE: ctx | Detail & edit akun COA spesifik |
| `GET` | `/api/akutansi/buku-besar` | GET: message: "Periode tidak valid" }, { status: 400 } | Laporan Buku Besar (General Ledger) per akun |
| `PATCH` | `/api/akutansi/buku-besar/check` | PATCH: _props, user | Validasi integritas data buku besar |
| `GET` | `/api/akutansi/export` | GET: message: "Periode tidak valid" }, { status: 400 } | Export data akuntansi (Excel/PDF) |
| `GET` `POST` | `/api/akutansi/jurnal` | GET: message: "Periode tidak valid" }, { status: 400 } <br/> POST: _ctx, user: any | Daftar & entri transaksi Jurnal Umum Akuntansi |
| `GET` `POST` | `/api/akutansi/jurnal-templates` | GET: error } = await supabase
    .from("journal_templates" <br/> POST: _ctx, user: any | Template jurnal transaksi berulang (recurring) |
| `PUT` `DELETE` | `/api/akutansi/jurnal-templates/[id]` | PUT: ctx: any <br/> DELETE: ctx: any | Template jurnal transaksi berulang (recurring) |
| `PUT` `DELETE` | `/api/akutansi/jurnal/[id]` | PUT: ctx, user: any <br/> DELETE: ctx, user: any | Detail, ubah, atau hapus entri jurnal |
| `GET` | `/api/akutansi/jurnal/[id]/logs` | GET: ctx | Audit trail riwayat modifikasi jurnal |
| `POST` | `/api/akutansi/jurnal/[id]/sync` | POST: ctx, user: any | Sinkronisasi jurnal dengan transaksi POS |
| `POST` `DELETE` | `/api/akutansi/jurnal/[id]/warning` | POST: ctx, user: any <br/> DELETE: ctx, user: any | Peringatan anomali pada entri jurnal |
| `PATCH` | `/api/akutansi/jurnal/check` | PATCH: checked } = body as { line_id: string; checked: boolean };

  if (!line_id | Pengecekan keseimbangan debit/kredit jurnal |
| `POST` | `/api/akutansi/jurnal/confirm` | POST: _ctx, user: any | Posting/konfirmasi jurnal transaksi |
| `POST` | `/api/akutansi/jurnal/fix-accessory-accounts` | POST: _ctx, user: any | Sinkronisasi akun jurnal persediaan aksesoris |
| `PUT` | `/api/akutansi/jurnal/move` | PUT: _ctx, user: any | Pindahkan entri jurnal antar akun |
| `GET` | `/api/akutansi/jurnal/pending` | GET: message: "Periode tidak valid" }, { status: 400 } | Jurnal yang menunggu konfirmasi/posting |
| `PUT` | `/api/akutansi/jurnal/reorder` | PUT: orderedIds, batches, sortOrder } = (body <br/><br/> {} | Urutkan ulang urutan pencatatan jurnal |
| `GET` | `/api/akutansi/laba-rugi` | GET: message: "Periode tidak valid" }, { status: 400 } | Laporan Laba Rugi (Income Statement / P&L) |
| `GET` | `/api/akutansi/neraca` | GET: message: "Periode tidak valid" }, { status: 400 } | Laporan Neraca Keuangan (Balance Sheet) |
| `GET` `POST` `PUT` | `/api/akutansi/saldo-awal` | GET: accountCode <br/> POST: _ctx, user: any <br/> PUT: _ctx, user: any | Pengaturan saldo awal periode akuntansi |
| `GET` `POST` | `/api/cashflow` | GET: e <br/> POST: _ctx, user: any | Pencatatan arus kas masuk & keluar (Cash Flow) |
| `PUT` `DELETE` `PATCH` | `/api/cashflow/[id]` | PUT: ctx, _user: any <br/> DELETE: ctx <br/> PATCH: ctx, user: any | Detail & update mutasi cashflow |
| `GET` `PUT` | `/api/cashflow/audit-access` | GET: PERMISSIONS.VIEW_CASHFLOW <br/> PUT: PERMISSIONS.VIEW_CASHFLOW | Audit log akses data cashflow rahasia |
| `POST` | `/api/cashflow/upload` | None / Internal / Custom | Endpoint modul cashflow/upload |
| `GET` `POST` | `/api/pengajuan-dana` | None / Internal / Custom | Pengajuan proposal dana operasional & petty cash |
| `DELETE` `PATCH` | `/api/pengajuan-dana/[id]` | None / Internal / Custom | Detail, approval (setujui/tolak) pengajuan dana |
| `POST` `PUT` | `/api/pengajuan-dana/[id]/realisasi` | None / Internal / Custom | Upload bukti nota realisasi pengeluaran dana |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="hr_attendance"></a>
## 👥 SDM, Presensi, Lembur, Gaji & Laporan Karyawan (50 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `DELETE` | `/api/attendance` | None / Internal / Custom | Pencatatan presensi masuk/pulang karyawan |
| `GET` `POST` `DELETE` | `/api/attendance/allowances` | None / Internal / Custom | Tunjangan kerja & komponen gaji karyawan |
| `GET` `POST` `DELETE` | `/api/attendance/date-off` | None / Internal / Custom | Daftar tanggal libur khusus per karyawan |
| `GET` `POST` `DELETE` | `/api/attendance/date-schedule` | None / Internal / Custom | Penjadwalan presensi spesifik per tanggal |
| `GET` `POST` `DELETE` | `/api/attendance/date-work` | None / Internal / Custom | Daftar tanggal jadwal kerja wajib |
| `GET` `POST` `DELETE` | `/api/attendance/day-off` | None / Internal / Custom | Pengaturan jadwal libur karyawan |
| `GET` `POST` `PATCH` | `/api/attendance/early-checkout` | None / Internal / Custom | Pengajuan izin pulang lebih awal |
| `PATCH` | `/api/attendance/edit-checkout` | None / Internal / Custom | Koreksi jam checkout presensi |
| `GET` | `/api/attendance/leaderboard` | GET: 0, 0, 0 | Peringkat kedisiplinan absensi karyawan |
| `GET` `POST` `DELETE` `PATCH` | `/api/attendance/leave` | None / Internal / Custom | Pengajuan & persetujuan cuti / izin kerja |
| `GET` `POST` `DELETE` | `/api/attendance/manual` | None / Internal / Custom | Input absensi manual oleh HR/Admin |
| `POST` | `/api/attendance/manual-checkout` | None / Internal / Custom | Checkout manual jika karyawan lupa absensi pulang |
| `GET` `POST` `DELETE` | `/api/attendance/monthly-off` | None / Internal / Custom | Kuota & rekap hari libur bulanan |
| `GET` `POST` `DELETE` `PATCH` | `/api/attendance/overtime` | None / Internal / Custom | Pengajuan & persetujuan lembur (overtime) |
| `GET` `POST` | `/api/attendance/overtime-points` | GET: Authenticated <br/> POST: Authenticated | Perhitungan reward poin lembur |
| `GET` | `/api/attendance/overtime/leaderboard` | None / Internal / Custom | Peringkat jam lembur karyawan |
| `GET` | `/api/attendance/overtime/monitoring` | None / Internal / Custom | Monitoring real-time aktivitas lembur |
| `GET` | `/api/attendance/overtime/pending-acc` | None / Internal / Custom | Daftar pengajuan lembur butuh approval |
| `GET` `POST` | `/api/attendance/overtime/rates` | None / Internal / Custom | Tarif perhitungan upah lembur per jam |
| `GET` | `/api/attendance/overtime/recap` | None / Internal / Custom | Rekapitulasi total jam lembur bulanan |
| `POST` | `/api/attendance/overtime/upload` | None / Internal / Custom | Upload bukti dokumentasi lembur |
| `GET` `POST` | `/api/attendance/quality-rank` | GET: Authenticated <br/> POST: Authenticated | Peringkat kualitas performa kerja karyawan |
| `GET` `POST` | `/api/attendance/salary` | None / Internal / Custom | Perhitungan gaji bulanan karyawan (Payroll) |
| `GET` `POST` `PATCH` | `/api/attendance/salary-slip` | None / Internal / Custom | Daftar slip gaji karyawan |
| `GET` | `/api/attendance/salary-slip/[id]/pdf` | None / Internal / Custom | Download file PDF slip gaji |
| `POST` `PUT` | `/api/attendance/salary-slip/send` | None / Internal / Custom | Kirim slip gaji otomatis via WhatsApp/Email |
| `GET` `POST` `DELETE` | `/api/attendance/schedule` | None / Internal / Custom | Jadwal shift kerja mingguan/bulanan |
| `GET` `POST` `DELETE` | `/api/attendance/shift-config` | None / Internal / Custom | Konfigurasi jam kerja shift (pagi/siang/malam) |
| `GET` `POST` `DELETE` | `/api/attendance/shift-schedule` | None / Internal / Custom | Plotting jadwal shift per karyawan |
| `POST` `DELETE` | `/api/attendance/swap-dayoff` | None / Internal / Custom | Pengajuan tukar jadwal hari libur antar staf |
| `GET` | `/api/attendance/today` | None / Internal / Custom | Status kehadiran seluruh karyawan hari ini |
| `GET` | `/api/attendance/users` | GET: Authenticated | Daftar karyawan dalam sistem absensi |
| `GET` `POST` | `/api/cc-reports` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` `PATCH` | `/api/cc-reports/[id]` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` `POST` | `/api/cc-reports/[id]/postings` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `DELETE` `PATCH` | `/api/cc-reports/[id]/postings/[postingId]` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `POST` | `/api/cc-reports/[id]/postings/[postingId]/sync` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` | `/api/cc-reports/analytics` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `POST` | `/api/cc-reports/instagram/keepalive` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` `DELETE` | `/api/cc-reports/instagram/status` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` | `/api/cc-reports/konten-milestones` | GET: Authenticated | Laporan Customer Care / keluhan pelanggan |
| `POST` | `/api/cc-reports/sync` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` | `/api/cc-reports/tiktok/callback` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` | `/api/cc-reports/tiktok/connect` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `POST` | `/api/cc-reports/tiktok/keepalive` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` `DELETE` | `/api/cc-reports/tiktok/status` | None / Internal / Custom | Laporan Customer Care / keluhan pelanggan |
| `GET` | `/api/leaderboard-kerja` | GET: _ctx, user | Leaderboard akumulasi kinerja harian & bulanan |
| `GET` `POST` | `/api/leaderboard-kerja/quality-rank` | GET: Authenticated <br/> POST: Authenticated | Leaderboard akumulasi kinerja harian & bulanan |
| `GET` `POST` `DELETE` `PATCH` | `/api/pkl-reports` | None / Internal / Custom | Laporan absensi & aktivitas anak magang (PKL) |
| `GET` `POST` `DELETE` | `/api/presence` | None / Internal / Custom | Endpoint validasi lokasi & koordinat presensi |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="crm_leads"></a>
## 💬 CRM, Leads Chat & Integrasi Webhook (WA, IG, FB) (29 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `POST` `DELETE` `PATCH` | `/api/audit-leads` | None / Internal / Custom | Audit kualitas follow-up & respon tim sales |
| `POST` | `/api/audit-leads/audit` | None / Internal / Custom | Audit kualitas follow-up & respon tim sales |
| `GET` `POST` | `/api/leads-chat/accounts` | GET: LEADS_CHAT_ROLES <br/> POST: LEADS_CHAT_MANAGE_ROLES | Kelola koneksi akun WhatsApp bisnis |
| `DELETE` | `/api/leads-chat/accounts/[id]` | DELETE: LEADS_CHAT_MANAGE_ROLES | Detail & kelola akun WhatsApp |
| `GET` | `/api/leads-chat/accounts/[id]/qr` | GET: LEADS_CHAT_MANAGE_ROLES | Generate QR code koneksi WhatsApp Gateway |
| `POST` | `/api/leads-chat/accounts/[id]/refresh-webhook` | POST: LEADS_CHAT_MANAGE_ROLES | Refresh endpoint webhook WhatsApp |
| `POST` | `/api/leads-chat/accounts/import` | POST: LEADS_CHAT_MANAGE_ROLES | Import akun WhatsApp / konfigurasi token |
| `POST` | `/api/leads-chat/accounts/sync` | POST: LEADS_CHAT_MANAGE_ROLES | Sinkronisasi pesan & kontak WhatsApp |
| `GET` | `/api/leads-chat/conversations` | GET: LEADS_CHAT_ROLES | Daftar percakapan chat omnichannel (WA, FB, IG) |
| `GET` `POST` | `/api/leads-chat/conversations/[id]/messages` | GET: LEADS_CHAT_ROLES <br/> POST: LEADS_CHAT_ROLES | Kirim pesan & ambil riwayat chat inbox |
| `DELETE` | `/api/leads-chat/conversations/[id]/messages/[messageId]` | DELETE: LEADS_CHAT_ROLES | Kirim pesan & ambil riwayat chat inbox |
| `GET` | `/api/leads-chat/facebook-accounts` | GET: LEADS_CHAT_ROLES | Koneksi & integrasi halaman Facebook Page |
| `DELETE` | `/api/leads-chat/facebook-accounts/[id]` | DELETE: LEADS_CHAT_MANAGE_ROLES | Endpoint modul leads-chat/facebook-accounts/[id] |
| `GET` | `/api/leads-chat/facebook-accounts/callback` | withAuth | OAuth callback token Facebook |
| `GET` | `/api/leads-chat/facebook-accounts/connect` | GET: LEADS_CHAT_MANAGE_ROLES | Inisiasi OAuth koneksi Facebook Page |
| `POST` | `/api/leads-chat/facebook-accounts/import` | POST: LEADS_CHAT_MANAGE_ROLES | Endpoint modul leads-chat/facebook-accounts/import |
| `GET` | `/api/leads-chat/instagram-accounts` | GET: LEADS_CHAT_ROLES | Koneksi akun Instagram Direct Message |
| `DELETE` | `/api/leads-chat/instagram-accounts/[id]` | DELETE: LEADS_CHAT_MANAGE_ROLES | Endpoint modul leads-chat/instagram-accounts/[id] |
| `POST` | `/api/leads-chat/instagram-accounts/import` | POST: LEADS_CHAT_MANAGE_ROLES | Endpoint modul leads-chat/instagram-accounts/import |
| `POST` | `/api/leads-chat/upload` | POST: LEADS_CHAT_ROLES | Upload file lampiran media (gambar/dokumen) ke chat |
| `GET` `POST` | `/api/seller-followup-reminders` | GET: PERMISSIONS.VIEW_SELLER_FOLLOWUP <br/> POST: PERMISSIONS.VIEW_SELLER_FOLLOWUP | Pengingat otomatis jadwal follow up leads |
| `PATCH` | `/api/seller-followup-reminders/read-all` | PATCH: PERMISSIONS.VIEW_SELLER_FOLLOWUP | Tandai semua pengingat follow-up telah dibaca |
| `GET` | `/api/seller-followups` | GET: PERMISSIONS.VIEW_SELLER_FOLLOWUP | Daftar jadwal follow-up prospek/customer oleh sales |
| `DELETE` `PATCH` | `/api/seller-followups/[id]` | DELETE: PERMISSIONS.VIEW_SELLER_FOLLOWUP <br/> PATCH: PERMISSIONS.VIEW_SELLER_FOLLOWUP | Update status & catatan follow-up prospek |
| `GET` | `/api/seller-followups/due-alert` | GET: PERMISSIONS.VIEW_SELLER_FOLLOWUP | Pemberitahuan lead yang jatuh tempo follow-up |
| `GET` `PUT` | `/api/seller-pics` | GET: PERMISSIONS.VIEW_SELLER_FOLLOWUP <br/> PUT: PERMISSIONS.VIEW_SELLER_FOLLOWUP | Penetapan Sales PIC yang menangani lead customer |
| `GET` `POST` | `/api/webhooks/facebook` | None / Internal / Custom | Webhook pesan masuk Facebook Messenger |
| `GET` `POST` | `/api/webhooks/instagram` | None / Internal / Custom | Webhook pesan masuk Instagram DM |
| `POST` | `/api/webhooks/whatsapp` | None / Internal / Custom | Webhook penerimaan pesan masuk WhatsApp |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="system_utilities"></a>
## ⚙️ Sistem, Notifikasi & Utilitas Umum (30 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `POST` | `/api/contracts` | GET: Authenticated <br/> POST: Authenticated | Endpoint modul contracts |
| `POST` | `/api/contracts/countersign` | POST: Authenticated | Endpoint modul contracts/countersign |
| `GET` | `/api/contracts/me` | GET: Authenticated | Endpoint modul contracts/me |
| `GET` | `/api/contracts/pending-signature` | GET: Authenticated | Endpoint modul contracts/pending-signature |
| `POST` | `/api/contracts/respond` | POST: Authenticated | Endpoint modul contracts/respond |
| `GET` | `/api/dashboard/gross-profit-detail` | GET: PERMISSIONS.VIEW_FINANCIALS | Endpoint modul dashboard/gross-profit-detail |
| `GET` | `/api/dashboard/inventory-detail` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/inventory-detail |
| `GET` | `/api/dashboard/laptop-detail` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/laptop-detail |
| `GET` | `/api/dashboard/revenue-detail` | GET: PERMISSIONS.VIEW_FINANCIALS | Endpoint modul dashboard/revenue-detail |
| `GET` | `/api/dashboard/sales-detail` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/sales-detail |
| `GET` | `/api/dashboard/service-stats` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/service-stats |
| `GET` | `/api/dashboard/stats` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/stats |
| `GET` | `/api/dashboard/transaction-detail` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/transaction-detail |
| `GET` | `/api/dashboard/transactions` | GET: PERMISSIONS.VIEW_DASHBOARD | Endpoint modul dashboard/transactions |
| `GET` | `/api/geo/resolve-maps` | GET: PREPARATION_DELIVERY_ROLES | Layanan geocoding / konversi koordinat ke nama alamat |
| `GET` | `/api/health` | None / Internal / Custom | Health check status server, database & layanan |
| `GET` | `/api/notification-settings` | GET: NOTIFICATION_SETTINGS_ROLES | Pengaturan preferensi notifikasi per user |
| `GET` `PATCH` | `/api/notification-settings/[userId]` | GET: [...PREPARATION_DELIVERY_PERSON_ROLES, ...NOTIFICATION_SETTINGS_ROLES] <br/> PATCH: NOTIFICATION_SETTINGS_ROLES | Pengaturan preferensi notifikasi per user |
| `GET` `DELETE` | `/api/notification-settings/library` | GET: NOTIFICATION_SETTINGS_ROLES <br/> DELETE: NOTIFICATION_SETTINGS_ROLES | Daftar pilihan nada dering / suara notifikasi |
| `POST` | `/api/notification-settings/upload-sound` | POST: NOTIFICATION_SETTINGS_ROLES | Upload custom audio file untuk notifikasi |
| `GET` `POST` | `/api/patch-notes` | GET: PATCH_NOTES_PUBLISH_ROLES <br/> POST: PATCH_NOTES_PUBLISH_ROLES | Catatan rilis pembaruan fitur sistem (Release Notes) |
| `PUT` `DELETE` `PATCH` | `/api/patch-notes/[id]` | PUT: PATCH_NOTES_PUBLISH_ROLES <br/> DELETE: PATCH_NOTES_PUBLISH_ROLES <br/> PATCH: PATCH_NOTES_PUBLISH_ROLES | Detail & tandai baca patch note spesifik |
| `POST` | `/api/patch-notes/[id]/read` | POST: Authenticated | Detail & tandai baca patch note spesifik |
| `POST` | `/api/patch-notes/mark-read` | POST: Authenticated | Tandai semua update telah dibaca |
| `GET` | `/api/patch-notes/my` | GET: Authenticated | Daftar patch note relevan untuk user aktif |
| `GET` | `/api/patch-notes/unread` | GET: Authenticated | Cek notifikasi update rilis yang belum dibaca |
| `GET` `OPTIONS` | `/api/public/catalog` | None / Internal / Custom | API katalog publik untuk integrasi eksternal |
| `POST` `DELETE` | `/api/push/subscribe` | POST: Authenticated <br/> DELETE: Authenticated | Registrasi token Web Push Notification browser |
| `GET` `POST` | `/api/settings/photo` | GET: message: "Key wajib diisi" }, { status: 400 } <br/> POST: _ctx, user: any | Pengaturan avatar / foto sistem |
| `POST` | `/api/test-whatsapp` | POST: message } = await req.json( | Testing koneksi & pengiriman pesan WhatsApp |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="operations_prep"></a>
## 🚚 Operasional, Preparation & Kendaraan (35 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `POST` | `/api/preparation` | GET: PREPARATION_VIEW_ROLES <br/> POST: PREPARATION_CREATE_ROLES | List antrean penyiapan unit/pesanan untuk customer |
| `GET` `DELETE` `PATCH` | `/api/preparation/[id]` | GET: PREPARATION_VIEW_ROLES <br/> DELETE: PREPARATION_CREATE_ROLES <br/> PATCH: PREPARATION_CREATE_ROLES | Detail tiket antrean penyiapan pesanan |
| `POST` | `/api/preparation/[id]/accept` | POST: PREPARATION_DELIVERY_PERSON_ROLES | Klaim / terima tugas penyiapan unit oleh staf |
| `POST` | `/api/preparation/[id]/cancel` | POST: PREPARATION_CANCEL_ROLES | Pembatalan tugas penyiapan |
| `PATCH` | `/api/preparation/[id]/check` | PATCH: PREPARATION_DONE_ROLES | Quality control (QC) checklist penyiapan |
| `POST` | `/api/preparation/[id]/delivery` | POST: PREPARATION_DELIVERY_ROLES | Update status perjalanan pengiriman kurir |
| `POST` | `/api/preparation/[id]/dispatch` | POST: PREPARATION_CREATE_ROLES | Serahkan unit ke kurir untuk pengiriman |
| `POST` | `/api/preparation/[id]/done` | POST: PREPARATION_DONE_ROLES | Tandai penyiapan unit telah selesai |
| `POST` | `/api/preparation/[id]/force-complete` | POST: PREPARATION_FORCE_COMPLETE_ROLES | Force complete penyiapan oleh supervisor |
| `POST` | `/api/preparation/[id]/heartbeat` | POST: PREPARATION_DELIVERY_ROLES | Heartbeat pemantauan staf prep yang bertugas |
| `POST` | `/api/preparation/[id]/items/[itemId]/cancel` | POST: PREPARATION_CANCEL_ROLES | Batalkan item tertentu dalam daftar penyiapan |
| `POST` | `/api/preparation/[id]/manual-status` | POST: PERMISSIONS.FORCE_COMPLETE_PREPARATION | Ubah status penyiapan secara manual |
| `POST` | `/api/preparation/[id]/reassign` | POST: PERMISSIONS.FORCE_COMPLETE_PREPARATION | Alihkan penyiapan ke teknisi/staf lain |
| `POST` | `/api/preparation/[id]/receive` | POST: PREPARATION_DONE_ROLES | Penerimaan unit yang dikirim di tempat tujuan |
| `GET` `POST` | `/api/preparation/[id]/tracking` | GET: PREPARATION_VIEW_ROLES <br/> POST: PREPARATION_DELIVERY_ROLES | Pelacakan koordinat GPS real-time kurir |
| `GET` `POST` | `/api/preparation/[id]/voice` | GET: DELIVERY_VOICE_ROLES <br/> POST: DELIVERY_VOICE_ROLES | Pesan suara / rekaman instruksi penyiapan |
| `GET` | `/api/preparation/delivery-leaderboard` | GET: DELIVERY_LEADERBOARD_VIEW_ROLES | Peringkat performa kurir pengiriman |
| `GET` | `/api/preparation/delivery-milestones` | GET: Authenticated | Pencapaian milestone kurir |
| `GET` | `/api/preparation/delivery-stats` | GET: DELIVERY_LEADERBOARD_VIEW_ROLES | Statistik pengantaran unit kurir |
| `GET` | `/api/preparation/delivery-users` | GET: ASSIGN_DRIVER_ROLES | Daftar user yang bertugas sebagai kurir |
| `POST` | `/api/preparation/direct` | POST: PREPARATION_DIRECT_DELIVERY_ROLES | Pembuatan order penyiapan unit langsung |
| `GET` | `/api/preparation/history` | GET: PREPARATION_VIEW_ROLES | Riwayat selesai proses penyiapan unit |
| `GET` | `/api/preparation/leaderboard` | GET: PREPARATION_VIEW_ROLES | Leaderboard performa staf preparation |
| `GET` | `/api/preparation/my-deliveries` | GET: PREPARATION_DELIVERY_ROLES | Daftar tugas kirim milik kurir yang login |
| `GET` | `/api/preparation/person-stats` | GET: PREPARATION_VIEW_ROLES | Statistik produktivitas individu preparation |
| `GET` | `/api/preparation/provider-milestones` | GET: PROVIDER_PERFORMANCE_VIEW_ROLES | Milestone kinerja tim preparation |
| `GET` | `/api/preparation/provider-performance` | GET: PROVIDER_PERFORMANCE_VIEW_ROLES | Evaluasi performa penyedia / teknisi prep |
| `GET` `POST` | `/api/vehicles` | None / Internal / Custom | Master data kendaraan operasional (motor/mobil) |
| `PUT` `DELETE` | `/api/vehicles/[id]` | None / Internal / Custom | Detail, edit, atau hapus armada kendaraan |
| `GET` `POST` | `/api/vehicles/borrow` | None / Internal / Custom | Pengajuan & daftar peminjaman kendaraan |
| `PATCH` | `/api/vehicles/borrow/[id]` | None / Internal / Custom | Persetujuan / pengembalian peminjaman kendaraan |
| `GET` | `/api/vehicles/dashboard` | None / Internal / Custom | Dashboard ketersediaan dan status armada kendaraan |
| `GET` | `/api/vehicles/history` | None / Internal / Custom | Riwayat peminjaman & servis kendaraan |
| `GET` | `/api/vehicles/pending-count` | None / Internal / Custom | Jumlah request peminjaman kendaraan pending |
| `GET` `PUT` | `/api/vehicles/sop` | None / Internal / Custom | Standard Operating Procedure penggunaan kendaraan |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="sales_transactions"></a>
## 💰 Penjualan, Transaksi & Laporan Sales (16 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/price-list-pedagang` | GET: PRICELIST_PEDAGANG_ROLES | Daftar harga khusus rekanan/pedagang laptop |
| `POST` | `/api/receipt/send-wa-image` | POST: _ctx: unknown, user: AuthUser | Kirim gambar struk/nota transaksi via WhatsApp |
| `POST` | `/api/receipt/upload-image` | POST: { status: 400 } | Upload gambar bukti struk transaksi |
| `GET` | `/api/reports` | GET: ["ADMIN", "ACCOUNTING", "KEPALA_MARKETING", "PROGRAMMER", "ASISTEN_CEO"] | Laporan analitik umum penjualan & performa |
| `GET` `POST` `DELETE` `PATCH` | `/api/sales-reports` | GET: Authenticated <br/> POST: Authenticated <br/> DELETE: Authenticated <br/> PATCH: Authenticated | Laporan performa dan rekap penjualan sales |
| `POST` | `/api/sales-reports/audit` | POST: _ctx, user | Audit verifikasi transaksi penjualan sales |
| `GET` | `/api/sales-reports/audit-milestones` | GET: Authenticated | Milestone audit penjualan |
| `GET` | `/api/transaction` | GET: PERMISSIONS.VIEW_TRANSACTIONS | List transaksi penjualan dengan filter & pagination |
| `GET` `PUT` | `/api/transaction/[invoice]` | GET: PERMISSIONS.EDIT_TRANSACTION.concat(["ACCOUNTING"] <br/> PUT: PERMISSIONS.EDIT_TRANSACTION | Detail, update status, atau hapus transaksi by invoice |
| `POST` | `/api/transaction/[invoice]/cancel-units` | POST: PERMISSIONS.RESTORE_TRANSACTION | Batalkan unit tertentu dalam transaksi |
| `GET` | `/api/transaction/[invoice]/items` | GET: ALLOWED_ROLES | Kelola item barang di dalam invoice transaksi |
| `POST` | `/api/transaction/[invoice]/restore` | POST: PERMISSIONS.RESTORE_TRANSACTION | Restore transaksi yang sebelumnya dibatalkan |
| `POST` | `/api/transaction/create` | POST: PERMISSIONS.CREATE_TRANSACTION | Membuat transaksi penjualan baru |
| `GET` | `/api/transaction/customer-birthdays` | GET: Authenticated | Data ulang tahun customer untuk promosi/loyalty |
| `GET` | `/api/transaction/pending` | GET: [
  "ADMIN",
  "PROGRAMMER",
  "ASISTEN_CEO",
  "KEPALA_SALES",
  "KEPALA_ZENITH",
  "CREW_SALES",
  "ACCOUNTING",
  "PENGANTARAN",
  "KEPALA_SOTECH",
  "SOTECH",
  "KEPALA_ONPOINT",
  "ONPOINT",
] | Daftar transaksi status pending/menunggu konfirmasi |
| `GET` | `/api/transaction/sales-milestones` | GET: Authenticated | Pencapaian milestone target penjualan sales |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

<a id="service_warranty"></a>
## 🔧 Servis & Garansi Unit (11 Endpoint)

| Method | Endpoint Path | Autentikasi / Permission | Deskripsi / Fungsi |
| :--- | :--- | :--- | :--- |
| `GET` `POST` | `/api/service` | GET: _ctx, user <br/> POST: _ctx, user | Kelola tiket penerimaan servis laptop/unit |
| `GET` `PATCH` | `/api/service/[id]` | None / Internal / Custom | Detail, diagnosa, estimasi biaya & progress servis |
| `GET` `OPTIONS` | `/api/service/public` | None / Internal / Custom | Halaman publik cek status servis oleh customer |
| `GET` | `/api/service/statistik` | GET: SERVICE_VIEW_ROLES | Statistik & performa penanganan servis |
| `GET` `OPTIONS` | `/api/service/stream` | None / Internal / Custom | Server-Sent Events (SSE) live updates antrean servis |
| `GET` | `/api/service/stream/internal` | None / Internal / Custom | SSE status servis untuk teknisi internal |
| `GET` | `/api/service/teknisi-milestones` | GET: Authenticated | Milestone poin servis teknisi |
| `POST` | `/api/service/upload-payment-proof` | POST: _ctx, user | Upload bukti pembayaran biaya servis |
| `GET` | `/api/warranty` | GET: PERMISSIONS.VIEW_WARRANTY | Daftar & pencatatan klaim garansi |
| `GET` `PUT` | `/api/warranty/[id]` | GET: PERMISSIONS.VIEW_WARRANTY <br/> PUT: PERMISSIONS.EDIT_WARRANTY | Detail & penanganan klaim garansi pelanggan |
| `GET` `OPTIONS` | `/api/warranty/check` | None / Internal / Custom | Cek masa berlaku garansi unit berdasarkan SN |

[⬆ Kembali ke Atas](#daftar-isi-modul)

---

