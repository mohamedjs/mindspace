import type { Repositories } from '../core/ports/container';
import { supabaseNoteRepository } from './supabase/noteRepository';
import {
  supabaseAccountRepository,
  supabaseBillingRepository,
  supabaseCreditRepository,
  supabaseGroupRepository,
  supabaseKeyRepository,
  supabaseModelRepository,
  supabaseRecordingRepository,
  supabaseSpaceRepository,
} from './supabase/repositories';
import { supabaseFunctions } from './supabase/functions';
import { supabaseAuth, supabaseRealtime, supabaseStorage } from './supabase/platform';

/**
 * The one place that decides which implementations the app runs against.
 *
 * Swapping the backing store is a change to this file plus a sibling folder
 * next to ./supabase — nothing above the boundary is touched. A test can build
 * its own Repositories object out of fakes and never start a database.
 */
export const supabaseContainer: Repositories = {
  notes: supabaseNoteRepository,
  spaces: supabaseSpaceRepository,
  groups: supabaseGroupRepository,
  recordings: supabaseRecordingRepository,
  credits: supabaseCreditRepository,
  models: supabaseModelRepository,
  account: supabaseAccountRepository,
  keys: supabaseKeyRepository,
  billing: supabaseBillingRepository,
  auth: supabaseAuth,
  storage: supabaseStorage,
  realtime: supabaseRealtime,
  functions: supabaseFunctions,
};
