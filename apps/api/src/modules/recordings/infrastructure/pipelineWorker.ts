import type { ProcessRecordingJobUseCase } from '../application/processRecordingJob.js';
import type { RecordingEventsPort } from '../domain/ports.js';

export interface PipelineWorkerOptions {
  jobUseCase: ProcessRecordingJobUseCase;
  eventsPort: RecordingEventsPort;
  maxConcurrentJobs?: number;
  pollIntervalMs?: number;
  sweepIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

export class PipelineWorker {
  private readonly jobUseCase: ProcessRecordingJobUseCase;
  private readonly eventsPort: RecordingEventsPort;
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
    this.jobUseCase = options.jobUseCase;
    this.eventsPort = options.eventsPort;
    this.maxConcurrentJobs = options.maxConcurrentJobs ?? 32;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30_000;
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
      void this.jobUseCase.sweepStaleJobs().catch(() => {});
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
