import { File } from "../types/File";
import { useSource } from "../provider/SourceContext";
import { getFileObject } from "../stores/file";
import FileIcon from "./FileIcon";
import useHorizontalScroll from "../helpers/useHorizontalScroll";

import CodeEditor from "./CodeEditor";
import { IoClose } from "react-icons/io5";
import { getMonacoLanguage } from "../helpers/language";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { reorder } from "../helpers/reorder";

export default function CodeArea() {
  const { opened, selected, setSelect, delOpenedFile, setOpenedFile } = useSource();
  const scrollRef = useHorizontalScroll();
  const onSelectItem = (id: string) => {
    setSelect("");
    setSelect(id);
  };

  const isImage = (name: string) => {
    return [".png", ".gif", ".jpeg", ".jpg", ".bmp"].some(
      (ext) => name.lastIndexOf(ext) !== -1
    );
  };
  const close = (ev: React.MouseEvent<HTMLElement, MouseEvent>, id: string) => {
    ev.stopPropagation();
    let selectedIndex = opened.findIndex((a) => a === selected);
    let closingIndex = opened.findIndex((a) => a === id);

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

  const onDragEnd = (result: any) => {
    if (!result.destination) {
      return;
    }
    const newTabs = reorder(
      opened,
      result.source.index,
      result.destination.index
    );

    setOpenedFile(newTabs);
  };

  return (
    <div
      id="code-area"
      className="w-full h-full bg-light rounded-t-xl rounded-br-[12px]"
    >
      <div
        ref={scrollRef}
        className="select-none code-tab-items flex items-center overflow-x-auto p-2 gap-2"
        style={{ width: "calc(100vw - 250px)" }}
      >
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="tabs" direction="horizontal">
            {(provided) => (
              <div
                className="flex overflow-hidden whitespace-nowrap"
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
      <div className="code-contents">
        {opened[0] &&
          [opened[opened.findIndex((a) => a === selected)]].map((item) => {
            const file = getFileObject(item) as File;
            if (isImage(file.name)) {
              return <img src={file.path} />;
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
