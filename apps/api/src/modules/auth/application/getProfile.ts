import type { UserRepositoryPort, ProfileRepositoryPort } from '../domain/ports.js';
import { UserNotFoundError } from '../domain/errors.js';

export interface ProfileResult {
  display_name: string | null;
  email: string;
}

export class GetProfileUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private profileRepo: ProfileRepositoryPort
  ) {}

  async execute(userId: string): Promise<ProfileResult> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UserNotFoundError();
    }

    const profile = await this.profileRepo.findByUserId(userId);
    const displayName = profile?.display_name || user.display_name || null;

    return {
      display_name: displayName,
      email: user.email,
    };
  }
}
