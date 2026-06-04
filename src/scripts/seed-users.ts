import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const users = [
  { name: "Rei",    email: "Admin@gmail.com", password: "Rei@Solit25", role: "ADMIN" },
  { name: "Ikmal",  email: "ikmal@gmail.com", password: "ikmal@Solit25", role: "ADMIN" },
  { name: "Fauzan", email: "fauzan@gmail.com", password: "ojan@Solit25", role: "ADMIN" },

  { name: "Salam", email: "salam.kds@solit-pos.com", password: "Salam@Sales25", role: "KEPALA_SALES" },

  { name: "Yulfa", email: "yulfa.crew@solit-pos.com", password: "Yulfa@Crew25", role: "CREW_SALES" },
  { name: "Revin", email: "revin.crew@solit-pos.com", password: "Revin@Crew25", role: "CREW_SALES" },
  { name: "Resti", email: "resti.crew@solit-pos.com", password: "Resti@Crew25", role: "CREW_SALES" },
  { name: "Fitri", email: "fitri.crew@solit-pos.com", password: "Fitri@Crew25", role: "CREW_SALES" },
  { name: "Fatir", email: "fatir.crew@solit-pos.com", password: "Fatir@Crew25", role: "CREW_SALES" },
  { name: "Yuna",  email: "yuna.crew@solit-pos.com",  password: "Yuna@Crew25",  role: "CREW_SALES" },
  { name: "Dicky", email: "dicky.crew@solit-pos.com", password: "Dicky@Crew25", role: "CREW_SALES" },
  { name: "Fadli", email: "fadli.crew@solit-pos.com", password: "Fadli@Crew25", role: "CREW_SALES" },
  { name: "Fikri", email: "fikri.crew@solit-pos.com", password: "Fikri@Crew25", role: "CREW_SALES" },

  { name: "Yoga", email: "yoga.pgb@solit-pos.com", password: "Yoga@Barang25", role: "ADMIN" },
  { name: "Rafi", email: "rafi.pgb@solit-pos.com", password: "Rafi@Barang25", role: "PENGELOLA_BARANG" },

  { name: "Rayhan", email: "rayhan.acc@solit-pos.com", password: "Rayhan@Acc25", role: "ACCOUNTING" },

  { name: "David", email: "david.tek@solit-pos.com", password: "David@Tek25", role: "TEKNISI" },

  { name: "Tengku", email: "tengku.ant@solit-pos.com", password: "Tengku21", role: "PENGANTARAN" },
  { name: "Herry", email: "herry.ant@solit-pos.com", password: "Herry@Ant25", role: "PENGANTARAN" },

  { name: "Alim", email: "alim.mkt@solit-pos.com", password: "Alim@Mkt25", role: "KEPALA_MARKETING" },
  { name: "Adit", email: "adit.mkt@solit-pos.com", password: "Adit@Mkt25", role: "MARKETING" },

  { name: "Achmad Jaelani", email: "jaelani.kbr@solit-pos.com", password: "Jaelani@Kbr25", role: "KEBERSIHAN" },

];

async function seed() {
  console.log("🌱 Mulai seeding users...\n");

  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .in("role", ["OPERATOR", "SALES"]);

  if (deleteError) {
    console.error("❌ Gagal hapus user lama:", deleteError.message);
  } else {
    console.log("🗑️  User lama (OPERATOR/SALES) dihapus\n");
  }

  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (existing) {
      const { error: updateError } = await supabase
        .from("users")
        .update({
          name: user.name,
          role: user.role,
          password: hashedPassword,
        })
        .eq("email", user.email);

      if (updateError) {
        console.error(`❌ Gagal update ${user.email}:`, updateError.message);
      } else {
        console.log(`🔄 Updated  | ${user.role.padEnd(17)} | ${user.email} | Pass: ${user.password}`);
      }
      continue;
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
      })
      .select("id, name, email, role")
      .single();

    if (error) {
      console.error(`❌ Gagal insert ${user.email}:`, error.message);
    } else {
      console.log(`✅ Berhasil | ${data.role.padEnd(17)} | ${data.email} | Pass: ${user.password}`);
    }
  }

  console.log("\n─────────────────────────────────────────────────────────────────");
  console.log("📋 RINGKASAN AKUN:");
  console.log("─────────────────────────────────────────────────────────────────");
  users.forEach((u) => {
    console.log(`  ${u.role.padEnd(17)} | ${u.name.padEnd(8)} | ${u.email.padEnd(30)} | ${u.password}`);
  });
  console.log("─────────────────────────────────────────────────────────────────");
  console.log("\n✨ Seeding selesai!");
  process.exit(0);
}

seed();