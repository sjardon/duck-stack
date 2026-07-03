import { UserButton } from "@clerk/clerk-react";
import { Outlet } from "react-router-dom";
import TrialBanner from "../domain/billing/TrialBanner";

export default function AppLayout() {
  return (
    <div>
      <TrialBanner />
      <header
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <UserButton />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
