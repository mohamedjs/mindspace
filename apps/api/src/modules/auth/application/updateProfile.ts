import type { UserRepositoryPort, ProfileRepositoryPort } from '../domain/ports.js';

export interface UpdateProfileCommand {
  userId: string;
  display_name: string;
}

export class UpdateProfileUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private profileRepo: ProfileRepositoryPort
  ) {}

  async execute(command: UpdateProfileCommand): Promise<void> {
    const displayName = command.display_name.trim();

    await this.profileRepo.updateDisplayName(command.userId, displayName);
    await this.userRepo.updateDisplayName(command.userId, displayName);
  }
}
