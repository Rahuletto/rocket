import { useState } from "react";
import CodeArea from "./components/CodeArea";
import Context from "./components/menus/FileContext";
import Sidebar from "./components/Sidebar";
import Titlebar from "./components/Titlebar";
import { useSide } from "./provider/SideContext";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

export default function App() {
  const { side } = useSide();

  const tabs = [
    <Panel key="1" maxSize={50} defaultSize={15} order={1} id="left-panel">
      <Sidebar />
    </Panel>,

    <Panel
      key="2"
      minSize={50}
      style={{ height: "calc(100vh - 40px)" }}
      order={1}
      defaultSize={85}
      id="right-panel"
    >
      <CodeArea />
    </Panel>,
  ];
  return (
    <div className="wrapper rounded-lg select-none">
      <Titlebar />

      <PanelGroup
        direction="horizontal"
        id="editor"
        className="flex items-start overflow-hidden select-none w-full"
        style={{ height: "calc(100vh - 40px)" }}
      >
        <>
          {side === "left" && (
            <>
              {tabs[0]}
              <PanelResizeHandle className="h-full my-12 w-[2px] hover:bg-lighter active:bg-lighter" />
            </>
          )}
          {tabs[1]}
          {side === "right" && (
            <>
              <PanelResizeHandle className="h-full my-12 w-[2px] hover:bg-lighter active:bg-lighter" />
              {tabs[0]}
            </>
          )}
        </>
      </PanelGroup>

      <Context />
    </div>
  );
}
