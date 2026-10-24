/** JQL string literal with quotes and backslashes escaped. */
export function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
