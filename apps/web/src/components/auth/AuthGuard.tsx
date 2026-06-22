import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useUserProfile } from "../../hooks/use-user-profile";

export default function AuthGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useUserProfile();
  const { pathname } = useLocation();

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
  }

  if (isProfileLoading || isProfileError) {
    return <div>Loading...</div>;
  }

  if (profile?.onboarding_completed === false && pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (profile?.onboarding_completed === true && pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
