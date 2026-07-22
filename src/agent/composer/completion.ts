export type CompletionKind = "slash" | "at" | "hash" | "session";

export interface CompletionItem {
  description?: string;
  insert: string;
  kind: CompletionKind;
  label: string;
}

export interface CompletionQuery {
  baseIndex: number;
  kind: CompletionKind;
  query: string;
}

export interface CompletionSources {
  commands: Array<{ description?: string; name: string }>;
  files: string[];
  sessions: Array<{ id: string; name: string }>;
  skills: Array<{ description: string; name: string; path: string }>;
}

/** Detect trailing / @ $ # trigger in the text before the cursor. */
export function detectCompletionQuery(
  text: string,
  cursor = text.length,
): CompletionQuery | null {
  const before = text.slice(0, cursor);

  // Leading `/` (start or after any whitespace) is a slash-command trigger,
  // not a filesystem path completer.
  const slashIdx = before.lastIndexOf("/");
  if (slashIdx !== -1) {
    const afterSlash = before.slice(slashIdx + 1);
    const boundaryOk =
      slashIdx === 0 || /\s/.test(before[slashIdx - 1] ?? "");
    if (boundaryOk && !/\s/.test(afterSlash)) {
      return { baseIndex: slashIdx, kind: "slash", query: afterSlash };
    }
  }

  // `(?:\$\{|\$)` consumes `{` when present; capture is only the id tail.
  const sessionMatch = /(?:^|\s)(?:\$\{|\$)([^\s}]*)$/.exec(before);
  if (sessionMatch) {
    return {
      baseIndex: before.lastIndexOf("$"),
      kind: "session",
      query: sessionMatch[1] ?? "",
    };
  }

  const atMatch =
    /(?:^|\s)@\{([^}]*)$/.exec(before) ??
    /(?:^|\s)@([^\s]*)$/.exec(before);
  if (atMatch) {
    return {
      baseIndex: before.lastIndexOf("@"),
      kind: "at",
      query: atMatch[1] ?? "",
    };
  }

  const hashMatch = /(?:^|\s)#([^\s]*)$/.exec(before);
  if (hashMatch) {
    return {
      baseIndex: before.lastIndexOf("#"),
      kind: "hash",
      query: hashMatch[1] ?? "",
    };
  }

  return null;
}

export function fuzzySearch(
  query: string,
  items: string[],
  limit = 40,
): string[] {
  const q = query.toLowerCase();
  if (!q) return items.slice(0, limit);

  const scored: Array<{ item: string; score: number }> = [];
  for (const item of items) {
    const score = fuzzyScore(q, item.toLowerCase());
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.localeCompare(b.item));
  return scored.slice(0, limit).map((entry) => entry.item);
}

function fuzzyScore(query: string, target: string): number | null {
  const fileName = target.slice(target.lastIndexOf("/") + 1);
  const stem = fileName.includes(".")
    ? fileName.slice(0, fileName.lastIndexOf("."))
    : fileName;
  if (stem === query) {
    return 3000 - target.length;
  }
  if (target.includes(query)) {
    const index = target.indexOf(query);
    const boundary =
      index === 0 || "/._- ".includes(target[index - 1] ?? "") ? 200 : 0;
    return 1000 + boundary - index - target.length / 100;
  }
  let qi = 0;
  let score = 0;
  let last = -1;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      score += last === ti - 1 ? 5 : 1;
      last = ti;
      qi += 1;
    }
  }
  return qi === query.length ? score : null;
}

export function buildCompletions(
  text: string,
  sources: CompletionSources,
  cursor = text.length,
): CompletionItem[] {
  const detected = detectCompletionQuery(text, cursor);
  if (!detected) return [];

  const { kind, query } = detected;
  switch (kind) {
    case "slash": {
      const names = sources.commands.map((command) => command.name);
      return fuzzySearch(query, names).map((name) => {
        const command = sources.commands.find((entry) => entry.name === name);
        return {
          description: command?.description,
          insert: `/${name} `,
          kind,
          label: `/${name}`,
        };
      });
    }
    case "at":
      return fuzzySearch(query, sources.files).map((file) => ({
        insert: /\s/.test(file) ? `@{${file}} ` : `@${file} `,
        kind,
        label: `@${file}`,
      }));
    case "hash": {
      const names = sources.skills.map((skill) => skill.name);
      return fuzzySearch(query, names).map((name) => {
        const skill = sources.skills.find((entry) => entry.name === name);
        return {
          description: skill?.description,
          insert: `#${name} `,
          kind,
          label: `#${name}`,
        };
      });
    }
    case "session": {
      const q = query.toLowerCase();
      return sources.sessions
        .map((session) => ({
          score: q
            ? fuzzyScore(q, `${session.name} ${session.id}`.toLowerCase())
            : 0,
          session,
        }))
        .filter((entry) => entry.score !== null)
        .sort(
          (a, b) =>
            (b.score ?? 0) - (a.score ?? 0) ||
            a.session.name.localeCompare(b.session.name),
        )
        .slice(0, 40)
        .map(({ session }) => ({
          description: session.name,
          insert: `$${session.id} `,
          kind,
          label: `$${session.name} · ${session.id.slice(0, 8)}`,
        }));
    }
  }
}

/** Apply a completion insert, replacing from baseIndex to cursor. */
export function applyCompletion(
  text: string,
  item: CompletionItem,
  cursor = text.length,
): { cursor: number; text: string } {
  const detected = detectCompletionQuery(text, cursor);
  if (!detected) {
    const next = `${text}${item.insert}`;
    return { cursor: next.length, text: next };
  }
  const next =
    text.slice(0, detected.baseIndex) + item.insert + text.slice(cursor);
  const nextCursor = detected.baseIndex + item.insert.length;
  return { cursor: nextCursor, text: next };
}
