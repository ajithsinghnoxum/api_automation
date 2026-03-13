import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { DB_PATH } from "./data-dir";

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// --- Schema ---

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    baseUrl TEXT DEFAULT '',
    authType TEXT DEFAULT 'none',
    credentials TEXT DEFAULT '{}',
    environments TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    exitCode INTEGER,
    grep TEXT,
    output TEXT DEFAULT '',
    reportHtml TEXT DEFAULT '',
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_runs_project_time ON runs(projectId, timestamp DESC);
`);

// Migrations for existing DBs
try { db.exec(`ALTER TABLE runs ADD COLUMN reportHtml TEXT DEFAULT ''`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE projects ADD COLUMN environments TEXT DEFAULT '[]'`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE projects ADD COLUMN notifications TEXT DEFAULT '{}'`); } catch { /* exists */ }

// Per-test results for response comparison
db.exec(`
  CREATE TABLE IF NOT EXISTS run_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId INTEGER NOT NULL,
    projectId TEXT NOT NULL,
    suite TEXT NOT NULL,
    testName TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    endpoint TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'passed',
    httpStatus INTEGER,
    responseBody TEXT DEFAULT '',
    responseTime INTEGER DEFAULT 0,
    FOREIGN KEY (runId) REFERENCES runs(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_run_results_run ON run_results(runId);
  CREATE INDEX IF NOT EXISTS idx_run_results_project ON run_results(projectId);
`);

// Schema baselines for drift detection
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_baselines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    suite TEXT NOT NULL,
    testName TEXT NOT NULL,
    endpoint TEXT NOT NULL DEFAULT '',
    schema TEXT NOT NULL DEFAULT '{}',
    capturedAt TEXT NOT NULL,
    UNIQUE(projectId, suite, testName)
  );
  CREATE INDEX IF NOT EXISTS idx_schema_baselines_project ON schema_baselines(projectId);
`);

// Scheduled test runs
db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    cronExpr TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    lastRunAt TEXT,
    nextRunAt TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_schedules_project ON schedules(projectId);
