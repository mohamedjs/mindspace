import { PartsStore } from './parts-store.js';

export interface MeetingAudioRecorderOptions {
  recordingId: string;
  streamId: string;
  partDurationMs?: number; // Defaults to 5 minutes (300,000 ms)
  partsStore?: PartsStore;
  onPartReady?: (recordingId: string, partIndex: number) => void;
  onStopped?: (recordingId: string, totalParts: number) => void;
  mediaDevices?: MediaDevices;
  audioContextFactory?: () => AudioContext;
  mediaRecorderFactory?: (stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder;
}

export class MeetingAudioRecorder {
  private readonly recordingId: string;
  private readonly streamId: string;
  private readonly partDurationMs: number;
  private readonly partsStore: PartsStore;
  private readonly onPartReady?: (recordingId: string, partIndex: number) => void;
  private readonly onStopped?: (recordingId: string, totalParts: number) => void;
  private readonly mediaDevices: MediaDevices;
  private readonly audioContextFactory: () => AudioContext;
  private readonly mediaRecorderFactory: (
    stream: MediaStream,
    options?: MediaRecorderOptions
  ) => MediaRecorder;

  private audioContext: AudioContext | null = null;
  private tabStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private mixedDestination: MediaStreamAudioDestinationNode | null = null;
  private currentRecorder: MediaRecorder | null = null;
  private currentChunks: Blob[] = [];

  private currentPartIndex = 0;
  private rotationTimer: any = null;
  private isRecording = false;
  private startTime = 0;

  constructor(options: MeetingAudioRecorderOptions) {
    this.recordingId = options.recordingId;
    this.streamId = options.streamId;
    this.partDurationMs = options.partDurationMs ?? 5 * 60 * 1000; // 5 minutes
    this.partsStore = options.partsStore ?? new PartsStore();
    this.onPartReady = options.onPartReady;
    this.onStopped = options.onStopped;
    this.mediaDevices = options.mediaDevices ?? navigator.mediaDevices;
    this.audioContextFactory =
      options.audioContextFactory ??
      (() => new (window.AudioContext || (window as any).webkitAudioContext)());
    this.mediaRecorderFactory =
      options.mediaRecorderFactory ??
      ((stream, opts) => new MediaRecorder(stream, opts));
  }

