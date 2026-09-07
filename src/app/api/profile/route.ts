import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthUser } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { clearExpiredStoryFields } from "@/lib/expireStories";
import type { EquippedBorder } from "@/lib/solit-coins/types";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_BIO_LENGTH = 280;

async function getHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("userId");
    const targetId = !q || q === "me" ? user.id : q;

    const [{ data, error }, { data: eb }, { data: ebn }] = await Promise.all([
        supabase
            .from("users")
            .select("id, name, role, roles, shift, bio, profile_photo_url, photo_updated_at, banner_url, banner_updated_at, bio_created_at, status_note, status_note_expires_at, song_title, song_artist, song_artwork_url, song_preview_url, song_clip_start, song_expires_at").eq("id", targetId)
            .maybeSingle(),
        supabase
            .from("user_equipped_border")
            .select("border_catalog!inner(id, code, name, tier, style)")
            .eq("user_id", targetId)
            .maybeSingle(),
        supabase
            .from("user_equipped_banner")
            .select("border_catalog!inner(id, code, name, tier, style)")
            .eq("user_id", targetId)
            .maybeSingle(),
    ]);

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ success: false, message: "User tidak ditemukan" }, { status: 404 });
    }

    const ebRaw = (eb as { border_catalog?: EquippedBorder | EquippedBorder[] } | null)?.border_catalog ?? null;
    const equipped_border = Array.isArray(ebRaw) ? (ebRaw[0] ?? null) : ebRaw;
    const ebnRaw = (ebn as { border_catalog?: EquippedBorder | EquippedBorder[] } | null)?.border_catalog ?? null;
    const equipped_banner = Array.isArray(ebnRaw) ? (ebnRaw[0] ?? null) : ebnRaw;

    const { noteExpired, songExpired } = await clearExpiredStoryFields(supabase, data);

    return NextResponse.json({
        success: true,
        data: {
            ...data,
            equipped_border,
            equipped_banner,
            status_note: noteExpired ? null : data.status_note,
            status_note_expires_at: noteExpired ? null : data.status_note_expires_at,
            song_title: songExpired ? null : data.song_title,
            song_artist: songExpired ? null : data.song_artist,
            song_artwork_url: songExpired ? null : data.song_artwork_url,
            song_preview_url: songExpired ? null : data.song_preview_url,
            song_clip_start: songExpired ? 0 : data.song_clip_start,
        },
        isSelf: targetId === user.id,
    });
}

async function putHandler(req: NextRequest, _ctx: any, user: AuthUser) {
    const body = await req.json();
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";

    if (bio.length > MAX_BIO_LENGTH) {
        return NextResponse.json(
            { success: false, message: `Bio maksimal ${MAX_BIO_LENGTH} karakter` },
            { status: 400 }
        );
    }

    const { data: existing } = await supabase
        .from("users")
        .select("bio_created_at")
        .eq("id", user.id)
        .maybeSingle();

    const updates: Record<string, any> = { bio };
    if (bio.length > 0 && !existing?.bio_created_at) {
        updates.bio_created_at = new Date().toISOString();
    }

    const { error } = await supabase.from("users").update(updates).eq("id", user.id);

    if (error) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
    return NextResponse.json({
        success: true,
        data: { bio_created_at: updates.bio_created_at ?? existing?.bio_created_at ?? null },
    });
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(putHandler);