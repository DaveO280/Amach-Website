declare module "better-sqlite3" {
  interface Database {
    pragma(pragma: string): unknown;
    exec(sql: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
    close(): void;
  }

  interface Statement<T = unknown> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: unknown): Database;
    (filename: string, options?: unknown): Database;
  }

  const Database: DatabaseConstructor;

  export = Database;
}
