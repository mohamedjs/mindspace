import type { UserRepositoryPort, FileCleanupPort, UnitOfWorkPort } from '../domain/ports.js';

export class DeleteAccountUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private fileCleanup: FileCleanupPort,
    private unitOfWork: UnitOfWorkPort
  ) {}

  async execute(userId: string): Promise<void> {
    await this.unitOfWork.transaction(async (trx) => {
      await this.userRepo.deleteUser(userId, trx);
    });

    // Remove audio files after transaction commit
    await this.fileCleanup.deleteUserFiles(userId);
  }
}
