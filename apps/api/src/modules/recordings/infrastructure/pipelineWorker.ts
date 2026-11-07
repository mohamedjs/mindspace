import { sql } from 'kysely';
import type { Database } from '../../../platform/db.js';
import type { ProcessRecordingJobUseCase } from '../application/processRecordingJob.js';
import type { RecordingEventsPort } from '../domain/ports.js';

export const ADVISORY_LOCK_MONTHLY_REFILL = 910_001;
export const ADVISORY_LOCK_RESERVATION_SWEEP = 910_002;
export const ADVISORY_LOCK_SUBSCRIPTION_EXPIRY = 910_003;
export const ADVISORY_LOCK_UNFINISHED_RECORDINGS = 910_004;

export interface WorkerMaintenanceCallbacks {
  monthlyRefill?: (tx: unknown) => Promise<number>;
  sweepExpiredReservations?: (
    tx: unknown
  ) => Promise<{ releasedCount: number; affectedUserIds: string[] }>;
  expireSubscriptions?: (
    now?: Date,
    tx?: unknown
  ) => Promise<{ expiredCount: number; affectedUserIds: string[] }>;
}

export interface PipelineWorkerOptions {
  db?: Database;
  jobUseCase: ProcessRecordingJobUseCase;
  eventsPort: RecordingEventsPort;
  maintenance?: WorkerMaintenanceCallbacks;
  maxConcurrentJobs?: number;
  pollIntervalMs?: number;
  sweepIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

export class PipelineWorker {
  private readonly db?: Database;
  private readonly jobUseCase: ProcessRecordingJobUseCase;
  private readonly eventsPort: RecordingEventsPort;
  private maintenance: WorkerMaintenanceCallbacks;
  private readonly maxConcurrentJobs: number;
  private readonly pollIntervalMs: number;
  private readonly sweepIntervalMs: number;
  private readonly shutdownTimeoutMs: number;

  private running = false;
  private stopping = false;
  private abortController = new AbortController();
  private pollTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private wakeSubscription: { unsubscribe: () => Promise<void> } | null = null;
  private readonly activeJobs = new Set<Promise<void>>();
  private pumping = false;

  constructor(options: PipelineWorkerOptions) {
    this.db = options.db;
    this.jobUseCase = options.jobUseCase;
    this.eventsPort = options.eventsPort;
    this.maintenance = options.maintenance ?? {};
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 32;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30_000;
  }

  setMaintenance(maintenance: WorkerMaintenanceCallbacks): void {
    this.maintenance = { ...this.maintenance, ...maintenance };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this.abortController = new AbortController();

    this.wakeSubscription = await this.eventsPort.subscribeWake(() => {
      void this.pump();
    });

    this.pollTimer = setInterval(() => {
      void this.pump();
    }, this.pollIntervalMs);

    this.sweepTimer = setInterval(() => {
      void this.runMaintenanceCycle().catch(() => {});
    }, this.sweepIntervalMs);

    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.stopping) return;
    this.pumping = true;

