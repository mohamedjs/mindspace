export const queryKeys = {
  spaces: {
    all: ['spaces'] as const,
    detail: (id: string) => ['spaces', id] as const,
  },
  notes: {
    bySpace: (spaceId: string) => ['notes', spaceId] as const,
    detail: (id: string) => ['notes', 'detail', id] as const,
  },
  credits: {
    balance: ['credits', 'balance'] as const,
    ledger: ['credits', 'ledger'] as const,
  },
  recordings: {
    bySpace: (spaceId: string) => ['recordings', spaceId] as const,
  },
  models: {
    all: ['models'] as const,
  },
};
