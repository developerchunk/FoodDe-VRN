import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Uses the publishable key (`sb_publishable_…`), the current key format — the
 * legacy anon/service_role JWTs are being discontinued. It is safe in the
 * bundle: it carries no privileges of its own, and row level security decides
 * what it may actually see. The secret key (`sb_secret_…`) must never appear
 * here; it bypasses RLS entirely.
 *
 * Missing configuration does not throw. This module is reached from the header,
 * so throwing here would blank every page over a missing environment variable —
 * turning "the QR lookup is unavailable" into "the site is down". Instead the
 * client is null, callers fall back, and a guest who scanned a code simply sees
 * the plain site rather than their room name.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && publishableKey);

if (!isConfigured && import.meta.env.DEV) {
  console.warn(
    "Supabase is not configured — set VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example). " +
      "The site runs, but QR codes will not resolve to a room.",
  );
}

export const supabase = isConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
