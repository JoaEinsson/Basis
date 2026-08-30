import { Navigate, createHashRouter, useRouteError } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { Onboarding } from "../pages/Onboarding";

function RouteErrorPage() {
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : "Unknown route error";

  return (
    <main className="fatal-error" role="alert">
      <p className="eyebrow">Navigation error</p>
      <h1>Basis could not open this view.</h1>
      <p>{message}</p>
    </main>
  );
}

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate to="/onboarding" replace />,
      },
      {
        path: "onboarding",
        element: <Onboarding />,
      },
    ],
  },
]);
