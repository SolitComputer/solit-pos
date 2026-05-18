"use client";

import Link
from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  usePathname,
} from "next/navigation";

export default function Sidebar() {

  const pathname =
    usePathname();

  const [
    user,
    setUser,
  ] =
    useState<any>();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser =
    async () => {

      const response =
        await fetch(
          "/api/auth/me"
        );

      const result =
        await response.json();

      setUser(
        result.user
      );
    };

  const handleLogout =
    async () => {

      await fetch(
        "/api/auth/logout",
        {
          method:
            "POST",
        }
      );

      window.location.href =
        "/login";
    };

  const adminMenus = [
    {
      name:
        "Dashboard",
      href:
        "/dashboard",
    },

    {
      name:
        "Riwayat",
      href:
        "/dashboard/transactions",
    },

    {
      name:
        "Data Laptop",
      href:
        "/dashboard/laptops",
    },

    {
      name:
        "Tambah Laptop",
      href:
        "/dashboard/laptops/create",
    },

    {
      name:
        "Buat Payment",
      href:
        "/payment/create",
    },
  ];

  const salesMenus = [
    {
      name:
        "Buat Payment",
      href:
        "/payment/create",
    },

    {
      name:
        "Riwayat",
      href:
        "/dashboard/transactions",
    },
  ];

  const menus =
    user?.role ===
    "ADMIN"
      ? adminMenus
      : salesMenus;

  return (
    <aside className="w-72 bg-white border-r min-h-screen p-5 flex flex-col">

      {/* USER */}
      <div className="mb-8">

        <h1 className="text-2xl font-bold">
          Solit POS
        </h1>

        <p className="text-slate-500 text-sm">
          {
            user?.name
          }
        </p>

        <p className="text-xs text-slate-400">
          {
            user?.role
          }
        </p>
      </div>

      {/* MENU */}
      <div className="space-y-2 flex-1">

        {menus?.map(
          (
            item:
              any
          ) => {

            const isActive =
              pathname ===
              item.href;

            return (
              <Link
                key={
                  item.href
                }
                href={
                  item.href
                }
                className={`
                  block rounded-2xl px-4 py-3 font-medium
                  ${
                    isActive
                      ? "bg-black text-white"
                      : "hover:bg-slate-100"
                  }
                `}
              >
                {
                  item.name
                }
              </Link>
            );
          }
        )}
      </div>

      {/* LOGOUT */}
      <button
        onClick={
          handleLogout
        }
        className="
          bg-red-500
          text-white
          rounded-2xl
          h-12
          font-semibold
        "
      >
        Logout
      </button>

    </aside>
  );
}