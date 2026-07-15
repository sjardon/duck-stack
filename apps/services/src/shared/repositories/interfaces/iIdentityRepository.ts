export interface IIdentityRepository {
  findUserIdByClerkUserId(clerkUserId: string): Promise<string | null>;
  findOrgIdByClerkOrgId(clerkOrgId: string): Promise<string | null>;
}
