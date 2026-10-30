// Connections express shared records; the straight segments are not travel routes.
export function connectionPairs(ids: string[], available: ReadonlySet<string>): [string, string][] {
  const valid = [...new Set(ids)].filter(id => available.has(id));
  return valid.slice(1).map(id => [valid[0], id]);
}
