const START = "<!-- versions:start -->";
const END = "<!-- versions:end -->";

export interface VersionRow {
  /** Display name from the source's `alias`. */
  alias: string;
  /** Source key; links the version to build/history/<name>.json. */
  name: string;
  version: string;
  /** RFC 3339 build timestamp from the history manifest. */
  builtAt: string;
  /** Number of JSON Schemas the source contributes (`.json` files only). */
  schemas: number;
}

export function renderVersionsTable(rows: VersionRow[]): string {
  const lines = ["| Project | Version | Schemas | Updated |", "| --- | --- | --- | --- |"];
  for (const row of rows) {
    const updated = row.builtAt.slice(0, 10);
    lines.push(
      `| ${row.alias} | [${row.version}](build/history/${row.name}.json) | ${row.schemas} | ${updated} |`,
    );
  }
  return lines.join("\n");
}

export function spliceVersionsTable(readme: string, table: string): string {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README is missing the ${START} / ${END} markers`);
  }
  return `${readme.slice(0, start + START.length)}\n${table}\n${readme.slice(end)}`;
}

/** Rewrites the versions table in place; returns true when the file changed. */
export async function updateReadme(path: string, rows: VersionRow[]): Promise<boolean> {
  const before = await Bun.file(path).text();
  const after = spliceVersionsTable(before, renderVersionsTable(rows));
  if (after === before) {
    return false;
  }
  await Bun.write(path, after);
  return true;
}
