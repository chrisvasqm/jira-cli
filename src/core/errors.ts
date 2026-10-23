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
