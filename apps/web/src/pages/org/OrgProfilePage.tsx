import { OrganizationProfile } from "@clerk/clerk-react";

export default function OrgProfilePage() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <OrganizationProfile />
    </div>
  );
}
