import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { AuthPort, AuthSession, RealtimePort, StoragePort } from '../../core/ports';
import type { AuthUser } from '../../core/domain';
import { buildStoragePath, extensionFor } from '../../features/voice/services/audioFormat';
import { supabase } from './client';

/**
 * The three capabilities that aren't CRUD: auth, file storage, and live
 * updates. Each is the narrowest surface the app actually uses, so a future
 * backend has a small, honest thing to reimplement rather than a
 * pass-through of the Supabase SDK.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────

function toSession(raw: any): AuthSession | null {
  if (!raw?.user) return null;
  const user: AuthUser = {
    id: raw.user.id,
    email: raw.user.email ?? null,
    fullName: raw.user.user_metadata?.full_name ?? null,
  };
  return { user, accessToken: raw.access_token };
}

export const supabaseAuth: AuthPort = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return toSession(data.session);
  },

  /**
   * Returns a plain unsubscribe function — the provider's Subscription object
   * never crosses the boundary, so callers can't accidentally depend on it.
   */
  onSessionChange(listener) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      listener(toSession(session));
    });
    return () => data.subscription.unsubscribe();
  },

  async signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },

  async signUp(email: string, password: string, fullName?: string) {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: fullName ? { data: { full_name: fullName.trim() } } : undefined,
    });
    if (error) throw error;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  },

  startAutoRefresh() {
    supabase.auth.startAutoRefresh();
  },

  stopAutoRefresh() {
    supabase.auth.stopAutoRefresh();
  },
};

// ─── Storage ──────────────────────────────────────────────────────────────

const BUCKET = 'recordings';
const MAX_ATTEMPTS = 3;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const supabaseStorage: StoragePort = {
  /**
   * Native reads the file into an ArrayBuffer: React Native's FormData uploads
   * 0 bytes to Supabase Storage, so ArrayBuffer is the only path that works.
   * expo-file-system's File API is an unimplemented stub on web, so web
   * fetches the recorder's blob: URI directly and uploads the Blob.
   *
   * This platform branch belongs in the adapter, not the port — a different
   * backend would still face it, but the app above must never see it.
   */
  async uploadRecording({ localUri, userId, spaceId, recordingId }) {
    // Web must read the blob first: only the blob knows which container
    // MediaRecorder actually chose, and the stored extension must match.
    const blob = Platform.OS === 'web' ? await (await fetch(localUri)).blob() : null;
    const body = blob ?? (await new File(localUri).arrayBuffer());

    const { ext, contentType } = extensionFor(Platform.OS, blob?.type);
    const path = buildStoragePath(userId, spaceId, recordingId, ext);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        // ponytail: fixed exponential backoff, no jitter — add jitter if we
        // ever see thundering-herd retries from many clients reconnecting.
        await delay(2 ** attempt * 500);
      }

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType, upsert: true });

      if (!error) {
        // Flip off local_only so the transcribe function can pick it up.
        await supabase
          .from('recordings')
          .update({ local_only: false, storage_path: path, status: 'uploading' })
          .eq('id', recordingId);
        return path;
      }
      lastError = error;
    }

    throw lastError ?? new Error('upload_failed');
  },

  async signedUrl(storagePath: string, expiresInSeconds = 3600) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data) throw error ?? new Error('signed_url_failed');
    return data.signedUrl;
  },
};

// ─── Realtime ─────────────────────────────────────────────────────────────

export const supabaseRealtime: RealtimePort = {
  /**
   * Deliberately narrow. A generic "subscribe to table changes" would drag
   * PostgREST's filter syntax across the boundary — the exact coupling this
   * layer exists to prevent.
   */
  watchRecording(recordingId, onChange) {
    const channel = supabase
      .channel(`recording:${recordingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'recordings',
          filter: `id=eq.${recordingId}`,
        },
        (payload) => {
          const next = payload.new as { status: any; error: string | null };
          onChange({ status: next.status, error: next.error ?? null });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
