export interface SourceState {
  opened: string[];
  selected: string;
}

function unique(ids: string[]) {
  return [...new Set(ids)];
}

export function openSourceFile(
  state: SourceState,
  fileId: string,
): SourceState {
  if (state.selected === fileId && state.opened.includes(fileId)) {
    return state;
  }
  return {
    opened: state.opened.includes(fileId)
      ? state.opened
      : [...state.opened, fileId],
    selected: fileId,
  };
}

export function closeSourceFile(
  state: SourceState,
  fileId: string,
): SourceState {
  const index = state.opened.indexOf(fileId);
  if (index === -1) return state;
  const opened = state.opened.filter((id) => id !== fileId);

  return {
    opened,
    selected:
      state.selected === fileId
        ? (opened[Math.min(index, opened.length - 1)] ?? "")
        : state.selected,
  };
}

export function replaceSourceFiles(
  state: SourceState,
  fileIds: string[],
): SourceState {
  const opened = unique(fileIds);
  const selected = opened.includes(state.selected)
    ? state.selected
    : (opened[0] ?? "");
  const unchanged =
    selected === state.selected &&
    opened.length === state.opened.length &&
    opened.every((id, index) => id === state.opened[index]);
  return unchanged ? state : { opened, selected };
}