    try {
      while (
        !this.stopping &&
        !this.abortController.signal.aborted &&
        this.activeJobs.size < this.maxConcurrentJobs
      ) {
        let claimedAny = false;
        const jobPromise = (async () => {
          claimedAny = await this.jobUseCase.claimAndProcessNext(this.abortController.signal);
        })();

        this.activeJobs.add(jobPromise);
        jobPromise.finally(() => {
          this.activeJobs.delete(jobPromise);
          if (!this.stopping && !this.abortController.signal.aborted && claimedAny) {
            void this.pump();
          }
        });

        await jobPromise;
        if (!claimedAny) {
          break;
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /**
   * Claims and runs one queued job synchronously (useful for deterministic tests).
   */
  async runOnce(signal?: AbortSignal): Promise<boolean> {
    const effectiveSignal = signal ?? this.abortController.signal;
    const task = this.jobUseCase.claimAndProcessNext(effectiveSignal);
    const wrapped = task.then(() => {});
    this.activeJobs.add(wrapped);
    try {
      return await task;
    } finally {
      this.activeJobs.delete(wrapped);
    }
  }

  /**
   * Runs queued jobs until none remain.
   */
  async drain(): Promise<number> {
    let count = 0;
    while (!this.abortController.signal.aborted) {
      const processed = await this.runOnce();
      if (!processed) break;
      count++;
    }
    return count;
  }

  /**
   * Sweeps stale jobs idle for longer than idleThresholdMs (default 15m).
   */
  async sweep(idleThresholdMs?: number): Promise<{ requeued: number; failed: number }> {
    return this.jobUseCase.sweepStaleJobs(idleThresholdMs);
  }

  private async withAdvisoryLock<T>(
    lockId: number,
    fn: (tx: unknown) => Promise<T>
  ): Promise<{ acquired: boolean; result: T | null }> {
    if (!this.db) {
      const result = await fn(undefined);
      return { acquired: true, result };
    }

    return this.db.transaction().execute(async (tx) => {
      const lockRes = await sql<{ acquired: boolean }>`
        SELECT (pg_try_advisory_lock(${lockId}) AND pg_try_advisory_xact_lock(${lockId})) AS acquired
      `.execute(tx);

      if (!lockRes.rows[0]?.acquired) {
        return { acquired: false, result: null };
      }

      try {
        const result = await fn(tx);
        return { acquired: true, result };
      } finally {
        await sql`SELECT pg_advisory_unlock(${lockId})`.execute(tx).catch(() => {});
      }
    });
  }

  async runMonthlyRefill(): Promise<{ acquired: boolean; refilledCount: number }> {
    if (!this.maintenance.monthlyRefill) {
      return { acquired: false, refilledCount: 0 };
    }
    const { acquired, result } = await this.withAdvisoryLock(
      ADVISORY_LOCK_MONTHLY_REFILL,
      (tx) => this.maintenance.monthlyRefill!(tx)
    );
    return { acquired, refilledCount: result ?? 0 };
  }

  async runReservationSweep(): Promise<{
    acquired: boolean;
    releasedCount: number;
    affectedUserIds: string[];
  }> {
    if (!this.maintenance.sweepExpiredReservations) {
      return { acquired: false, releasedCount: 0, affectedUserIds: [] };
    }
    const { acquired, result } = await this.withAdvisoryLock(
      ADVISORY_LOCK_RESERVATION_SWEEP,
      (tx) => this.maintenance.sweepExpiredReservations!(tx)
    );
    return {
      acquired,
      releasedCount: result?.releasedCount ?? 0,
      affectedUserIds: result?.affectedUserIds ?? [],
    };
  }

  async runSubscriptionExpiry(now?: Date): Promise<{
    acquired: boolean;
    expiredCount: number;
    affectedUserIds: string[];
  }> {
    if (!this.maintenance.expireSubscriptions) {
      return { acquired: false, expiredCount: 0, affectedUserIds: [] };
    }
    const { acquired, result } = await this.withAdvisoryLock(
      ADVISORY_LOCK_SUBSCRIPTION_EXPIRY,
      (tx) => this.maintenance.expireSubscriptions!(now, tx)
    );
    return {
      acquired,
      expiredCount: result?.expiredCount ?? 0,
      affectedUserIds: result?.affectedUserIds ?? [],
    };
  }

  async runUnfinishedRecordingsSweep(
    maxAgeMs = 24 * 60 * 60 * 1000
  ): Promise<{ acquired: boolean; sweptRecordings: number; deletedParts: number }> {
    const { acquired, result } = await this.withAdvisoryLock(
      ADVISORY_LOCK_UNFINISHED_RECORDINGS,
      (tx) => this.jobUseCase.sweepUnfinishedRecordings(maxAgeMs, tx)
    );
    return {
      acquired,
      sweptRecordings: result?.sweptRecordings ?? 0,
      deletedParts: result?.deletedParts ?? 0,
    };
  }

  async runMaintenanceCycle(): Promise<void> {
    await this.jobUseCase.sweepStaleJobs().catch(() => {});
    await this.runReservationSweep().catch(() => {});
    await this.runSubscriptionExpiry().catch(() => {});
    await this.runMonthlyRefill().catch(() => {});
    await this.runUnfinishedRecordingsSweep().catch(() => {});
  }

  /**
   * Graceful shutdown: stops claiming and waits up to 30 seconds for in-flight jobs.
   */
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.wakeSubscription) {
      await this.wakeSubscription.unsubscribe().catch(() => {});
      this.wakeSubscription = null;
    }

    if (this.activeJobs.size > 0) {
      await Promise.race([
        Promise.allSettled([...this.activeJobs]),
        new Promise<void>((resolve) => setTimeout(resolve, this.shutdownTimeoutMs)),
      ]);
    }
  }

  /**
   * Simulates an abrupt worker crash (SIGKILL): immediately aborts in-flight work
   * without marking claimed jobs failed, leaving them for the sweeper.
   */
  async kill(): Promise<void> {
    this.stopping = true;
    this.running = false;
    this.abortController.abort(new Error('Worker killed'));

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.wakeSubscription) {
      await this.wakeSubscription.unsubscribe().catch(() => {});
      this.wakeSubscription = null;
    }

    await Promise.allSettled([...this.activeJobs]);
  }
}
