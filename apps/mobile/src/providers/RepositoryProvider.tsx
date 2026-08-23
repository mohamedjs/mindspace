import React, { createContext, useContext } from 'react';
import type { Repositories } from '../core/ports/container';
import { supabaseContainer } from '../infrastructure/container';

const RepositoryContext = createContext<Repositories>(supabaseContainer);

/**
 * Makes the repositories reachable from hooks.
 *
 * `value` is overridable so a test — or a future offline/mock mode — can mount
 * the tree against fakes without touching a network. Defaulting to the real
 * container means nothing has to pass it in normal use.
 */
export const RepositoryProvider: React.FC<{
  children: React.ReactNode;
  value?: Repositories;
}> = ({ children, value = supabaseContainer }) => (
  <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>
);

/** The app's only door to the outside world. */
export function useRepositories(): Repositories {
  return useContext(RepositoryContext);
}
