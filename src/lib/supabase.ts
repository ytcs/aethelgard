import { createClient } from '@supabase/supabase-js';

// Read at build time. Safe to ship: the publishable/anon key is a public
// client key — write access is enforced server-side by row-level security,
// not by keeping this key secret.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When env vars are absent (e.g. a fork without credentials) the app still
// runs fully offline against localStorage; `supabase` is simply null.
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isCloudConfigured = !!supabase;
