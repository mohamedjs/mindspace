export class NoteNotFoundError extends Error {
  constructor(message = 'Note not found') {
    super(message);
    this.name = 'NoteNotFoundError';
  }
}

export class GroupNotFoundError extends Error {
  constructor(message = 'Group not found') {
    super(message);
    this.name = 'GroupNotFoundError';
  }
}

export class RelationshipNotFoundError extends Error {
  constructor(message = 'Relationship not found') {
    super(message);
    this.name = 'RelationshipNotFoundError';
  }
}

export class CycleDetectedError extends Error {
  constructor(message = 'Cycle detected in note hierarchy') {
    super(message);
    this.name = 'CycleDetectedError';
  }
}

export class InvalidStructureError extends Error {
  constructor(message = 'Invalid structure') {
    super(message);
    this.name = 'InvalidStructureError';
  }
}

export class LimitExceededError extends Error {
  constructor(message = 'Limit exceeded') {
    super(message);
    this.name = 'LimitExceededError';
  }
}
