import { HttpClient } from "../core/http.js";

export interface Field {
  id: string;
  name: string;
  custom: boolean;
  /** Some system fields have no schema. */
  schema?: { type?: string };
}

/** /rest/api/3/field: the site's system and custom fields. */
export class FieldService {
  constructor(private readonly http = HttpClient.get()) {}

  /** Every field (Jira does not page this list). */
  list(): Promise<Field[]> {
    return this.http.get<Field[]>("/rest/api/3/field");
  }
}
