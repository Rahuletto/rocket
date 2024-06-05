import CodeArea from "./components/CodeArea"
import Context from "./components/menus/FileContext"
import Sidebar from "./components/Sidebar"
import Titlebar from "./components/Titlebar"
import { SourceProvider } from "./provider/SourceContext"

export default function App() {
  return <div className="wrapper rounded-lg select-none">
    <Titlebar />
    <div id="editor" className="flex items-start overflow-hidden select-none" style={{ height: "calc(100vh - 40px)" }}>
      <SourceProvider>
        <Sidebar /> 
        <CodeArea />
        <Context />
      </SourceProvider>
    </div>
  </div>
}