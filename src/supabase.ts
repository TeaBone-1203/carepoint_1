// ============================================================
//  CarePoint — Supabase client (optional persistence layer)
//  Initialized only when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
//  are present in .env; otherwise the app runs against the
//  in-memory store with no network calls.
// ============================================================
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url     = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** True when real Supabase credentials are configured. */
export const supabaseEnabled: boolean = Boolean(url && anonKey);

/** The Supabase client, or null when not configured. */
export const supabase: SupabaseClient | null =
  supabaseEnabled && url && anonKey ? createClient(url, anonKey) : null;