/**
 * scripts/bulk-create-auth-users.ts
 * COPY SELURUH INI
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ ERROR: Set env variables!');
  process.exit(1);
}

// ✅ SECURITY FIX: script ini bikin akun auth SUNGGUHAN pakai service role key
// dari .env.local — kalau .env.local tidak sengaja mengarah ke Supabase
// produksi, akun-akun ini langsung dibuat di database asli tanpa peringatan.
// Sekarang wajib konfirmasi eksplisit: jalankan dengan
// `CONFIRM_TARGET_PROJECT_REF=<project-ref-dari-url>` supaya operator harus
// baca dulu project mana yang akan disentuh sebelum script jalan.
const projectRef = supabaseUrl.match(/^https?:\/\/([^.]+)\./)?.[1] ?? supabaseUrl;
const confirmRef = process.env.CONFIRM_TARGET_PROJECT_REF;
console.log(`\n🎯 Target Supabase project: ${projectRef} (${supabaseUrl})`);
if (confirmRef !== projectRef) {
  console.error(
    `\n❌ DIBATALKAN. Ini script yang bikin akun auth SUNGGUHAN.\n` +
    `   Untuk melanjutkan, jalankan ulang dengan:\n` +
    `   CONFIRM_TARGET_PROJECT_REF=${projectRef} npx tsx src/scripts/bulk-create-auth-users.ts\n`
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const orphanedUsers = [
  { id: '66e08d92-b325-4514-9235-df6e5b30eed4', name: 'Abdul Fathir' },
  { id: '7c44e39b-09dc-4e05-8db5-47633e635fcd', name: 'Achmad Firdaus' },
  { id: '950c01fc-4f27-46dc-a608-f6db5d942193', name: 'Achmad Jaelani' },
  { id: '72547e7b-41e8-448d-8be3-0ffb839beff3', name: 'Admin Solit' },
  { id: 'e6ce0864-eac8-4b44-87ad-faad5a7935dc', name: 'akun testing' },
  { id: '4610906c-4bd5-4678-875f-749db0787de6', name: 'David J. Sendouw' },
  { id: '3750886b-ba59-4c40-946c-098dc3b423a3', name: 'Dicky Pratama Setiawan' },
  { id: '6dad4a4c-71c9-4cab-aaa5-f1fce25b7b24', name: 'Dirga Riadmas' },
  { id: 'a8e2697f-24a0-4a76-9002-141750b5eefd', name: 'Fadriansyah' },
  { id: 'a136bb0a-d6de-4439-946c-c17a85b11a67', name: 'Fauzan Abdul Ghaffar' },
  { id: '20c4df76-db02-4e36-977b-27b76c7fa803', name: 'Fikri Aryansyah' },
  { id: 'c9abb46e-2335-4638-8f1f-6f17c2801cdb', name: 'Fitri Hidayat' },
  { id: '3d8fe0d7-1735-492d-afe8-71991154c066', name: 'Ikmal Fairuz Arabi' },
  { id: '63d839c4-f019-40da-b673-52a6e3a854eb', name: 'Moreno Akbari Pasha' },
  { id: '2c570a8b-9c98-46f5-ad86-b0b0953a2afc', name: 'Novita Glory' },
  { id: 'c35db5bc-8f7e-4e96-9015-dc84092bac19', name: 'Nur Alim' },
  { id: '73ced0e9-28fb-4e42-bcfa-1c7dc06384b6', name: 'R Herry Sudiarman' },
  { id: 'ef81e506-52d6-4e30-89de-0a0bc35f7ec2', name: 'Raesty Yuliana' },
  { id: '7594367d-b27b-49a8-a427-5ecb7fa2d21f', name: 'Rafi Salim' },
  { id: 'a586ee2a-a02a-43cf-832d-23b02d802070', name: 'Rafii Dwi Saputra' },
  { id: '7a0aacab-961c-4332-b4bf-361431126f77', name: 'Rayhan Saputra' },
  { id: '236c08b5-0dd2-4f2f-95d6-286c5b6dd75e', name: 'Reinaldy' },
  { id: '3ea1fbc0-5313-4fb7-9bd8-02b8ba466a7c', name: 'Rizki Revinsa' },
  { id: '495729ce-8299-4b88-8548-b79db34b2aad', name: 'Romadon Abdusalam' },
  { id: '6368c5ed-a372-4246-8818-a3fa99c2b51e', name: 'Tengku M. Faturrahman' },
  { id: '3ffb396a-e967-4359-8d98-3d0d1985014f', name: 'Ujang' },
  { id: '7b56de81-244e-42af-b2f6-0e29631c4114', name: 'Yoga Adi Prakoso' },
  { id: '157585d5-af25-4271-80c6-93160b3f8975', name: 'Yulfa' },
  { id: 'c5d6c697-655e-4312-9161-acacb786f9dc', name: 'Yuna Lucyanawati' },
];

async function bulkCreateAuthUsers() {
  console.log(`\n📋 Mulai create ${orphanedUsers.length} auth users...\n`);

  const results = {
    success: [] as any[],
    failed: [] as any[],
  };

  for (const user of orphanedUsers) {
    try {
      console.log(`⏳ ${user.name}...`);

      const email = `${user.name.toLowerCase().replace(/\s+/g, '.')}@solit.local`;
      const random = Math.floor(100000 + Math.random() * 900000);
      const tempPassword = `SolitAuth2026_${random}`;

      const { data: existingUser } = await supabase.auth.admin.getUserById(user.id);

      if (existingUser?.user) {
        console.log(`   ✅ Sudah ada`);
        results.success.push({ id: user.id, name: user.name, email: existingUser.user.email });
        continue;
      }

      const { data, error } = await supabase.auth.admin.createUser({
        id: user.id,
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          created_by: 'bulk_recovery_script',
          created_at: new Date().toISOString(),
        },
      });

      if (error) throw error;

      if (data?.user) {
        console.log(`   ✅ ${email} | Pass: ${tempPassword}`);
        results.success.push({ id: user.id, name: user.name, email: email, password: tempPassword });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ ${errorMsg}`);
      results.failed.push({ id: user.id, name: user.name, error: errorMsg });
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ BERHASIL: ${results.success.length}/${orphanedUsers.length}`);
  console.log(`❌ GAGAL: ${results.failed.length}/${orphanedUsers.length}`);
  console.log(`${'='.repeat(70)}\n`);

  if (results.success.length > 0) {
    console.log('📝 USER BARU (SAVE INI!):\n');
    results.success.forEach((u) => {
      console.log(`   ${u.name.padEnd(30)} | ${u.email} | ${u.password || 'existing'}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n⚠️ GAGAL:\n');
    results.failed.forEach((u) => {
      console.log(`   ${u.name}: ${u.error}`);
    });
  }

  return results;
}

bulkCreateAuthUsers().catch(console.error);