  public async start(): Promise<void> {
    if (this.isRecording) {
      return;
    }

    // 1. Capture tab audio
    this.tabStream = await this.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: this.streamId,
        },
      } as any,
      video: false,
    });

    // 2. AudioContext setup: keep tab audio audible to user
    this.audioContext = this.audioContextFactory();
    const tabSource = this.audioContext.createMediaStreamSource(this.tabStream);
    // Tab audio keeps playing through the user's speakers/headphones
    tabSource.connect(this.audioContext.destination);

    // 3. AudioContext setup: mixed destination for recording
    this.mixedDestination = this.audioContext.createMediaStreamDestination();
    tabSource.connect(this.mixedDestination);

    // 4. Microphone capture: mix if permitted, continue tab-only if refused
    try {
      this.micStream = await this.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const micSource = this.audioContext.createMediaStreamSource(this.micStream);
      // Connect mic ONLY to recording stream, NOT to audioContext.destination (avoids mic loopback echo)
      micSource.connect(this.mixedDestination);
    } catch (micErr) {
      // Permission denied or unavailable: continue tab-only
      console.warn('[MeetingAudioRecorder] Microphone capture refused, continuing tab-only', micErr);
    }

    this.isRecording = true;
    this.startTime = Date.now();
    this.currentPartIndex = 0;

    // 5. Start first part
    this.startPartRecorder();
  }

  private startPartRecorder(): void {
    if (!this.mixedDestination || !this.isRecording) {
      return;
    }

    this.currentChunks = [];
    const mimeType = 'audio/webm;codecs=opus';
    const options: MediaRecorderOptions = {};
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mimeType)) {
      options.mimeType = mimeType;
    }

    const recorder = this.mediaRecorderFactory(this.mixedDestination.stream, options);
    this.currentRecorder = recorder;

    const partIndex = this.currentPartIndex;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.currentChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(this.currentChunks, { type: mimeType });
      if (blob.size > 0) {
        await this.partsStore.savePart({
          recordingId: this.recordingId,
          partIndex,
          blob,
        });
        this.onPartReady?.(this.recordingId, partIndex);
      }
    };

    recorder.start();

    // Schedule rotation for next part in partDurationMs (5 minutes)
    this.rotationTimer = setTimeout(async () => {
      await this.rotate();
    }, this.partDurationMs);
  }

  public async rotate(): Promise<void> {
    if (!this.isRecording || !this.currentRecorder) {
      return;
    }

    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }

    // Stop current recorder and await onstop (part saved & onPartReady fired)
    const prevRecorder = this.currentRecorder;
    if (prevRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const prevOnStop = prevRecorder.onstop;
        prevRecorder.onstop = async (ev) => {
          if (prevOnStop) {
            try {
              await (prevOnStop as any)(ev);
            } catch (err) {
              console.error('[MeetingAudioRecorder] Error in onstop handler during rotation:', err);
            }
          }
          resolve();
        };
        prevRecorder.stop();
      });
    }

    // Increment partIndex and start next part
    this.currentPartIndex += 1;
    this.startPartRecorder();
  }

  public async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;

    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }

    // Stop current recorder to finalize the final part
    if (this.currentRecorder && this.currentRecorder.state !== 'inactive') {
      const rec = this.currentRecorder;
      await new Promise<void>((resolve) => {
        const prevOnStop = rec.onstop;
        rec.onstop = async (ev) => {
          if (prevOnStop) {
            try {
              await (prevOnStop as any)(ev);
            } catch (err) {
              console.error('[MeetingAudioRecorder] Error in onstop handler during stop:', err);
            }
          }
          resolve();
        };
        rec.stop();
      });
    }

    // Stop all media tracks
    if (this.tabStream) {
      this.tabStream.getTracks().forEach((track) => track.stop());
      this.tabStream = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }

    const totalParts = this.currentPartIndex + 1;
    this.onStopped?.(this.recordingId, totalParts);
  }

  public getStatus() {
    return {
      isRecording: this.isRecording,
      recordingId: this.recordingId,
      currentPartIndex: this.currentPartIndex,
      elapsedMs: this.isRecording ? Date.now() - this.startTime : 0,
    };
  }
}

// Browser runtime message handler in offscreen document
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  let activeRecorder: MeetingAudioRecorder | null = null;
  const store = new PartsStore();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.target !== 'offscreen') {
      return false;
    }

    if (message.type === 'START_RECORDING') {
      if (activeRecorder) {
        sendResponse({ success: false, error: 'A recording is already active' });
        return false;
      }

      activeRecorder = new MeetingAudioRecorder({
        recordingId: message.recordingId,
        streamId: message.streamId,
        partDurationMs: message.partDurationMs,
        partsStore: store,
        onPartReady: (recordingId, partIndex) => {
          chrome.runtime.sendMessage({
            type: 'PART_READY',
            recordingId,
            partIndex,
          });
        },
        onStopped: (recordingId, totalParts) => {
          chrome.runtime.sendMessage({
            type: 'RECORDING_STOPPED',
            recordingId,
            totalParts,
          });
        },
      });

      activeRecorder
        .start()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));

      return true; // async sendResponse
    }

    if (message.type === 'STOP_RECORDING') {
      if (!activeRecorder) {
        sendResponse({ success: true, alreadyStopped: true });
        return false;
      }

      const recorder = activeRecorder;
      activeRecorder = null;

      recorder
        .stop()
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));

      return true;
    }

    if (message.type === 'GET_STATUS') {
      sendResponse(
        activeRecorder
          ? activeRecorder.getStatus()
          : { isRecording: false, currentPartIndex: 0, elapsedMs: 0 }
      );
      return false;
    }

    return false;
  });
}
