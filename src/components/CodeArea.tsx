import type { DropResult } from "@hello-pangea/dnd";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { IoClose } from "react-icons/io5";
import { getMonacoLanguage } from "../helpers/language";
import { reorder } from "../helpers/reorder";
import { useSource } from "../provider/SourceContext";
import { getFileObject } from "../stores/file";
import type { File } from "../types/File";
import CodeEditor from "./CodeEditor";
import FileIcon from "./FileIcon";

export default function CodeArea() {
  const { opened, selected, setSelect, delOpenedFile, setOpenedFile } =
    useSource();

  const onSelectItem = (id: string) => {
    setSelect("");
    setSelect(id);
  };

  const isImage = (name: string) => {
    return [".png", ".gif", ".jpeg", ".jpg", ".bmp"].some(
      (ext) => name.lastIndexOf(ext) !== -1,
    );
  };
  const close = (
    ev: React.MouseEvent<HTMLElement, MouseEvent> | React.KeyboardEvent,
    id: string,
  ) => {
    ev.stopPropagation();
    const selectedIndex = opened.findIndex((a) => a === selected);
    const closingIndex = opened.findIndex((a) => a === id);

    if (selectedIndex !== -1) {
      if (selectedIndex === closingIndex) {
        if (selectedIndex === opened.length - 1) {
          onSelectItem(opened[selectedIndex - 1]);
        } else {
          onSelectItem(opened[selectedIndex + 1]);
        }
      }
    }

    delOpenedFile(id);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    const newTabs = reorder(
      opened,
      result.source.index,
      result.destination.index,
    );

    setOpenedFile(newTabs);
  };

  return (
    <div
      id="code-area"
      className="w-full h-full bg-light rounded-t-xl rounded-br-[12px]"
    >
      <div
        className="select-none code-tab-items flex items-center overflow-x-auto p-2 gap-2"
        style={{ width: "calc(100vw - 250px)" }}
      >
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="tabs" direction="horizontal">
            {(provided) => (
              <div
                className="flex overflow-x-auto whitespace-nowrap"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {opened.map((item, index) => {
                  const file = getFileObject(item) as File;
                  const active =
                    selected === item ? "bg-lighter text-gray-400" : "";

                  return (
                    <Draggable key={item} draggableId={item} index={index}>
                      {(provided) => {
                        return (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => onSelectItem(file.id)}
                            className={`flex-item shrink-0 rounded-lg px-3 py-1.5 select-none text-gray-500 cursor-pointer hover:text-gray-400 flex items-center gap-2 ${active} w-fit mr-[4px]`}
                            key={item}
                          >
                            <FileIcon name={file.name} size="sm" />
                            <span className="text-[14px]">{file.name}</span>
                            <i
                              onKeyDown={(ev) => {
                                if (ev.metaKey && ev.key === "w") {
                                  close(ev, item);
                                }
                              }}
                              onClick={(ev) => close(ev, item)}
                              className="hover:text-red"
                            >
                              <IoClose />
                            </i>
                          </div>
                        );
                      }}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
      <div
        className="code-contents w-full flex flex-col justify-center items-center"
        style={{ height: "calc(100vh - 100px)" }}
      >
        {opened[0] &&
          [opened[opened.findIndex((a) => a === selected)]].map((item) => {
            const file = getFileObject(item) as File;
            if (isImage(file.name)) {
              console.log("E");
              return <img alt={file.name} src={`asset://${file.path}`} />;
            }
            const path = file.path.split("/");
            const dot = path[path.length - 1].split(".");
            return (
              <CodeEditor
                key={item}
                id={item}
                active={item === selected}
                language={getMonacoLanguage(dot[dot.length - 1])}
              />
            );
          })}
      </div>
    </div>
  );
}
