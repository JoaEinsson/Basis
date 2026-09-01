import { RouterProvider } from "react-router-dom";
import { UpdateProvider } from "../components/settings/UpdateProvider";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { router } from "./router";

function App() {
  return (
    <AppErrorBoundary>
      <UpdateProvider>
        <RouterProvider router={router} />
      </UpdateProvider>
    </AppErrorBoundary>
  );
}

export default App;