`);

// --- Projects ---

export interface ProjectRow {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  credentials: string; // JSON string
  environments: string; // JSON string
  notifications: string; // JSON string
}

const stmts = {
  allProjects: db.prepare("SELECT * FROM projects"),
  getProject: db.prepare("SELECT * FROM projects WHERE id = ?"),
  insertProject: db.prepare(
    "INSERT INTO projects (id, name, baseUrl, authType, credentials, environments, notifications) VALUES (@id, @name, @baseUrl, @authType, @credentials, @environments, @notifications)"
  ),
  updateProject: db.prepare(
    "UPDATE projects SET name = @name, baseUrl = @baseUrl, authType = @authType, credentials = @credentials, environments = @environments, notifications = @notifications WHERE id = @id"
  ),
  deleteProject: db.prepare("DELETE FROM projects WHERE id = ?"),

  // Runs
  insertRun: db.prepare(
    "INSERT INTO runs (projectId, timestamp, exitCode, grep, output, reportHtml) VALUES (@projectId, @timestamp, @exitCode, @grep, @output, @reportHtml)"
  ),
  listRuns: db.prepare(
    "SELECT id, projectId, timestamp, exitCode, grep FROM runs WHERE projectId = ? ORDER BY timestamp DESC LIMIT 50"
  ),
  getRunReport: db.prepare("SELECT reportHtml FROM runs WHERE id = ? AND projectId = ?"),
  getRun: db.prepare("SELECT * FROM runs WHERE id = ? AND projectId = ?"),
  deleteProjectRuns: db.prepare("DELETE FROM runs WHERE projectId = ?"),
};

function parseProject(row: ProjectRow) {
  return {
    ...row,
    credentials: JSON.parse(row.credentials || "{}"),
    environments: JSON.parse(row.environments || "[]"),
    notifications: JSON.parse(row.notifications || "{}"),
  };
}

export function getAllProjects() {
  return stmts.allProjects.all().map((r) => parseProject(r as ProjectRow));
}

export function getProject(id: string) {
  const row = stmts.getProject.get(id) as ProjectRow | undefined;
  return row ? parseProject(row) : null;
}

export function createProject(project: {
  id: string;
  name: string;
  baseUrl?: string;
  authType?: string;
  credentials?: Record<string, unknown>;
  environments?: unknown[];
  notifications?: Record<string, unknown>;
}) {
  stmts.insertProject.run({
    id: project.id,
    name: project.name,
    baseUrl: project.baseUrl || "",
    authType: project.authType || "none",
    credentials: JSON.stringify(project.credentials || {}),
    environments: JSON.stringify(project.environments || []),
    notifications: JSON.stringify(project.notifications || {}),
  });
}

export function updateProject(
  id: string,
  data: {
    name?: string;
    baseUrl?: string;
    authType?: string;
    credentials?: Record<string, unknown>;
    environments?: unknown[];
    notifications?: Record<string, unknown>;
  }
) {
  const existing = stmts.getProject.get(id) as ProjectRow | undefined;
  if (!existing) return null;

  const parsed = parseProject(existing);
  const updated = {
    id,
    name: data.name ?? parsed.name,
    baseUrl: data.baseUrl ?? parsed.baseUrl,
    authType: data.authType ?? parsed.authType,
    credentials: JSON.stringify(data.credentials ?? parsed.credentials),
    environments: JSON.stringify(data.environments ?? parsed.environments),
    notifications: JSON.stringify(data.notifications ?? parsed.notifications),
  };
  stmts.updateProject.run(updated);
  return { ...updated, credentials: JSON.parse(updated.credentials), environments: JSON.parse(updated.environments), notifications: JSON.parse(updated.notifications) };
}

export function deleteProject(id: string) {
  stmts.deleteProjectRuns.run(id);
  stmts.deleteProject.run(id);
}

// --- Runs ---

export function insertRun(run: {
  projectId: string;
  timestamp: string;
  exitCode: number | null;
  grep: string | null;
  output: string;
  reportHtml: string;
}) {
  const result = stmts.insertRun.run({
    projectId: run.projectId,
    timestamp: run.timestamp,
    exitCode: run.exitCode,
    grep: run.grep,
    output: run.output,
    reportHtml: run.reportHtml,
  });
  return result.lastInsertRowid;
}

export function listRuns(projectId: string) {
  return stmts.listRuns.all(projectId);
}

const listRunsWithOutputStmt = db.prepare(
  "SELECT id, projectId, timestamp, exitCode, output FROM runs WHERE projectId = ? ORDER BY timestamp DESC LIMIT 50"
);
export function listRunsWithOutput(projectId: string) {
  return listRunsWithOutputStmt.all(projectId);
}

export function getRun(id: number, projectId: string) {
  return stmts.getRun.get(id, projectId);
}

export function getRunReport(id: number, projectId: string) {
  const row = stmts.getRunReport.get(id, projectId) as { reportHtml: string } | undefined;
  return row?.reportHtml || null;
}

// --- Run Results (per-test response storage) ---

const insertRunResultStmt = db.prepare(
  `INSERT INTO run_results (runId, projectId, suite, testName, method, endpoint, status, httpStatus, responseBody, responseTime)
   VALUES (@runId, @projectId, @suite, @testName, @method, @endpoint, @status, @httpStatus, @responseBody, @responseTime)`
);

export function insertRunResult(result: {
  runId: number;
  projectId: string;
  suite: string;
  testName: string;
  method: string;
  endpoint: string;
  status: string;
  httpStatus: number | null;
  responseBody: string;
  responseTime: number;
}) {
  insertRunResultStmt.run(result);
}

export function insertRunResults(results: Parameters<typeof insertRunResult>[0][]) {
  const insertMany = db.transaction((items: Parameters<typeof insertRunResult>[0][]) => {
    for (const item of items) {
      insertRunResultStmt.run(item);
    }
  });
  insertMany(results);
}

const getRunResultsStmt = db.prepare(
  "SELECT * FROM run_results WHERE runId = ? AND projectId = ? ORDER BY id"
);

export function getRunResults(runId: number, projectId: string) {
  return getRunResultsStmt.all(runId, projectId);
}

const getBaselineStmt = db.prepare(
  `SELECT rr.* FROM run_results rr
   INNER JOIN runs r ON rr.runId = r.id
   WHERE rr.projectId = ? AND rr.suite = ? AND rr.testName = ?
   ORDER BY r.timestamp DESC LIMIT 1`
);

export function getBaselineResult(projectId: string, suite: string, testName: string) {
  return getBaselineStmt.get(projectId, suite, testName);
}

// --- Schema Baselines ---

const upsertBaselineStmt = db.prepare(
  `INSERT INTO schema_baselines (projectId, suite, testName, endpoint, schema, capturedAt)
   VALUES (@projectId, @suite, @testName, @endpoint, @schema, @capturedAt)
   ON CONFLICT(projectId, suite, testName) DO UPDATE SET
     endpoint = @endpoint, schema = @schema, capturedAt = @capturedAt`
);

export function upsertSchemaBaseline(baseline: {
  projectId: string;
  suite: string;
  testName: string;
  endpoint: string;
  schema: string;
  capturedAt: string;
}) {
  upsertBaselineStmt.run(baseline);
}

export function upsertSchemaBaselines(baselines: Parameters<typeof upsertSchemaBaseline>[0][]) {
  const tx = db.transaction((items: Parameters<typeof upsertSchemaBaseline>[0][]) => {
    for (const item of items) upsertBaselineStmt.run(item);
  });
  tx(baselines);
}

const getSchemaBaselinesStmt = db.prepare(
  "SELECT * FROM schema_baselines WHERE projectId = ? ORDER BY suite, testName"
);

export function getSchemaBaselines(projectId: string) {
  return getSchemaBaselinesStmt.all(projectId);
}

const deleteSchemaBaselinesStmt = db.prepare(
  "DELETE FROM schema_baselines WHERE projectId = ?"
);

export function deleteSchemaBaselines(projectId: string) {
  deleteSchemaBaselinesStmt.run(projectId);
}

// --- Schedules ---

const insertScheduleStmt = db.prepare(
  `INSERT INTO schedules (projectId, name, cronExpr, enabled, nextRunAt, createdAt)
   VALUES (@projectId, @name, @cronExpr, @enabled, @nextRunAt, @createdAt)`
);

const listSchedulesStmt = db.prepare(
  "SELECT * FROM schedules WHERE projectId = ? ORDER BY createdAt DESC"
);

const allEnabledSchedulesStmt = db.prepare(
  "SELECT s.*, p.name as projectName FROM schedules s JOIN projects p ON s.projectId = p.id WHERE s.enabled = 1"
);

const getScheduleStmt = db.prepare(
  "SELECT * FROM schedules WHERE id = ? AND projectId = ?"
);

const updateScheduleStmt = db.prepare(
  `UPDATE schedules SET name = @name, cronExpr = @cronExpr, enabled = @enabled, nextRunAt = @nextRunAt WHERE id = @id`
);

const updateScheduleRunStmt = db.prepare(
  "UPDATE schedules SET lastRunAt = @lastRunAt, nextRunAt = @nextRunAt WHERE id = @id"
);

const deleteScheduleStmt = db.prepare(
  "DELETE FROM schedules WHERE id = ? AND projectId = ?"
);

export function insertSchedule(schedule: {
  projectId: string; name: string; cronExpr: string; enabled: number; nextRunAt: string; createdAt: string;
}) {
  const result = insertScheduleStmt.run(schedule);
  return result.lastInsertRowid;
}

export function listSchedules(projectId: string) {
  return listSchedulesStmt.all(projectId);
}

export function getAllEnabledSchedules() {
  return allEnabledSchedulesStmt.all();
}

export function getSchedule(id: number, projectId: string) {
  return getScheduleStmt.get(id, projectId);
}

export function updateSchedule(schedule: { id: number; name: string; cronExpr: string; enabled: number; nextRunAt: string; }) {
  updateScheduleStmt.run(schedule);
}

export function updateScheduleRun(id: number, lastRunAt: string, nextRunAt: string) {
  updateScheduleRunStmt.run({ id, lastRunAt, nextRunAt });
}

export function deleteSchedule(id: number, projectId: string) {
  deleteScheduleStmt.run(id, projectId);
}

// --- Migration from JSON files ---

export function migrateFromJson() {
  const projectsFile = path.resolve("projects.config.json");
  const runHistoryDir = path.resolve("run-history");

  // Migrate projects
  if (fs.existsSync(projectsFile)) {
    const projects = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
    const existingCount = (
      db.prepare("SELECT COUNT(*) as count FROM projects").get() as {
        count: number;
      }
    ).count;

    if (existingCount === 0 && Array.isArray(projects) && projects.length > 0) {
      const insertMany = db.transaction((items: unknown[]) => {
        for (const p of items as Record<string, unknown>[]) {
          try {
            stmts.insertProject.run({
              id: p.id,
              name: p.name || "",
              baseUrl: p.baseUrl || "",
              authType: p.authType || "none",
              credentials: JSON.stringify(p.credentials || {}),
              environments: JSON.stringify(p.environments || []),
              notifications: JSON.stringify(p.notifications || {}),
            });
          } catch {
            /* skip duplicates */
          }
        }
      });
      insertMany(projects);
      console.log(`Migrated ${projects.length} project(s) from JSON.`);
    }
  }

  // Migrate run history
  if (fs.existsSync(runHistoryDir)) {
    const runCount = (
      db.prepare("SELECT COUNT(*) as count FROM runs").get() as {
        count: number;
      }
    ).count;

    if (runCount === 0) {
      let migrated = 0;
      const projectDirs = fs.readdirSync(runHistoryDir).filter((d) => {
        return fs.statSync(path.join(runHistoryDir, d)).isDirectory();
      });

      const insertMany = db.transaction(() => {
        for (const projectId of projectDirs) {
          const dir = path.join(runHistoryDir, projectId);
          const files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith(".json"));
          for (const file of files) {
            try {
              const data = JSON.parse(
                fs.readFileSync(path.join(dir, file), "utf-8")
              );
              stmts.insertRun.run({
                projectId: data.projectId || projectId,
                timestamp: data.timestamp || "",
                exitCode: data.exitCode ?? null,
                grep: data.grep || null,
                output: data.output || "",
              });
              migrated++;
            } catch {
              /* skip invalid files */
            }
          }
        }
      });
      insertMany();

      if (migrated > 0) {
        console.log(`Migrated ${migrated} run(s) from JSON files.`);
      }
    }
  }
}

export default db;
