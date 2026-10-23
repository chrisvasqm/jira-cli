import { HttpClient } from "../core/http.js";

export interface Myself {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

/** /rest/api/3/myself and user lookups. */
export class UserService {
  constructor(private readonly http = HttpClient.get()) {}

  myself(): Promise<Myself> {
    return this.http.get<Myself>("/rest/api/3/myself");
  }
}
