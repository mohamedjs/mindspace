import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { PartsStore } from '../src/parts-store.js';
import { MeetingAudioRecorder } from '../src/offscreen.js';

describe('Part Rotation and Audio Capture in Offscreen Document', () => {
  let store: PartsStore;

  beforeEach(() => {
    store = new PartsStore(indexedDB);
  });

  afterEach(async () => {
    await store.close();
    vi.restoreAllMocks();
  });

  function createMockAudioEnvironment() {
    const destinationNode = { id: 'speakers-destination' };
    const mixedNode = {
      id: 'mixed-stream-dest',
      stream: { id: 'mixed-media-stream' } as unknown as MediaStream,
    };

    const connectedNodes: Array<{ from: any; to: any }> = [];

    const mockTabSource = {
      connect: vi.fn((dest) => {
        connectedNodes.push({ from: 'tabSource', to: dest });
      }),
    };

    const mockMicSource = {
      connect: vi.fn((dest) => {
        connectedNodes.push({ from: 'micSource', to: dest });
      }),
    };

    const audioContext = {
      state: 'running',
      destination: destinationNode,
      createMediaStreamSource: vi.fn((stream: any) => {
        if (stream.id === 'tab-stream') return mockTabSource;
        return mockMicSource;
      }),
      createMediaStreamDestination: vi.fn(() => mixedNode),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext;

    const tabTrack = { stop: vi.fn() };
    const tabStream = {
      id: 'tab-stream',
      getTracks: () => [tabTrack],
    } as unknown as MediaStream;

    const micTrack = { stop: vi.fn() };
    const micStream = {
      id: 'mic-stream',
      getTracks: () => [micTrack],
    } as unknown as MediaStream;

    let micAllowed = true;

    const mediaDevices = {
      getUserMedia: vi.fn(async (constraints: any) => {
        if (constraints?.audio?.mandatory?.chromeMediaSource === 'tab') {
          return tabStream;
        }
        if (!micAllowed) {
          throw new DOMException('Permission denied by user', 'NotAllowedError');
        }
        return micStream;
      }),
    } as unknown as MediaDevices;

    const recorderInstances: any[] = [];

    const mediaRecorderFactory = vi.fn((stream: MediaStream, options?: MediaRecorderOptions) => {
      let state: RecordingState = 'inactive';
      const recorder = {
        stream,
        options,
        get state() {
          return state;
        },
        set state(val: RecordingState) {
          state = val;
        },
        ondataavailable: null as ((ev: any) => void) | null,
        onstop: null as ((ev: any) => void) | null,
        start: vi.fn(() => {
          state = 'recording';
        }),
        stop: vi.fn(() => {
          state = 'inactive';
          if (recorder.ondataavailable) {
            recorder.ondataavailable({
              data: new Blob([`chunk-data-${recorderInstances.length}`], {
                type: 'audio/webm;codecs=opus',
              }),
            });
          }
          if (recorder.onstop) {
            recorder.onstop(new Event('stop'));
          }
        }),
      };
      recorderInstances.push(recorder);
      return recorder as unknown as MediaRecorder;
    });

    return {
      audioContext,
      mediaDevices,
      tabStream,
      tabTrack,
      micStream,
      micTrack,
      recorderInstances,
      mediaRecorderFactory,
      connectedNodes,
      setMicAllowed: (allowed: boolean) => {
        micAllowed = allowed;
      },
    };
  }

  it('rotates MediaRecorder sequentially and saves parts with incrementing partIndex', async () => {
    const env = createMockAudioEnvironment();
    const readyParts: Array<{ recordingId: string; partIndex: number }> = [];

    let stoppedCalled = false;
    let totalPartsReported = 0;

    const recorder = new MeetingAudioRecorder({
      recordingId: 'rec-rotate-test',
      streamId: 'stream-123',
      partDurationMs: 100_000, // Explicitly rotated via recorder.rotate()
      partsStore: store,
      mediaDevices: env.mediaDevices,
      audioContextFactory: () => env.audioContext,
      mediaRecorderFactory: env.mediaRecorderFactory,
      onPartReady: (recordingId, partIndex) => {
        readyParts.push({ recordingId, partIndex });
      },
      onStopped: (_recId: string, total: number) => {
        stoppedCalled = true;
        totalPartsReported = total;
      },
    });

    await recorder.start();
    expect(env.recorderInstances.length).toBe(1);
    expect(env.recorderInstances[0].state).toBe('recording');

    // 1. First rotation (part 0 stops and is saved, part 1 starts)
    await recorder.rotate();

    expect(env.recorderInstances.length).toBe(2);
    expect(readyParts).toEqual([{ recordingId: 'rec-rotate-test', partIndex: 0 }]);

    // 2. Second rotation (part 1 stops and is saved, part 2 starts)
    await recorder.rotate();

    expect(env.recorderInstances.length).toBe(3);
    expect(readyParts).toEqual([
      { recordingId: 'rec-rotate-test', partIndex: 0 },
      { recordingId: 'rec-rotate-test', partIndex: 1 },
    ]);

    // 3. Stop recording -> finalizes part 2
    await recorder.stop();

    expect(stoppedCalled).toBe(true);
    expect(totalPartsReported).toBe(3);
    expect(readyParts).toEqual([
      { recordingId: 'rec-rotate-test', partIndex: 0 },
      { recordingId: 'rec-rotate-test', partIndex: 1 },
      { recordingId: 'rec-rotate-test', partIndex: 2 },
    ]);

    // Check all parts in IndexedDB
    const partsInDb = await store.getAllParts('rec-rotate-test');
    expect(partsInDb.length).toBe(3);
    expect(partsInDb.map((p) => p.partIndex)).toEqual([0, 1, 2]);

    // Media tracks stopped and audioContext closed
    expect(env.tabTrack.stop).toHaveBeenCalled();
    expect(env.micTrack.stop).toHaveBeenCalled();
    expect(env.audioContext.close).toHaveBeenCalled();
  });

  it('rotates automatically when partDurationMs timer expires', async () => {
    const env = createMockAudioEnvironment();
    const readyParts: Array<{ recordingId: string; partIndex: number }> = [];

    const recorder = new MeetingAudioRecorder({
      recordingId: 'rec-timer-rotate',
      streamId: 'stream-timer',
      partDurationMs: 25, // 25ms timer for automated test
      partsStore: store,
      mediaDevices: env.mediaDevices,
      audioContextFactory: () => env.audioContext,
      mediaRecorderFactory: env.mediaRecorderFactory,
      onPartReady: (recordingId, partIndex) => {
        readyParts.push({ recordingId, partIndex });
      },
    });

    await recorder.start();

    // Wait 70ms to allow 2 automated timer rotations
    await new Promise((r) => setTimeout(r, 70));

    await recorder.stop();

    expect(readyParts.length).toBeGreaterThanOrEqual(2);
    expect(readyParts[0].partIndex).toBe(0);
    expect(readyParts[1].partIndex).toBe(1);
  });

  it('keeps tab audio audible and mixes microphone', async () => {
    const env = createMockAudioEnvironment();

    const recorder = new MeetingAudioRecorder({
      recordingId: 'rec-audio-routing',
      streamId: 'stream-456',
      partsStore: store,
      mediaDevices: env.mediaDevices,
      audioContextFactory: () => env.audioContext,
      mediaRecorderFactory: env.mediaRecorderFactory,
    });

    await recorder.start();

    // Tab source must connect to:
    // 1) AudioContext destination (keeps it audible to the user)
    // 2) Mixed stream destination node (for recording)
    const tabConnections = env.connectedNodes.filter((c) => c.from === 'tabSource');
    expect(tabConnections.some((c) => c.to === env.audioContext.destination)).toBe(true);

    // Mic source must connect to:
    // Mixed stream destination node (for recording)
    // MUST NOT connect to AudioContext destination (to avoid echo)
    const micConnections = env.connectedNodes.filter((c) => c.from === 'micSource');
    expect(micConnections.some((c) => c.to === env.audioContext.destination)).toBe(false);

    await recorder.stop();
  });

  it('continues tab-only when microphone permission is refused', async () => {
    const env = createMockAudioEnvironment();
    env.setMicAllowed(false); // Simulate user denying mic permission

    const recorder = new MeetingAudioRecorder({
      recordingId: 'rec-no-mic',
      streamId: 'stream-789',
      partsStore: store,
      mediaDevices: env.mediaDevices,
      audioContextFactory: () => env.audioContext,
      mediaRecorderFactory: env.mediaRecorderFactory,
    });

    // Recording starts successfully even without microphone
    await expect(recorder.start()).resolves.toBeUndefined();

    // Tab source is still connected to user speakers and mixed stream
    const tabConnections = env.connectedNodes.filter((c) => c.from === 'tabSource');
    expect(tabConnections.some((c) => c.to === env.audioContext.destination)).toBe(true);

    // No mic node connected
    const micConnections = env.connectedNodes.filter((c) => c.from === 'micSource');
    expect(micConnections.length).toBe(0);

    await recorder.stop();
  });
});
