import { createBrowserRouter } from "react-router-dom";
import AuthGuard from "./components/auth/AuthGuard";
import AppLayout from "./components/layout/AppLayout";
import SignInPage from "./pages/auth/SignInPage";
import SignUpPage from "./pages/auth/SignUpPage";
import CreateOrgPage from "./pages/org/CreateOrgPage";
import OrgProfilePage from "./pages/org/OrgProfilePage";
import ProfilePage from "./pages/profile/ProfilePage";

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
        children: [],
      },
    ],
  },
]);
