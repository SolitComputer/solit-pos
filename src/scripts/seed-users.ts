import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, 
);

const users = [
  {
    name: "Rafi Solit",
    email: "rafi@solit.com",
    password: "rafi123",
    role: "SALES",
  },
];

async function seed() {
  console.log("🌱 Mulai seeding users...\n");

  for (const user of users) {
    // Cek apakah email sudah ada
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", user.email)
      .single();

    if (existing) {
      console.log(`⏭️  Skip: ${user.email} sudah ada`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);

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
      console.log(`✅ Berhasil: ${data.email} | Role: ${data.role} | ID: ${data.id}`);
    }
  }

  console.log("\n✨ Seeding selesai!");
  process.exit(0);
}

seed();