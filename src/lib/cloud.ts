import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// The single account permitted to write annotations. This must match the
// email used in the Supabase row-level-security policy on `public.annotations`.
export const OWNER_EMAIL = 'stevenytc@gmail.com';

export type AnnotationKind = 'bookmarks' | 'drawings' | 'history' | 'session';

export function isOwner(session: Session | null): boolean {
  return !!session && session.user.email === OWNER_EMAIL;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Subscribe to auth state. Returns an unsubscribe function.
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    // Return to the app's base path after the Google round-trip.
    options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
  });
}

export async function signOut(): Promise<void> {
  if (supabase) await supabase.auth.signOut();
}

// Pull every annotation kind for a book. Reads are public (RLS allows select
// for everyone), so this works whether or not the visitor is signed in.
// Returns a partial map keyed by kind, or null on failure / not configured.
export async function pullBook(
  bookId: string,
): Promise<Partial<Record<AnnotationKind, unknown>> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('annotations')
    .select('kind, data')
    .eq('book_id', bookId);
  if (error) {
    console.warn('Cloud pull failed:', error.message);
    return null;
  }
  const out: Partial<Record<AnnotationKind, unknown>> = {};
  for (const row of data ?? []) {
    out[row.kind as AnnotationKind] = row.data;
  }
  return out;
}

// Upsert one annotation kind. Only succeeds for the owner (enforced by RLS);
// for anyone else the request is rejected server-side and we just log it.
export async function pushAnnotation(
  userId: string,
  bookId: string,
  kind: AnnotationKind,
  data: unknown,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('annotations').upsert(
    {
      user_id: userId,
      book_id: bookId,
      kind,
      data: data as object,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,book_id,kind' },
  );
  if (error) console.warn(`Cloud push failed (${kind}):`, error.message);
}
