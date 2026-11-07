import type { Repositories } from '../core/ports/container';
import { apiNoteRepository } from './api/noteRepository';
import {
  apiAccountRepository,
  apiBillingRepository,
  apiCreditRepository,
  apiGroupRepository,
  apiKeyRepository,
  apiModelRepository,
  apiRecordingRepository,
  apiSpaceRepository,
} from './api/repositories';
import { apiFunctions } from './api/functions';
import { apiAuth } from './api/auth';
import { apiRealtime } from './api/realtime';
import { apiStorage } from './api/storage';

export const container: Repositories = {
  notes: apiNoteRepository,
  spaces: apiSpaceRepository,
  groups: apiGroupRepository,
  recordings: apiRecordingRepository,
  credits: apiCreditRepository,
  models: apiModelRepository,
  account: apiAccountRepository,
  keys: apiKeyRepository,
  billing: apiBillingRepository,
  auth: apiAuth,
  storage: apiStorage,
  realtime: apiRealtime,
  functions: apiFunctions,
};
