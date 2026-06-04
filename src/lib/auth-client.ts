export async function getCurrentUserClient() {
  const res = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
  });
  const data = await res.json();
  return data.success ? data.user : null;
}