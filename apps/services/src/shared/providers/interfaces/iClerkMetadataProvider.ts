export interface IClerkMetadataProvider {
  setUserAppId(clerkUserId: string, appUserId: string): Promise<void>;
  setOrgAppId(clerkOrgId: string, appOrgId: string): Promise<void>;
}
