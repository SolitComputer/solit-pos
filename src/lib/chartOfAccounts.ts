// src/lib/chartOfAccounts.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountType = "ASET" | "HUTANG" | "MODAL" | "PEMASUKAN" | "BEBAN";

export interface DbAccount {
    code: string;
    name: string;
    type: AccountType;
}

export async function fetchAllAccounts(supabase: SupabaseClient): Promise<DbAccount[]> {
    const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("code, name, type")
        .order("code", { ascending: true });
    if (error) throw error;
    return (data ?? []) as DbAccount[];
}

export async function getAccountMap(supabase: SupabaseClient): Promise<Map<string, DbAccount>> {
    const accounts = await fetchAllAccounts(supabase);
    return new Map(accounts.map((a) => [a.code, a]));
}

export async function isValidAccountDb(supabase: SupabaseClient, code: string): Promise<boolean> {
    if (!code) return false;
    const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("code")
        .eq("code", code)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}

export async function accountNameDb(supabase: SupabaseClient, code: string): Promise<string> {
    const { data } = await supabase
        .from("chart_of_accounts")
        .select("name")
        .eq("code", code)
        .maybeSingle();
    return data?.name ?? code;
}