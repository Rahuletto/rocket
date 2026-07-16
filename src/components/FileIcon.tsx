import { createFileTreeIconResolver } from "@pierre/trees";
import type { IconProps } from "../types/Icon";

// Create the icon resolver using @pierre/trees's own resolver
const resolver = createFileTreeIconResolver({
  set: "complete",
  colored: true,
});

export default function FileIcon({ name }: IconProps) {
  const cls = "w-4 h-4 flex items-center justify-center flex-shrink-0 file-icon-colored";

  // Use the built-in resolver from @pierre/trees to get the token
  const resolved = resolver.resolveIcon("file-tree-icon-file", name);
  const token = resolved.token || "default";

  return (
    <span className={cls} data-token={token} style={{ display: "inline-flex", flexShrink: 0 }}>
      <svg viewBox="0 0 16 16" style={{ width: "100%", height: "100%", fill: "currentColor" }}>
        <use href={`#file-tree-builtin-${token}`} />
      </svg>
    </span>
  );
}
