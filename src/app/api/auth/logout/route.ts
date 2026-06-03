import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set("token", "", {
    expires: new Date(0),
    path: "/",
  });

  response.cookies.set("face_verified", "", {
    expires: new Date(0),
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });

  response.cookies.set("face_verified", "", {
    expires: new Date(0),
    path: "/",
  });

  return response;
}