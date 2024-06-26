import { Item, type ItemParams, Menu, RightSlot } from "react-contexify";

import "react-contexify/dist/ReactContexify.css";

import { FaTrash } from "react-icons/fa6";
import { deleteFile, deleteFolder } from "../../helpers/filesys";

const Context = () => {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  async function handleDelete({ id, props }: ItemParams<any, any>) {
    id;
    if (props.isFile) {
      await deleteFile(props?.path);
    } else if (props.isFolder) {
      await deleteFolder(props?.path);
    }
  }

  return (
    <Menu id={"file"}>
      <Item onClick={handleDelete}>
        <FaTrash className="text-red" /> Delete
        <RightSlot className="key">
          <span className="ctrl">Delete</span>
        </RightSlot>
      </Item>
    </Menu>
  );
};

export default Context;
