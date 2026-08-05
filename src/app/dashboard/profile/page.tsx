"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProfileView from "@/components/profile/ProfileView";
import { getAuthUser } from "@/hooks/useAuthUser";

export default function MyProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getAuthUser().then(u => ({ success: true, user: u }))
      .then((d) => { if (d.user) setUserId(d.user.id); });
  }, []);

  if (!userId) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
          <div className="rounded-2xl sm:rounded-3xl bg-white border border-slate-100 shadow-sm p-5 sm:p-6 lg:p-8 animate-pulse">
            {/* Header: avatar + nama + role */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-slate-200 shrink-0" />
              <div className="flex-1 w-full flex flex-col items-center sm:items-start gap-2.5">
                <div className="h-5 sm:h-6 w-40 sm:w-56 rounded-full bg-slate-200" />
                <div className="h-4 w-28 sm:w-36 rounded-full bg-slate-200" />
                <div className="h-3 w-48 sm:w-64 rounded-full bg-slate-100" />
              </div>
            </div>

            {/* Info grid singkat */}
            <div className="mt-6 sm:mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="h-16 sm:h-20 rounded-2xl bg-slate-100" />
              <div className="h-16 sm:h-20 rounded-2xl bg-slate-100" />
              <div className="h-16 sm:h-20 rounded-2xl bg-slate-100 col-span-2 sm:col-span-1" />
            </div>
          </div>
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