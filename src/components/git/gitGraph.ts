export interface GitGraphCommit {
  hash: string;
  parents: string[];
}

export interface GitGraphEdge {
  from: number;
  kind: "commit" | "lane";
  to: number;
}

export interface GitGraphRow {
  edges: GitGraphEdge[];
  laneCount: number;
  nodeLane: number;
}

export function buildGitGraph(commits: GitGraphCommit[]): GitGraphRow[] {
  let lanes: string[] = [];

  return commits.map((commit) => {
    let nodeLane = lanes.indexOf(commit.hash);
    if (nodeLane === -1) {
      nodeLane = lanes.length;
      lanes.push(commit.hash);
    }

    const before = [...lanes];
    const after = [...lanes];
    const firstParent = commit.parents[0];

    if (firstParent) {
      const existingParentLane = after.indexOf(firstParent);
      if (existingParentLane === -1) {
        after[nodeLane] = firstParent;
      } else if (existingParentLane !== nodeLane) {
        after.splice(nodeLane, 1);
      }
    } else {
      after.splice(nodeLane, 1);
    }

    commit.parents.slice(1).forEach((parent, offset) => {
      if (!after.includes(parent)) {
        after.splice(Math.min(nodeLane + 1 + offset, after.length), 0, parent);
      }
    });

    const edges: GitGraphEdge[] = [];
    before.forEach((laneHash, from) => {
      if (laneHash === commit.hash) return;
      const to = after.indexOf(laneHash);
      if (to !== -1) edges.push({ from, kind: "lane", to });
    });
    commit.parents.forEach((parent) => {
      const to = after.indexOf(parent);
      if (to !== -1) edges.push({ from: nodeLane, kind: "commit", to });
    });

    lanes = after;
    return {
      edges,
      laneCount: Math.max(before.length, after.length, 1),
      nodeLane,
    };
  });
}
