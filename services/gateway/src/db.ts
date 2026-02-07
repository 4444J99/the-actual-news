import pg from "pg";
const { Pool } = pg;

export function makePool(postgresUri: string) {
  return new Pool({ connectionString: postgresUri });
}
