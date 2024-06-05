import { createContext, useContext, useState, useCallback, useEffect } from "react"
import { getOpens, setOpens } from "../stores/opened";

interface SourceContext {
  selected: string;
  setSelect: (id: string) => void;
  opened: string[];
  addOpenedFile: (id: string) => void;
  delOpenedFile: (id: string) => void;
  setOpenedFile: (ids: string[]) => void;
}

const SourceContext = createContext<SourceContext>({
  selected: '',
  setSelect: (id) => { },
  opened: [],
  addOpenedFile: (id) => { },
  delOpenedFile: (id) => { },
  setOpenedFile: (ids) => { }
});

export const SourceProvider = ({ children }: { children: JSX.Element | JSX.Element[] }) => {
  const [selected, setSelected] = useState('');
  const [opened, updateOpenedFiles] = useState<string[]>([]);

  const setSelect = (id: string) => {
    setSelected(id)
  }

  useEffect(() => { 
    if(opened.length === 0) return;
    if(opened[0]) setOpens(opened);
  }, [opened])

  const addOpenedFile = useCallback((id: string) => {
    if (opened.includes(id)) return;
    updateOpenedFiles(prevOpen => ([...prevOpen, id]))
  }, [opened])

  const setOpenedFile = useCallback((ids: string[]) => {
    updateOpenedFiles(ids)
  }, [opened])

  const delOpenedFile = useCallback((id: string) => {
    updateOpenedFiles(prevOpen => prevOpen.filter(opened => opened !== id))
  }, [opened])

  return <SourceContext.Provider value={{
    selected,
    setSelect,
    opened,
    addOpenedFile,
    delOpenedFile,
    setOpenedFile
  }}>
    {children}
  </SourceContext.Provider>
}

export const useSource = () => {
  const { selected, setSelect, opened, addOpenedFile, delOpenedFile, setOpenedFile } = useContext(SourceContext)

  return { selected, setSelect, opened, addOpenedFile, delOpenedFile, setOpenedFile }
}
