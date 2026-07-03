import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useUserProfile } from "../../hooks/use-user-profile";
import { useTrialStatus } from "../../hooks/useTrialStatus";

const TRIAL_EXPIRED_WHITELIST = ['/pricing', '/billing', '/billing/subscribe', '/trial-expired'];

export default function AuthGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: profile, isLoading: isProfileLoading, isError: isProfileError } = useUserProfile();
  const { pathname } = useLocation();
  const trialStatus = useTrialStatus();

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

  if (trialStatus.isLoading) {
    return <div>Loading...</div>;
  }

  if (trialStatus.isExpired && !TRIAL_EXPIRED_WHITELIST.includes(pathname)) {
    return <Navigate to="/trial-expired" replace />;
  }

  return <Outlet />;
}
