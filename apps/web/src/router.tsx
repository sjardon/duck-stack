import { createBrowserRouter } from "react-router-dom";
import AuthGuard from "./components/auth/AuthGuard";
import AppLayout from "./components/layout/AppLayout";
import SignInPage from "./pages/auth/SignInPage";
import SignUpPage from "./pages/auth/SignUpPage";
import CreateOrgPage from "./pages/org/CreateOrgPage";
import OrgProfilePage from "./pages/org/OrgProfilePage";
import ProfilePage from "./pages/profile/ProfilePage";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import BillingPage from "./pages/billing/BillingPage";
import SubscribePage from "./pages/billing/SubscribePage";

export const router = createBrowserRouter([
  {
    path: "/sign-in",
    element: <SignInPage />,
  },
  {
    path: "/sign-up",
    element: <SignUpPage />,
  },
  {
    element: <AuthGuard />,
    children: [
      {
        path: "/onboarding",
        element: <OnboardingPage />,
      },
      {
        path: "/org/create",
        element: <CreateOrgPage />,
      },
      {
        path: "/org/profile",
        element: <OrgProfilePage />,
      },
      {
        path: "/profile",
        element: <ProfilePage />,
      },
      {
        path: "/*",
        element: <AppLayout />,
        children: [
          { path: "billing", element: <BillingPage /> },
          { path: "billing/subscribe", element: <SubscribePage /> },
        ],
      },
    ],
  },
]);
