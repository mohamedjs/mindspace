import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_DIR = __dirname;

function getAllTsFiles(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return getAllTsFiles(full);
      return /\.(ts)$/.test(entry) && !entry.endsWith('.test.ts') ? [full] : [];
    });
  } catch {
    return [];
  }
}

export function extractImports(fileContent: string): string[] {
  const imports: string[] = [];
  const regex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  for (const match of fileContent.matchAll(regex)) {
    imports.push(match[1]);
  }
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of fileContent.matchAll(dynamicRegex)) {
    imports.push(match[1]);
  }
  return imports;
}

// -------------------------------------------------------------
// Rule 1: domain imports nothing outside itself
// -------------------------------------------------------------
export function checkDomainRule(relativeFilePath: string, imports: string[]): string[] {
  const normalized = relativeFilePath.replace(/\\/g, '/');
  const match = normalized.match(/^modules\/([^/]+)\/domain\//);
  if (!match) return [];

  const violations: string[] = [];
  for (const imp of imports) {
    if (imp.startsWith('node:')) continue;
    // Relative imports must remain inside domain/
    if (imp.startsWith('.')) {
      if (imp.includes('../application') || imp.includes('../infrastructure') || imp.includes('../presentation') || imp.includes('../../')) {
        violations.push(`domain file ${normalized} imports outside domain: ${imp}`);
      }
    } else {
      // Non-relative imports inside the project
      if (imp.startsWith('@mindspace/api') || imp.includes('platform/') || imp.includes('modules/')) {
        violations.push(`domain file ${normalized} imports external layer: ${imp}`);
      }
    }
  }
  return violations;
}

// -------------------------------------------------------------
// Rule 2: application imports its own domain and platform/clock only
// -------------------------------------------------------------
export function checkApplicationRule(relativeFilePath: string, imports: string[]): string[] {
  const normalized = relativeFilePath.replace(/\\/g, '/');
  const match = normalized.match(/^modules\/([^/]+)\/application\//);
  if (!match) return [];

  const moduleName = match[1];
  const violations: string[] = [];

  for (const imp of imports) {
    if (imp.startsWith('node:') || imp === '@mindspace/contracts') continue;

    // Disallowed: forbidden layers
    if (imp.includes('infrastructure') || imp.includes('presentation')) {
      violations.push(`application file ${normalized} imports forbidden layer: ${imp}`);
      continue;
    }

    // Allowed: relative import to its own domain
    if (imp.startsWith('../domain') || imp.startsWith('./')) {
      continue;
    }

    // Allowed: platform/clock
    if (imp.includes('platform/clock') || imp.endsWith('/clock.js') || imp.endsWith('/clock')) {
      continue;
    }

    // Disallowed: anything else from platform or other modules
    if (imp.includes('platform/') || imp.includes('modules/')) {
      violations.push(`application file ${normalized} imports unauthorized dependency: ${imp}`);
    }
  }
  return violations;
}

// -------------------------------------------------------------
// Rule 3: A module imports another only through ports wired in composition.ts
// -------------------------------------------------------------
export function checkCrossModuleRule(relativeFilePath: string, imports: string[]): string[] {
  const normalized = relativeFilePath.replace(/\\/g, '/');
  const match = normalized.match(/^modules\/([^/]+)\//);
  if (!match) return [];

  const currentModule = match[1];
  const violations: string[] = [];

  for (const imp of imports) {
    // Check if importing another module's internals
    const otherModuleMatch = imp.match(/modules\/([^/]+)/);
    if (otherModuleMatch && otherModuleMatch[1] !== currentModule) {
      violations.push(`module ${currentModule} directly imports module ${otherModuleMatch[1]}: ${imp}`);
    }

    // Relative escape to other module
    if (imp.startsWith('../../') || imp.startsWith('../../../')) {
      const parts = normalize(join(dirname(normalized), imp)).replace(/\\/g, '/');
      const targetMatch = parts.match(/^modules\/([^/]+)/);
      if (targetMatch && targetMatch[1] !== currentModule) {
        violations.push(`module ${currentModule} directly imports module ${targetMatch[1]}: ${imp}`);
      }
    }
  }
  return violations;
}

// -------------------------------------------------------------
// Rule 4: Only credits/infrastructure may write credits_balance or credits_reserved
// -------------------------------------------------------------
export function checkCreditsWriteRule(relativeFilePath: string, content: string): string[] {
  const normalized = relativeFilePath.replace(/\\/g, '/');
  const isCreditsInfra = normalized.startsWith('modules/credits/infrastructure/');
  if (isCreditsInfra) return [];

  const violations: string[] = [];
  const writesBalance = /(?:set|update)[\s\S]*?credits_balance/i.test(content) ||
    /credits_balance\s*=/i.test(content);
  const writesReserved = /(?:set|update)[\s\S]*?credits_reserved/i.test(content) ||
    /credits_reserved\s*=/i.test(content);

  if (writesBalance) {
    violations.push(`File ${normalized} illegally attempts to write credits_balance`);
  }
  if (writesReserved) {
    violations.push(`File ${normalized} illegally attempts to write credits_reserved`);
  }
  return violations;
}

// -------------------------------------------------------------
// Rule 5: User data queries must filter by user_id
// -------------------------------------------------------------
export function checkUserIdFilterRule(querySnippet: string): boolean {
  return /user_id/i.test(querySnippet);
}

describe('Architecture Dependency Rules', () => {
  describe('Rule Enforcement on src/', () => {
    const files = getAllTsFiles(SRC_DIR);

    it('enforces Rule 1 (domain imports nothing outside itself)', () => {
      const allViolations: string[] = [];
      for (const file of files) {
        const rel = relative(SRC_DIR, file);
        const content = readFileSync(file, 'utf8');
        const imports = extractImports(content);
        allViolations.push(...checkDomainRule(rel, imports));
      }
      expect(allViolations).toEqual([]);
    });

    it('enforces Rule 2 (application imports own domain and platform/clock only)', () => {
      const allViolations: string[] = [];
      for (const file of files) {
        const rel = relative(SRC_DIR, file);
        const content = readFileSync(file, 'utf8');
        const imports = extractImports(content);
        allViolations.push(...checkApplicationRule(rel, imports));
      }
      expect(allViolations).toEqual([]);
    });

    it('enforces Rule 3 (no direct cross-module internal imports)', () => {
      const allViolations: string[] = [];
      for (const file of files) {
        const rel = relative(SRC_DIR, file);
        const content = readFileSync(file, 'utf8');
        const imports = extractImports(content);
        allViolations.push(...checkCrossModuleRule(rel, imports));
      }
      expect(allViolations).toEqual([]);
    });

    it('enforces Rule 4 (only credits/infrastructure writes credits)', () => {
      const allViolations: string[] = [];
      for (const file of files) {
        const rel = relative(SRC_DIR, file);
        const content = readFileSync(file, 'utf8');
        allViolations.push(...checkCreditsWriteRule(rel, content));
      }
      expect(allViolations).toEqual([]);
    });
  });

  describe('Fixtures Proving Violation Detection', () => {
    it('detects Rule 1 violation when domain imports platform or infrastructure', () => {
      const fakeDomainFile = 'modules/notes/domain/note.ts';
      const badImports = ['../../platform/db.js', '../infrastructure/repo.js'];
      const violations = checkDomainRule(fakeDomainFile, badImports);
      expect(violations.length).toBe(2);
      expect(violations[0]).toContain('imports outside domain');
      expect(violations[1]).toContain('imports outside domain');
    });

    it('detects Rule 2 violation when application imports infrastructure or other platform', () => {
      const fakeAppFile = 'modules/notes/application/createNote.ts';
      const badImports = ['../infrastructure/noteRepo.js', '../../platform/cache.js'];
      const violations = checkApplicationRule(fakeAppFile, badImports);
      expect(violations.length).toBe(2);
      expect(violations[0]).toContain('imports forbidden layer');
      expect(violations[1]).toContain('imports unauthorized dependency');
    });

    it('detects Rule 3 violation when a module imports another module directly', () => {
      const fakeModuleFile = 'modules/notes/infrastructure/adapter.ts';
      const badImports = ['../../spaces/domain/space.js'];
      const violations = checkCrossModuleRule(fakeModuleFile, badImports);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('directly imports module spaces');
    });

    it('detects Rule 4 violation when non-credits module writes credits_balance or credits_reserved', () => {
      const fakeFile = 'modules/auth/infrastructure/userRepo.ts';
      const badContent = `
        async function updateBalance(userId: string) {
          await db.updateTable('profiles').set({ credits_balance: 50 }).where('id', '=', userId);
        }
      `;
      const violations = checkCreditsWriteRule(fakeFile, badContent);
      expect(violations.length).toBe(1);
      expect(violations[0]).toContain('illegally attempts to write credits_balance');
    });

    it('detects Rule 5 violation when query snippet omits user_id check', () => {
      const invalidQuery = "SELECT * FROM sticky_notes WHERE id = '123'";
      const validQuery = "SELECT * FROM sticky_notes WHERE id = '123' AND user_id = 'abc'";
      expect(checkUserIdFilterRule(invalidQuery)).toBe(false);
      expect(checkUserIdFilterRule(validQuery)).toBe(true);
    });
  });
});
