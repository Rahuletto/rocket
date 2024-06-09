import type { TriggerEvent } from "react-contexify";
import { useContextMenu } from "react-contexify";
import { useSource } from "../provider/SourceContext";
import { setActive } from "../stores/active";
import type { File, Folder } from "../types/File";
import FileIcon from "./FileIcon";
import NavFolderItem from "./NavFolderItem";

interface Props {
  files: (File | Folder)[];
  visible: boolean;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

export default function NavFiles({ files, visible, onContextMenu }: Props) {
  const { setSelect, selected, addOpenedFile } = useSource();

  const { show } = useContextMenu({
    id: "file",
  });

  function displayMenu(
    e: TriggerEvent,
    props: { path: string; name: string; isFile?: boolean; isFolder?: boolean },
  ) {
    show({
      event: e,
      props,
    });
  }

  const onShow = async (
    ev: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
    file: File,
  ) => {
    ev.stopPropagation();

    if (file.kind === "file") {
      setActive(file.id);
      setSelect(file.id);
      addOpenedFile(file.id);
    }
  };

  return (
    <div className={`source-codes h-fill pl-3 ${visible ? "" : "hidden"}`}>
      {[...files].map((file) => {
        const isSelected = file.id === selected;

        if (file.kind === "directory") {
          return (
            <NavFolderItem active={isSelected} key={file.id} file={file} />
          );
        }

        return (
          <>
            <div
              onClick={(ev) => onShow(ev, file)}
              onContextMenu={
                onContextMenu
                  ? onContextMenu
                  : (e) =>
                      displayMenu(e, {
                        name: file.name,
                        path: file.path,
                        isFile: true,
                      })
              }
              key={file.id}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  onShow(ev, file);
                }
              }}
              className={`soure-item select-none ${
                isSelected ? "source-item-active bg-lighter" : ""
              } rounded-lg flex items-center gap-2 px-2 py-0.5 text-gray-500 hover:text-gray-400 cursor-pointer`}
            >
              <FileIcon name={file.name} />
              <span
                className="text-[14px] whitespace-nowrap text-ellipsis overflow-hidden"
                style={{ overflowWrap: "anywhere" }}
              >
                {file.name}
              </span>
            </div>
          </>
        );
      })}
    </div>
  );
}
