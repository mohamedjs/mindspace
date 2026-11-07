export class SpaceNotFoundError extends Error {
  constructor(message = 'Space not found') {
    super(message);
    this.name = 'SpaceNotFoundError';
  }
}
