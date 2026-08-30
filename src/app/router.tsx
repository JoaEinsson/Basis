import { Navigate, createHashRouter, useRouteError } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { AlbumDetail } from "../pages/AlbumDetail";
import { ArtistDetail } from "../pages/ArtistDetail";
import { GenericView } from "../pages/GenericView";
import { Onboarding } from "../pages/Onboarding";
import { NowPlaying } from "../pages/NowPlaying";
import { SearchView } from "../pages/SearchView";
import { Settings } from "../pages/Settings";

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
      {
        path: "views/:viewId",
        element: <GenericView />,
      },
      {
        path: "search",
        element: <SearchView />,
      },
      {
        path: "albums/:albumKey",
        element: <AlbumDetail />,
      },
      {
        path: "artists/:artistKey",
        element: <ArtistDetail />,
      },
      {
        path: "now-playing",
        element: <NowPlaying />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
    ],
  },
]);
