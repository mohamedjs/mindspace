export interface Space {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  canvasZoom: number;
  canvasX: number;
  canvasY: number;
  noteCount: number;
  lastActivityAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface SpaceSummary {
  id: string;
  name: string;
  emoji: string;
  note_count: number;
  last_activity_at: string;
}
