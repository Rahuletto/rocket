import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { SideProvider } from "./provider/SideContext";
import { SourceProvider } from "./provider/SourceContext";
import { AgentProvider } from "./provider/AgentContext";
import { GitProvider } from "./provider/GitContext";
import { WorkbenchProvider } from "./provider/WorkbenchContext";
import { ReviewProvider } from "./provider/ReviewContext";
import "streamdown/styles.css";
import "dockview-react/dist/styles/dockview.css";
import "./styles/editor.css";
import "./styles/context-menu.css";
import "./styles/dockview.css";
import "./styles/git.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SideProvider>
    <WorkbenchProvider>
      <GitProvider>
        <AgentProvider>
          <ReviewProvider>
            <SourceProvider>
              <React.StrictMode>
                <App />
              </React.StrictMode>
            </SourceProvider>
          </ReviewProvider>
        </AgentProvider>
      </GitProvider>
    </WorkbenchProvider>
  </SideProvider>
);
