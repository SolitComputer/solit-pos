// Checklist tes kondisi untuk barang kategori Laptop & Monitor. Dipakai di
// form Tambah/Edit Barang (client) dan API laptops (server), jadi file ini
// sengaja TIDAK meng-import apa pun yang server-only.

export const CONDITION_CHECK_ITEMS = [
    { key: "bh_wl", label: "BH/WL" },
    { key: "key", label: "Key Test" },
    { key: "lcd", label: "LCD Test" },
    { key: "cam", label: "Cam Test" },
    { key: "mic", label: "Mic Test" },
    { key: "usb", label: "USB Test" },
    { key: "finger", label: "Finger Test" },
    { key: "cas", label: "Cas Test" },
    { key: "tp", label: "TP Test" },
    { key: "body", label: "Body Test" },
    { key: "speaker", label: "Speaker Test" },
    { key: "bluetooth", label: "Bluetooth Test" },
    { key: "hdmi", label: "HDMI Test" },
    { key: "wifi", label: "Wifi Test" },
] as const;

export type ConditionCheckKey = (typeof CONDITION_CHECK_ITEMS)[number]["key"];
export type ConditionCheckResult = "OKE" | "TIDAK_OKE";
export interface ConditionCheckEntry {
    result: ConditionCheckResult | null;
    note: string;
}
export type ConditionChecks = Partial<Record<ConditionCheckKey, ConditionCheckEntry>>;

const NOTE_MAX_LENGTH = 500;
const VALID_KEYS = new Set<string>(CONDITION_CHECK_ITEMS.map(i => i.key));

// Checklist cuma muncul untuk kategori Laptop & Monitor (bukan PC / kategori
// lain yang kebetulan satu keluarga LAPTOP).
export function isConditionCheckCategory(categoryName?: string | null): boolean {
    const name = (categoryName ?? "").trim().toUpperCase();
    return name.includes("LAPTOP") || name.includes("MONITOR");
}

// Bersihkan input dari client/DB: buang key asing, hasil yang tidak valid,
// dan entry kosong (tanpa hasil & tanpa note).
export function sanitizeConditionChecks(input: unknown): ConditionChecks {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const out: ConditionChecks = {};
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
        if (!VALID_KEYS.has(key) || !raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const result = entry.result === "OKE" || entry.result === "TIDAK_OKE" ? entry.result : null;
        const note = typeof entry.note === "string" ? entry.note.trim().slice(0, NOTE_MAX_LENGTH) : "";
        if (!result && !note) continue;
        out[key as ConditionCheckKey] = { result, note };
    }
    return out;
}
