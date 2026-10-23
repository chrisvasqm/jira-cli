import { HttpClient } from "../core/http.js";

export interface Board {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string; projectName?: string };
}

interface Page<T> {
  values: T[];
  isLast: boolean;
  maxResults: number;
}

/** /rest/agile/1.0/board endpoints. */
export class BoardService {
  constructor(private readonly http = HttpClient.get()) {}

  async listAll(): Promise<Board[]> {
    const boards: Board[] = [];
    let startAt = 0;
    for (;;) {
      const page = await this.http.get<Page<Board>>(`/rest/agile/1.0/board?startAt=${startAt}&maxResults=50`);
      boards.push(...page.values);
      if (page.isLast) return boards;
      startAt += page.maxResults;
    }
  }
}
