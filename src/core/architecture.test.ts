import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * The boundary that makes this architecture real.
 *
 * Ports and domain types describe intent; nothing stops a hook from importing
 * the Supabase client anyway and quietly re-coupling the app to one database.
 * This test is what stops it. Without an executable rule the separation decays
 * within a few features, and you find out during a migration instead of here.
 *
 * Scoped to src/** on purpose: supabase/functions/** is the server. Those
 * files talk to the database directly and correctly, and are not part of the
 * client's layering.
 */

const SRC = join(__dirname, '..');
const INFRASTRUCTURE = join(SRC, 'infrastructure');

/** Only these may reach for the database driver. */
const FORBIDDEN_IMPORTS = [/@supabase\/supabase-js/, /lib\/supabase\/client/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function importsIn(source: string): string[] {
  // Covers `from '...'`, bare `import '...'`, and `require('...')`.
  const specifiers: string[] = [];
  const patterns = [/from\s+['"]([^'"]+)['"]/g, /require\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

describe('architecture boundary', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.startsWith(INFRASTRUCTURE + sep))
    .filter((file) => !file.endsWith('architecture.test.ts'))
    .filter((file) =>
      importsIn(readFileSync(file, 'utf8')).some((spec) =>
        FORBIDDEN_IMPORTS.some((forbidden) => forbidden.test(spec))
      )
    )
    .map((file) => relative(SRC, file));

  it('keeps the database driver inside src/infrastructure', () => {
    expect(offenders).toEqual([]);
  });

  it('keeps the domain layer free of any framework import', () => {
    const domainDir = join(SRC, 'core');
    const leaked = sourceFiles(domainDir)
      .filter((file) => !file.endsWith('architecture.test.ts'))
      .filter((file) =>
        importsIn(readFileSync(file, 'utf8')).some(
          (spec) =>
            spec.startsWith('@supabase') ||
            spec.startsWith('react') ||
            spec.startsWith('expo') ||
            spec.includes('/infrastructure/') ||
            spec.includes('/features/')
        )
      )
      .map((file) => relative(SRC, file));

    // core/ is the innermost layer: it may not know about React, Expo, the
    // database, or any feature. Everything points inward at it, never out.
    expect(leaked).toEqual([]);
  });
});
