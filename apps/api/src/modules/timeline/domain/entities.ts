export interface TimelineEvent {
  id: string;
  userId: string;
  spaceId: string;
  type: string;
  refId: string | null;
  summary: string;
  createdAt: Date | string;
}

export interface TimelineEventInput {
  userId: string;
  spaceId: string;
  type: string;
  refId?: string | null;
  summary: string;
}
