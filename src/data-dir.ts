import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const SETTINGS_FILE = path.resolve("settings.json");
const DEFAULT_DATA_DIR = path.join(os.homedir(), ".api-automation");

interface Settings {
  dataDir?: string;
}

function loadSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  return {};
}

function saveSettings(settings: Settings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

/** Resolve the data directory: DATA_DIR env > settings.json > ~/.api-automation */
function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  const settings = loadSettings();
  if (settings.dataDir) {
    return path.resolve(settings.dataDir);
  }
  return DEFAULT_DATA_DIR;
}

export const DATA_DIR = resolveDataDir();

// Ensure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, "data.db");
export const TEST_CONFIGS_DIR = path.join(DATA_DIR, "test-configs");
export const REPORT_DIR = path.join(DATA_DIR, "playwright-report");
export const PROJECTS_FILE = path.join(DATA_DIR, "projects.config.json");

// Ensure subdirectories exist
if (!fs.existsSync(TEST_CONFIGS_DIR)) {
  fs.mkdirSync(TEST_CONFIGS_DIR, { recursive: true });
}

// --- First-run migration: copy data from app directory to new data dir ---

const APP_DIR = path.resolve(".");

function migrateAppData() {
  // Only migrate if the new data dir is different from the app dir
  if (path.resolve(DATA_DIR) === APP_DIR) return;

  // Migrate data.db if it exists in app dir but not in data dir
  const oldDb = path.join(APP_DIR, "data.db");
  if (fs.existsSync(oldDb) && !fs.existsSync(DB_PATH)) {
    try {
      fs.copyFileSync(oldDb, DB_PATH);
      // Also copy WAL files if present
      const walFile = oldDb + "-wal";
      const shmFile = oldDb + "-shm";
      if (fs.existsSync(walFile)) fs.copyFileSync(walFile, DB_PATH + "-wal");
      if (fs.existsSync(shmFile)) fs.copyFileSync(shmFile, DB_PATH + "-shm");
      console.log(`[Data Migration] Copied database to ${DB_PATH}`);
    } catch (e) {
      console.error("[Data Migration] Failed to copy database:", (e as Error).message);
    }
  }

  // Migrate test-configs
  const oldConfigs = path.join(APP_DIR, "test-configs");
  if (fs.existsSync(oldConfigs)) {
    try {
      const projectDirs = fs.readdirSync(oldConfigs).filter(d =>
        fs.statSync(path.join(oldConfigs, d)).isDirectory()
      );
      let copied = 0;
      for (const dir of projectDirs) {
        const targetDir = path.join(TEST_CONFIGS_DIR, dir);
        if (fs.existsSync(targetDir)) continue; // skip if already exists
        fs.mkdirSync(targetDir, { recursive: true });
        const files = fs.readdirSync(path.join(oldConfigs, dir));
        for (const file of files) {
          fs.copyFileSync(path.join(oldConfigs, dir, file), path.join(targetDir, file));
        }
        copied++;
      }
      if (copied > 0) console.log(`[Data Migration] Copied ${copied} project test config(s) to ${TEST_CONFIGS_DIR}`);
    } catch (e) {
      console.error("[Data Migration] Failed to copy test configs:", (e as Error).message);
    }
  }

  // Migrate projects.config.json
  const oldProjectsFile = path.join(APP_DIR, "projects.config.json");
  if (fs.existsSync(oldProjectsFile) && !fs.existsSync(PROJECTS_FILE)) {
    try {
      fs.copyFileSync(oldProjectsFile, PROJECTS_FILE);
      console.log(`[Data Migration] Copied projects.config.json to ${PROJECTS_FILE}`);
    } catch { /* ignore */ }
  }
}

migrateAppData();

export function getDataDir(): string {
  return DATA_DIR;
}

export function setDataDir(newDir: string): void {
  const resolved = path.resolve(newDir);
  const settings = loadSettings();
  settings.dataDir = resolved;
  saveSettings(settings);
}

export { SETTINGS_FILE };
