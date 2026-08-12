import type {
  AccountRepository,
  AuthPort,
  BillingRepository,
  CreditRepository,
  FunctionsPort,
  GroupRepository,
  KeyRepository,
  ModelRepository,
  NoteRepository,
  RealtimePort,
  RecordingRepository,
  SpaceRepository,
  StoragePort,
} from './index';

/**
 * Everything the app can reach outside itself, in one bag.
 *
 * A single object rather than a service locator with string keys: this way a
 * missing implementation is a type error at wiring time, not a crash the first
 * time some screen happens to open.
 */
export interface Repositories {
  notes: NoteRepository;
  spaces: SpaceRepository;
  groups: GroupRepository;
  recordings: RecordingRepository;
  credits: CreditRepository;
  models: ModelRepository;
  account: AccountRepository;
  keys: KeyRepository;
  billing: BillingRepository;
  auth: AuthPort;
  storage: StoragePort;
  realtime: RealtimePort;
  functions: FunctionsPort;
}
