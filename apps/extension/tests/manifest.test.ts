import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateManifest, getHostPermissionFromUrl } from '../vite.config.js';

describe('Manifest MV3 Validation', () => {
  const rootManifestPath = path.resolve(__dirname, '../manifest.json');
  const rawManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'));

  it('validates manifest_version is exactly 3', () => {
    expect(rawManifest.manifest_version).toBe(3);
  });

  it('validates permissions strictly contain only allowed permissions', () => {
    const allowed = ['tabCapture', 'offscreen', 'storage', 'activeTab'];
    expect(rawManifest.permissions).toEqual(expect.arrayContaining(allowed));
    expect(rawManifest.permissions.length).toBe(allowed.length);
    for (const perm of rawManifest.permissions) {
      expect(allowed).toContain(perm);
    }
  });

  it('validates host permissions are correctly generated from API origin', () => {
    const perm1 = getHostPermissionFromUrl('http://localhost:8080');
    expect(perm1).toBe('http://localhost:8080/*');

    const perm2 = getHostPermissionFromUrl('https://api.mindspace.com/v1');
    expect(perm2).toBe('https://api.mindspace.com/*');

    const generated = generateManifest(rawManifest, 'http://localhost:8080');
    expect(generated.host_permissions).toEqual(['http://localhost:8080/*']);
    expect(generated.background.service_worker).toBe('background.js');
    expect(generated.background.type).toBe('module');
  });

  it('does not contain any deprecated MV2 fields', () => {
    expect(rawManifest.browser_action).toBeUndefined();
    expect(rawManifest.page_action).toBeUndefined();
    expect(rawManifest.background.scripts).toBeUndefined();
  });

  it('has valid action with default_popup pointing to popup.html', () => {
    expect(rawManifest.action).toBeDefined();
    expect(rawManifest.action.default_popup).toBe('popup.html');
  });

  it('validates built manifest in dist if present', () => {
    const distManifestPath = path.resolve(__dirname, '../dist/manifest.json');
    if (fs.existsSync(distManifestPath)) {
      const distManifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8'));
      expect(distManifest.manifest_version).toBe(3);
      expect(distManifest.permissions).toEqual([
        'tabCapture',
        'offscreen',
        'storage',
        'activeTab',
      ]);
      expect(distManifest.background.service_worker).toBe('background.js');
      expect(distManifest.action.default_popup).toBe('popup.html');
    }
  });
});
