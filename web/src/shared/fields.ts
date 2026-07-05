/**
 * Parsed `.fields.txt` row. Each non-comment line is
 * `<path> <type> [constraints]\t# description`; `raw` preserves the original
 * line for MCP responses, while the other fields support filtering and UI
 * rendering.
 */
export interface FieldLine {
  path: string;
  type: string;
  constraints: string;
  description: string;
  raw: string;
}

/**
 * Node in a dotted field-path tree. Array segments keep their `[]` suffix as
 * part of the segment name so `spec.versions[].name` remains reversible to the
 * source field path.
 */
export interface FieldNode {
  segment: string;
  line?: FieldLine;
  children: Map<string, FieldNode>;
}

/**
 * Parses a `.fields.txt` document into structured rows. Blank lines and
 * comments are ignored; malformed rows throw with the offending raw line so bad
 * generated indexes fail loudly instead of producing partial UI or MCP output.
 */
export function parseFieldsFile(text: string): FieldLine[] {
  const lines: FieldLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) {
      continue;
    }

    const tab = raw.indexOf("\t");
    const left = tab === -1 ? raw : raw.slice(0, tab);
    const description = tab === -1 ? "" : parseDescription(raw.slice(tab + 1));
    const match = left.match(/^(\S+)\s+(<[^>]+>)(?:\s+(.*))?$/);
    if (match === null) {
      throw new Error(`invalid fields line: ${raw}`);
    }

    lines.push({
      path: match[1]!,
      type: match[2]!,
      constraints: match[3] ?? "",
      description,
      raw,
    });
  }
  return lines;
}

/**
 * Filters parsed field rows by optional dotted path prefix and/or
 * case-insensitive raw-line query. `total` reports all matches before the
 * non-negative limit is applied, which lets MCP responses explain truncation.
 */
export function filterFieldLines(
  lines: FieldLine[],
  opts: { query?: string; prefix?: string; limit?: number },
): { matches: FieldLine[]; total: number } {
  const query = opts.query?.toLowerCase();
  const matches = lines.filter((line) => {
    if (opts.prefix !== undefined && opts.prefix !== "" && !line.path.startsWith(opts.prefix)) {
      return false;
    }
    return query === undefined || query === "" || line.raw.toLowerCase().includes(query);
  });

  const limit = opts.limit === undefined ? matches.length : Math.max(0, opts.limit);
  return { matches: matches.slice(0, limit), total: matches.length };
}

/**
 * Builds a tree from parsed dotted paths for the explorer view. The returned
 * root has an empty segment and no line; children preserve the first-seen order
 * from the `.fields.txt` file.
 */
export function buildFieldTree(lines: FieldLine[]): FieldNode {
  const root: FieldNode = { segment: "", children: new Map() };
  for (const line of lines) {
    let node = root;
    for (const segment of line.path.split(".")) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { segment, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.line = line;
  }
  return root;
}

function parseDescription(value: string): string {
  const trimmed = value.trimStart();
  if (trimmed.startsWith("# ")) {
    return trimmed.slice(2);
  }
  if (trimmed.startsWith("#")) {
    return trimmed.slice(1).trimStart();
  }
  return trimmed;
}
