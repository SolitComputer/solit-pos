"use client";

import {
  useState,
} from "react";

export default function Page() {

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const handleLogin =
    async () => {
      try {

        setLoading(
          true
        );

        const response =
          await fetch(
            "/api/auth/login",
            {
              method:
                "POST",

              credentials:
                "include",

              headers:
              {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    email,
                    password,
                  }
                ),
            }
          );

        const result =
          await response.json();

        console.log(result);

        console.log(
          "LOGIN RESULT:",
          result
        );

        if (
          !result.success
        ) {
          alert(
            result.message
          );

          return;
        }

        // KASIH DELAY BENTAR
        setTimeout(() => {

          if (
            result.user
              ?.role ===
            "ADMIN"
          ) {
            window.location.href =
              "/dashboard";
          }

          else if (
            result.user
              ?.role ===
            "SALES"
          ) {
            window.location.href =
              "/payment/create";
          }

        }, 500);

      } catch (
      error
      ) {

        console.log(
          error
        );

        alert(
          "Terjadi kesalahan"
        );

      } finally {

        setLoading(
          false
        );
      }
    };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">

      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md">

        <h1 className="text-3xl font-bold mb-2">
          Login Solit POS
        </h1>

        <p className="text-slate-500 mb-6">
          Masuk ke akun
        </p>

        <div className="space-y-4">

          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-2xl h-12 px-4"
            value={
              email
            }
            onChange={(
              e
            ) =>
              setEmail(
                e.target
                  .value
              )
            }
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border rounded-2xl h-12 px-4"
            value={
              password
            }
            onChange={(
              e
            ) =>
              setPassword(
                e.target
                  .value
              )
            }
          />

          <button
            onClick={
              handleLogin
            }
            disabled={
              loading
            }
            className="w-full bg-black text-white rounded-2xl h-12 font-semibold"
          >
            {loading
              ? "Loading..."
              : "Login"}
          </button>
        </div>
      </div>
    </main>
  );
}