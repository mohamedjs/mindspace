import type { AuthPort, AuthSession, RealtimePort, StoragePort } from '../../core/ports';
import type { AuthUser } from '../../core/domain';
import { buildStoragePath } from '../../features/voice/services/audioFormat';
import { supabase } from './client';

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

  startAutoRefresh() {},
  stopAutoRefresh() {},
};

// ─── Storage ──────────────────────────────────────────────────────────────

const BUCKET = 'recordings';
const MAX_ATTEMPTS = 3;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const supabaseStorage: StoragePort = {
  async uploadRecording({ localUri, userId, spaceId, recordingId }) {
    const blob = await (await fetch(localUri)).blob();
    const rawType = (blob.type || '').split(';')[0].trim().toLowerCase();

    // Supabase Storage 'recordings' bucket allowed_mime_types: ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav']
    const allowedTypes = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav'];
    const contentType = allowedTypes.includes(rawType) ? rawType : 'audio/mp4';

    // Derive extension: wav -> wav, mpeg -> mp3, everything else -> m4a
    let ext = 'm4a';
    if (rawType.includes('wav')) ext = 'wav';
    else if (rawType.includes('mpeg') || rawType.includes('mp3')) ext = 'mp3';

    const path = buildStoragePath(userId, spaceId, recordingId, ext);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await delay(2 ** attempt * 500);
      }

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType, upsert: true });

      if (!error) {
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
