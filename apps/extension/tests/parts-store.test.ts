import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { PartsStore, type RecordingPart } from '../src/parts-store.js';

describe('PartsStore IndexedDB', () => {
  let store: PartsStore;

  beforeEach(() => {
    store = new PartsStore(indexedDB);
  });

  afterEach(async () => {
    await store.close();
  });

  it('saves parts and retrieves them in partIndex order', async () => {
    const dummyBlob0 = new Uint8Array([1, 2, 3]).buffer;
    const dummyBlob1 = new Uint8Array([4, 5, 6]).buffer;
    const dummyBlob2 = new Uint8Array([7, 8, 9]).buffer;

    // Save out of order to verify sorting
    await store.savePart({ recordingId: 'rec-1', partIndex: 2, blob: dummyBlob2 });
    await store.savePart({ recordingId: 'rec-1', partIndex: 0, blob: dummyBlob0 });
    await store.savePart({ recordingId: 'rec-1', partIndex: 1, blob: dummyBlob1 });

    const parts = await store.getAllParts('rec-1');
    expect(parts.length).toBe(3);
    expect(parts[0].partIndex).toBe(0);
    expect(parts[1].partIndex).toBe(1);
    expect(parts[2].partIndex).toBe(2);
    expect(parts[0].status).toBe('pending');
  });

  it('filters pending parts', async () => {
    await store.savePart({ recordingId: 'rec-2', partIndex: 0, blob: new Uint8Array([1]).buffer });
    await store.savePart({ recordingId: 'rec-2', partIndex: 1, blob: new Uint8Array([2]).buffer });

    let pending = await store.getPendingParts('rec-2');
    expect(pending.length).toBe(2);

    await store.updatePartStatus('rec-2:0', 'uploaded');

    pending = await store.getPendingParts('rec-2');
    expect(pending.length).toBe(1);
    expect(pending[0].partIndex).toBe(1);
  });

  it('increments retry attempts and records errors', async () => {
    await store.savePart({ recordingId: 'rec-3', partIndex: 0, blob: new Uint8Array([1]).buffer });

    await store.incrementAttempts('rec-3:0', 'HTTP 500 error');
    let part = await store.getPart('rec-3:0');
    expect(part?.attempts).toBe(1);
    expect(part?.error).toBe('HTTP 500 error');
    expect(part?.status).toBe('failed');

    await store.incrementAttempts('rec-3:0', 'Network failure');
    part = await store.getPart('rec-3:0');
    expect(part?.attempts).toBe(2);
    expect(part?.error).toBe('Network failure');
  });

  it('deletes part only when deletePart is called (simulating 2xx response)', async () => {
    await store.savePart({ recordingId: 'rec-4', partIndex: 0, blob: new Uint8Array([1]).buffer });

    let part = await store.getPart('rec-4:0');
    expect(part).toBeDefined();

    // After 2xx
    await store.deletePart('rec-4:0');

    part = await store.getPart('rec-4:0');
    expect(part).toBeUndefined();
  });

  it('clears all parts for a recording', async () => {
    await store.savePart({ recordingId: 'rec-5', partIndex: 0, blob: new Uint8Array([1]).buffer });
    await store.savePart({ recordingId: 'rec-5', partIndex: 1, blob: new Uint8Array([2]).buffer });
    await store.savePart({ recordingId: 'other-rec', partIndex: 0, blob: new Uint8Array([3]).buffer });

    await store.clearParts('rec-5');

    const rec5Parts = await store.getAllParts('rec-5');
    expect(rec5Parts.length).toBe(0);

    const otherParts = await store.getAllParts('other-rec');
    expect(otherParts.length).toBe(1);
  });
});
