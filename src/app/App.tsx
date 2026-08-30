import { RouterProvider } from "react-router-dom";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { router } from "./router";

function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  );
}

export default App;
