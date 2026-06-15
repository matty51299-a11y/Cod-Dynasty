import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { DynastyProvider } from "./store/dynastyStore.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <DynastyProvider>
      <App />
    </DynastyProvider>
  </StrictMode>
);
