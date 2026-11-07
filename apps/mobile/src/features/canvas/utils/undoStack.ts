/**
 * Client-side Undo/Redo stack for Canvas operations.
 * Max 50 inverse operations per space, cleared on leaving space.
 * One user action makes one undo entry.
 */

export interface UndoStep {
  name: string;
  undo: () => Promise<void> | void;
  redo: () => Promise<void> | void;
}

export class UndoManager {
  private undoStack: UndoStep[] = [];
  private redoStack: UndoStep[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 50) {
    this.maxDepth = maxDepth;
  }

  push(step: UndoStep): void {
    this.undoStack.push(step);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  async undo(): Promise<boolean> {
    const step = this.undoStack.pop();
    if (!step) return false;
    await step.undo();
    this.redoStack.push(step);
    return true;
  }

  async redo(): Promise<boolean> {
    const step = this.redoStack.pop();
    if (!step) return false;
    await step.redo();
    this.undoStack.push(step);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get size(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}

export const canvasUndoManager = new UndoManager(50);
