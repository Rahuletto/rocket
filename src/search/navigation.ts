export interface SearchLocation {
  path: string;
  lineNumber: number;
  start: number;
  end: number;
}

const pending = new Map<string, SearchLocation>();

export function requestSearchNavigation(location: SearchLocation) {
  const workspace = localStorage.getItem("project")?.replace(/[/\\]$/, "") ?? "";
  const absolutePath = /^[A-Za-z]:[/\\]|^\//.test(location.path)
    ? location.path
    : `${workspace}/${location.path}`;
  const normalized = absolutePath.replaceAll("\\", "/");
  pending.set(normalized, { ...location, path: normalized });
  window.dispatchEvent(new CustomEvent("rocket-search-navigate", { detail: normalized }));
  return normalized;
}

export function takeSearchNavigation(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const location = pending.get(normalized);
  if (location) pending.delete(normalized);
  return location;
}
