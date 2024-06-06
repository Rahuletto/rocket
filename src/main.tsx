import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { SideProvider } from "./provider/SideContext";
import { SourceProvider } from "./provider/SourceContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SideProvider>
    <SourceProvider>
      <React.StrictMode>
        <App />
      </React.StrictMode>
    </SourceProvider>
  </SideProvider>
);
