"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProfileView from "@/components/profile/ProfileView";

export default function MyProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user) setUserId(d.user.id); });
  }, []);

  if (!userId) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="h-40 rounded-3xl bg-white animate-pulse border border-slate-100" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ProfileView userId={userId} />
    </DashboardLayout>
  );
}