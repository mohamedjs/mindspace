export interface CreditSignupPort {
  grantSignup(trxOrDb: unknown, userId: string): Promise<void>;
}
