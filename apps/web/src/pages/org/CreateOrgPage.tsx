import { CreateOrganization } from "@clerk/clerk-react";

export default function CreateOrgPage() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <CreateOrganization />
    </div>
  );
}
