export interface WorkspaceSearchMatch {
  id: string;
  path: string;
  lineNumber: number;
  line: string;
  start: number;
  end: number;
}

export interface SearchResultGroup {
  path: string;
  matches: WorkspaceSearchMatch[];
}

export function groupSearchResults(matches: WorkspaceSearchMatch[]): SearchResultGroup[] {
  const groups = new Map<string, WorkspaceSearchMatch[]>();
  for (const match of matches) {
    const group = groups.get(match.path) ?? [];
    group.push(match);
    groups.set(match.path, group);
  }
  return [...groups].map(([path, grouped]) => ({ path, matches: grouped }));
}
