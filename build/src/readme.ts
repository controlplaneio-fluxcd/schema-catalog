const START = "<!-- versions:start -->";
const END = "<!-- versions:end -->";

export interface VersionRow {
  repo: string;
  version: string;
}

export function renderVersionsTable(rows: VersionRow[]): string {
  const lines = ["| Source | Version |", "| --- | --- |"];
  for (const row of rows) {
    lines.push(`| [${row.repo}](https://github.com/${row.repo}) | ${row.version} |`);
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
