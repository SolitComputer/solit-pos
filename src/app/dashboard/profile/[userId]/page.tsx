"use client";

import { use } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProfileView from "@/components/profile/ProfileView";

export default function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  return (
    <DashboardLayout>
      <ProfileView userId={userId} />
    </DashboardLayout>
  );
}