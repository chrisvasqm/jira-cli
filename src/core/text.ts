const collator = new Intl.Collator(undefined, { sensitivity: "accent" });

/** Names typed by people match Jira's ignoring case: "in review" matches "In Review". */
export function sameName(name: string | undefined, typed: string): boolean {
  return name !== undefined && collator.compare(name, typed) === 0;
}
