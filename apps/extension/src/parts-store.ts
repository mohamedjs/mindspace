export interface RecordingPart {
  id: string;
  recordingId: string;
  partIndex: number;
  blob: Blob | ArrayBuffer;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  error?: string;
}

const DB_NAME = 'mindspace_parts_store';
const STORE_NAME = 'parts';
const DB_VERSION = 1;

export class PartsStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly idbFactory: IDBFactory = globalThis.indexedDB) {}

  public async init(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    if (!this.idbFactory) {
      throw new Error('IndexedDB is not available in the current environment');
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.idbFactory.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('recordingId', 'recordingId', { unique: false });
          store.createIndex('partIndex', 'partIndex', { unique: false });
          store.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  public async savePart(input: {
    recordingId: string;
    partIndex: number;
    blob: Blob | ArrayBuffer;
  }): Promise<RecordingPart> {
    const db = await this.init();
    const id = `${input.recordingId}:${input.partIndex}`;
    const part: RecordingPart = {
      id,
      recordingId: input.recordingId,
      partIndex: input.partIndex,
      blob: input.blob,
      status: 'pending',
      createdAt: Date.now(),
      attempts: 0,
    };

    return new Promise<RecordingPart>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(part);

      req.onsuccess = () => resolve(part);
      req.onerror = () => reject(req.error ?? new Error(`Failed to save part ${id}`));
    });
  }

  public async getPart(id: string): Promise<RecordingPart | undefined> {
    const db = await this.init();
    return new Promise<RecordingPart | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result as RecordingPart | undefined);
      req.onerror = () => reject(req.error ?? new Error(`Failed to get part ${id}`));
    });
  }

  public async getAllParts(recordingId?: string): Promise<RecordingPart[]> {
    const db = await this.init();
    return new Promise<RecordingPart[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        let results = (req.result as RecordingPart[]) || [];
        if (recordingId) {
          results = results.filter((p) => p.recordingId === recordingId);
        }
        // Always return sorted strictly by partIndex ascending
        results.sort((a, b) => a.partIndex - b.partIndex);
        resolve(results);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to get parts'));
    });
  }

  public async getPendingParts(recordingId?: string): Promise<RecordingPart[]> {
    const all = await this.getAllParts(recordingId);
    return all.filter((p) => p.status === 'pending' || p.status === 'uploading' || p.status === 'failed');
  }

  public async updatePartStatus(
    id: string,
    status: RecordingPart['status'],
    error?: string
  ): Promise<void> {
    const db = await this.init();
    const existing = await this.getPart(id);
    if (!existing) return;

    existing.status = status;
    if (error !== undefined) {
      existing.error = error;
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(existing);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`Failed to update part ${id}`));
    });
  }

  public async incrementAttempts(id: string, error?: string): Promise<void> {
    const db = await this.init();
    const existing = await this.getPart(id);
    if (!existing) return;

    existing.attempts += 1;
    existing.lastAttemptAt = Date.now();
    existing.status = 'failed';
    if (error) {
      existing.error = error;
    }

    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(existing);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`Failed to increment attempts for part ${id}`));
    });
  }

  public async deletePart(id: string): Promise<void> {
    const db = await this.init();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`Failed to delete part ${id}`));
    });
  }

  public async clearParts(recordingId: string): Promise<void> {
    const db = await this.init();
    const parts = await this.getAllParts(recordingId);
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const part of parts) {
        store.delete(part.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error(`Failed to clear parts for ${recordingId}`));
    });
  }

  public async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }
}
