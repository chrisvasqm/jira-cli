export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    /** HTTP status when the error came from Jira. */
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** Map Jira's 404 for an issue URL to a clear message about the key. */
export function ticketNotFound(key: string): (err: unknown) => never {
  return (err: unknown) => {
    if (err instanceof CliError && err.code === "NOT_FOUND") {
      throw new CliError(
        "TICKET_NOT_FOUND",
        `Ticket ${key} does not exist or you cannot see it.`,
        `If every ticket fails this way, check that baseUrl in your config is your Jira site.`,
      );
    }
    throw err;
  };
}
