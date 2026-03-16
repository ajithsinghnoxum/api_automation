import express from "express";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  insertRun,
  listRuns,
  listRunsWithOutput,
  getRun,
  getRunReport,
  insertRunResults,
  getRunResults,
  upsertSchemaBaselines,
  getSchemaBaselines,
  deleteSchemaBaselines,
  insertSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  updateScheduleRun,
  deleteSchedule,
  getAllEnabledSchedules,
  migrateFromJson,
} from "./src/db";
import {
  TEST_CONFIGS_DIR,
  REPORT_DIR,
  PROJECTS_FILE,
  DATA_DIR,
  getDataDir,
  setDataDir,
} from "./src/data-dir";

import { randomUUID, randomInt } from "crypto";

const app = express();
app.use(express.json({ limit: "10mb" }));

const WEB_DIR = path.resolve("web");

// --- Built-in Variable Resolution (for try-request) ---
let tryIncrement = 0;
let trySequence = 0;

function resolveBuiltinVar(name: string): string | undefined {
  switch (name) {
    case "$timestamp": return String(Date.now());
    case "$isoDate": return new Date().toISOString();
    case "$guid": case "$uuid": return randomUUID();
    case "$randomInt": return String(randomInt(1, 100000));
    case "$randomEmail": return `test${randomInt(1000, 99999)}@example.com`;
    case "$randomString": return randomUUID().replace(/-/g, "").slice(0, 12);
    case "$increment": return String(++tryIncrement);
    case "$sequence": return String(++trySequence);
    case "$randomName":
      const names = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry"];
      return names[randomInt(0, names.length)] + "_" + randomInt(100, 999);
    default: return undefined;
  }
}

function resolveVarsInString(str: string): string {
  return str.replace(/\{\{(\$\w+)\}\}/g, (match, name) => {
    const val = resolveBuiltinVar(name);
    return val !== undefined ? val : match;
  });
}

function resolveVarsDeep(value: unknown): unknown {
  if (typeof value === "string") return resolveVarsInString(value);
  if (Array.isArray(value)) return value.map(resolveVarsDeep);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveVarsDeep(v);
    }
    return result;
  }
  return value;
}

// --- Auto-migrate from JSON on first run ---
migrateFromJson();

// --- Input Sanitization ---

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_FILENAME = /^[a-z0-9][a-z0-9-]{0,63}\.json$/;

function sanitizeId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function validateId(id: string): boolean {
  return SAFE_ID.test(id);
}

function validateFileName(name: string): boolean {
  return SAFE_FILENAME.test(name);
}

/** Ensure resolved path stays within the allowed base directory */
function safePath(base: string, ...segments: string[]): string | null {
  const resolved = path.resolve(base, ...segments);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null;
  }
  return resolved;
}

/** Sync projects to JSON file so Playwright config can read them */
function syncProjectsFile() {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(getAllProjects(), null, 2), "utf-8");
  } catch { /* non-critical */ }
}

// Initial sync on startup
syncProjectsFile();

// --- Security Headers ---

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// --- Serve web UI ---

app.use("/", express.static(WEB_DIR));
app.use("/report", express.static(REPORT_DIR, {
  etag: false, lastModified: false,
  setHeaders: (res) => { res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate"); }
}));
app.use("/docs", express.static(path.resolve("docs")));

// --- Projects API ---

app.get("/api/projects", (_req, res) => {
  res.json(getAllProjects());
});

app.post("/api/projects", (req, res) => {
  const project = req.body;

  if (!project?.name || typeof project.name !== "string") {
    return res.status(400).json({ error: "Project name is required" });
  }

  project.id = sanitizeId(project.id || project.name);

  if (!validateId(project.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  // Check for duplicate
  if (getProject(project.id)) {
    return res.status(409).json({ error: "Project with this ID already exists" });
  }

  const dir = safePath(TEST_CONFIGS_DIR, project.id);
  if (!dir) return res.status(400).json({ error: "Invalid project ID" });

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  createProject(project);
  syncProjectsFile();
  res.json(project);
});

app.put("/api/projects/:id", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const existing = getProject(req.params.id);
  if (!existing) return res.status(404).json({ error: "Project not found" });

  const { id, ...updates } = req.body;
  const updated = updateProject(req.params.id, updates);
  syncProjectsFile();
  res.json(updated);
});

app.delete("/api/projects/:id", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  deleteProject(req.params.id);
  syncProjectsFile();
  res.json({ ok: true });
});

// --- Test Suites API (still file-based for Playwright compatibility) ---

app.get("/api/projects/:id/suites", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const dir = safePath(TEST_CONFIGS_DIR, req.params.id);
  if (!dir) return res.status(400).json({ error: "Invalid project ID" });
  if (!fs.existsSync(dir)) return res.json([]);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const suites = files.map((f) => {
    const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    return { fileName: f, ...content };
  });
  res.json(suites);
});

app.post("/api/projects/:id/suites", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const dir = safePath(TEST_CONFIGS_DIR, req.params.id);
  if (!dir) return res.status(400).json({ error: "Invalid project ID" });
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { fileName, ...suite } = req.body;

  if (!suite.suite || typeof suite.suite !== "string") {
    return res.status(400).json({ error: "Suite name is required" });
  }

  const safeName = sanitizeId(fileName?.replace(/\.json$/, "") || suite.suite) + ".json";
  if (!validateFileName(safeName)) {
    return res.status(400).json({ error: "Invalid suite filename" });
  }

  const filePath = safePath(dir, safeName);
  if (!filePath) return res.status(400).json({ error: "Invalid filename" });

  fs.writeFileSync(filePath, JSON.stringify(suite, null, 2), "utf-8");
  res.json({ fileName: safeName, ...suite });
});

app.put("/api/projects/:id/suites/:file", (req, res) => {
  if (!validateId(req.params.id) || !validateFileName(req.params.file)) {
    return res.status(400).json({ error: "Invalid project ID or filename" });
  }

  const filePath = safePath(TEST_CONFIGS_DIR, req.params.id, req.params.file);
  if (!filePath) return res.status(400).json({ error: "Invalid path" });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Suite not found" });

  const { fileName, ...suite } = req.body;
  fs.writeFileSync(filePath, JSON.stringify(suite, null, 2), "utf-8");
  res.json({ fileName: req.params.file, ...suite });
});

app.delete("/api/projects/:id/suites/:file", (req, res) => {
  if (!validateId(req.params.id) || !validateFileName(req.params.file)) {
    return res.status(400).json({ error: "Invalid project ID or filename" });
  }

  const filePath = safePath(TEST_CONFIGS_DIR, req.params.id, req.params.file);
  if (!filePath) return res.status(400).json({ error: "Invalid path" });
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// --- Try Request & Auto-Generate Validations ---

app.post("/api/projects/:id/try-request", async (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { method, endpoint, queryParams, body, headers: extraHeaders, includeValues, profile } = req.body;
  if (!method || !endpoint) {
    return res.status(400).json({ error: "method and endpoint are required" });
  }

  // Resolve built-in variables in endpoint, body, headers, query params
  const resolvedEndpoint = resolveVarsInString(endpoint);
  const resolvedBody = body ? resolveVarsDeep(body) : undefined;
  const resolvedHeaders = extraHeaders ? resolveVarsDeep(extraHeaders) as Record<string, string> : {};
  const resolvedParams = queryParams ? resolveVarsDeep(queryParams) as Record<string, string> : {};

  // Build full URL
  const baseUrl = ((project as any).baseUrl || "").replace(/\/?$/, "/");
  let url = baseUrl + resolvedEndpoint.replace(/^\//, "");

  // Append query params
  if (Object.keys(resolvedParams).length > 0) {
    const qs = new URLSearchParams(resolvedParams).toString();
    url += (url.includes("?") ? "&" : "?") + qs;
  }

  // Build headers
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...resolvedHeaders,
  };

  // Apply project auth
  const authType = (project as any).authType;
  const creds = (project as any).credentials;
  if (authType === "bearer" && creds?.token) {
    requestHeaders["Authorization"] = `Bearer ${creds.token}`;
  } else if (authType === "basic" && creds?.username && creds?.password) {
    const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
    requestHeaders["Authorization"] = `Basic ${encoded}`;
  } else if (authType === "api-key" && creds?.apiKey) {
    const header = creds.apiKeyHeader || "X-API-Key";
    requestHeaders[header] = creds.apiKey;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const fetchOpts: RequestInit = {
      method: method.toUpperCase(),
      headers: requestHeaders,
      signal: controller.signal,
    };
    if (resolvedBody && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      fetchOpts.body = typeof resolvedBody === "string" ? resolvedBody : JSON.stringify(resolvedBody);
    }

    const response = await fetch(url, fetchOpts);
    clearTimeout(timeout);

    const status = response.status;
    let data: any;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });

    // Auto-generate validations from the response
    const genProfile = profile || (includeValues ? "full" : "structure");
    const validations = generateValidations(data, genProfile);

    res.json({ status, data, headers: responseHeaders, validations });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Request timed out after 30s" });
    }
    return res.status(502).json({ error: `Request failed: ${err.message}` });
  }
});

/** Profiles: "structure" = schema/exists/typeOf only, "key-fields" = + equals for short primitives, "full" = all values */
function generateValidations(data: any, profile: string): any[] {
  const validations: any[] = [];

  if (data === null || data === undefined || typeof data === "string") {
    return validations;
  }

  if (Array.isArray(data)) {
    validations.push({ type: "isArray" });
    validations.push({ type: "arrayLength", exact: data.length });

    if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      const item = data[0];
      const properties: Record<string, string> = {};
      for (const [key, val] of Object.entries(item)) {
        properties[key] = Array.isArray(val) ? "array" : typeof val;
      }
      validations.push({ type: "schema", path: "[0]", properties });

      const nestedValidations: any[] = [];
      for (const [key, val] of Object.entries(item)) {
        if (val !== null && val !== undefined) {
          if (Array.isArray(val)) {
            nestedValidations.push({ type: "isArray", path: key });
          } else {
            nestedValidations.push({ type: "typeOf", path: key, expected: typeof val });
          }
        }
      }
      if (nestedValidations.length > 0) {
        validations.push({ type: "arrayEvery", validations: nestedValidations });
      }

      if (profile === "key-fields") {
        generateKeyFieldChecks(item, "[0]", validations);
      } else if (profile === "full") {
        generateValueChecks(item, "[0]", validations);
      }
    }
  } else if (typeof data === "object") {
    const properties: Record<string, string> = {};
    for (const [key, val] of Object.entries(data)) {
      properties[key] = val === null ? "object" : Array.isArray(val) ? "array" : typeof val;
    }
    if (Object.keys(properties).length > 0) {
      validations.push({ type: "schema", properties });
    }

    for (const [key, val] of Object.entries(data)) {
      validations.push({ type: "exists", path: key });
      if (val !== null && val !== undefined) {
        if (Array.isArray(val)) {
          // isArray generated below
        } else {
          validations.push({ type: "typeOf", path: key, expected: typeof val });
        }
      }
    }

    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val)) {
        validations.push({ type: "isArray", path: key });
        validations.push({ type: "arrayLength", path: key, exact: val.length });
      }
    }

    if (profile === "key-fields") {
      generateKeyFieldChecks(data, "", validations);
    } else if (profile === "full") {
      generateValueChecks(data, "", validations);
    }
  }

  return validations;
}

/** Key-field patterns: IDs, names, statuses, types, codes — skip long strings (>200 chars) and HTML */
const KEY_FIELD_PATTERNS = /^(id|guid|uuid|name|title|status|state|type|typeRef|code|slug|email|role|key|attribute)$/i;

function isKeyField(key: string): boolean {
  const leaf = key.includes(".") ? key.split(".").pop()! : key;
  return KEY_FIELD_PATTERNS.test(leaf);
}

/** Generate equals checks only for key fields (IDs, names, statuses, short primitives) */
function generateKeyFieldChecks(obj: any, prefix: string, validations: any[]): void {
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (val === null || val === undefined) {
      if (isKeyField(key)) validations.push({ type: "equals", path, value: null });
    } else if (typeof val === "number" || typeof val === "boolean") {
      if (isKeyField(key)) validations.push({ type: "equals", path, value: val });
    } else if (typeof val === "string") {
      // Only include key fields with short, non-HTML values
      if (isKeyField(key) && val.length <= 200 && !val.includes("<")) {
        validations.push({ type: "equals", path, value: val });
      }
    } else if (Array.isArray(val)) {
      // Recurse into first item only for key-fields
      if (val.length > 0 && typeof val[0] === "object" && val[0] !== null) {
        generateKeyFieldChecks(val[0], `${path}[0]`, validations);
      }
    } else if (typeof val === "object") {
      generateKeyFieldChecks(val, path, validations);
    }
  }
}

/** Recursively generate equals validations for all primitive values at any depth */
function generateValueChecks(obj: any, prefix: string, validations: any[]): void {
  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (val === null || val === undefined) {
      validations.push({ type: "equals", path, value: null });
    } else if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      validations.push({ type: "equals", path, value: val });
    } else if (Array.isArray(val)) {
      val.forEach((item, idx) => {
        const itemPath = `${path}[${idx}]`;
        if (item === null || item === undefined) {
          validations.push({ type: "equals", path: itemPath, value: null });
        } else if (typeof item === "object") {
          generateValueChecks(item, itemPath, validations);
        } else {
          validations.push({ type: "equals", path: itemPath, value: item });
        }
      });
    } else if (typeof val === "object") {
      generateValueChecks(val, path, validations);
    }
  }
}

// --- Quick Single-Test Run ---

function substituteVariables(str: string, vars: Record<string, unknown> = {}): string {
  if (typeof str !== "string") return str;
  return str.replace(/\{\{(\$?\w+)\}\}/g, (_, key) => {
    if (key === "$timestamp") return String(Date.now());
    if (key === "$isoDate") return new Date().toISOString();
    if (key === "$guid") return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    if (key === "$randomInt") return String(Math.floor(Math.random() * 10000) + 1);
    if (key === "$randomEmail") return `test${Date.now()}@example.com`;
    if (key in vars) return String(vars[key]);
    return `{{${key}}}`;
  });
}

function substituteDeep(obj: unknown, vars: Record<string, unknown> = {}): unknown {
  if (typeof obj === "string") return substituteVariables(obj, vars);
  if (Array.isArray(obj)) return obj.map(item => substituteDeep(item, vars));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = substituteDeep(v, vars);
    }
    return result;
  }
  return obj;
}

function getByPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function runServerValidation(data: unknown, v: any): { status: "passed" | "failed"; message: string; actual?: unknown } {
  const val = getByPath(data, v.path);
  const pathLabel = v.path || "response";

  switch (v.type) {
    case "equals": {
      let a = val, b = v.value;
      if (v.trim && typeof a === "string") a = a.trim();
      if (v.trim && typeof b === "string") b = b.trim();
      const eq = typeof a === "object" && typeof b === "object"
        ? JSON.stringify(a) === JSON.stringify(b)
        : a === b;
      return eq
        ? { status: "passed", message: `${pathLabel} equals ${JSON.stringify(v.value)}` }
        : { status: "failed", message: `${pathLabel} equals ${JSON.stringify(v.value)}`, actual: val };
    }
    case "notEquals": {
      let a = val, b = v.value;
      if (v.trim && typeof a === "string") a = a.trim();
      if (v.trim && typeof b === "string") b = b.trim();
      const neq = typeof a === "object" && typeof b === "object"
        ? JSON.stringify(a) !== JSON.stringify(b)
        : a !== b;
      return neq
        ? { status: "passed", message: `${pathLabel} does not equal ${JSON.stringify(v.value)}` }
        : { status: "failed", message: `${pathLabel} does not equal ${JSON.stringify(v.value)}`, actual: val };
    }
    case "exists":
      return val !== undefined && val !== null
        ? { status: "passed", message: `${pathLabel} exists` }
        : { status: "failed", message: `${pathLabel} exists`, actual: val };
    case "notExists":
      return val === undefined || val === null
        ? { status: "passed", message: `${pathLabel} does not exist` }
        : { status: "failed", message: `${pathLabel} does not exist`, actual: val };
    case "contains": {
      const s = typeof val === "string" ? (v.trim ? val.trim() : val) : val;
      const sv = v.trim && typeof v.value === "string" ? v.value.trim() : v.value;
      return typeof s === "string" && s.includes(sv)
        ? { status: "passed", message: `${pathLabel} contains "${v.value}"` }
        : { status: "failed", message: `${pathLabel} contains "${v.value}"`, actual: val };
    }
    case "notContains": {
      const s = typeof val === "string" ? (v.trim ? val.trim() : val) : val;
      const sv = v.trim && typeof v.value === "string" ? v.value.trim() : v.value;
      return typeof s === "string" && !s.includes(sv)
        ? { status: "passed", message: `${pathLabel} does not contain "${v.value}"` }
        : { status: "failed", message: `${pathLabel} does not contain "${v.value}"`, actual: val };
    }
    case "typeOf": {
      const actualType = Array.isArray(val) ? "array" : typeof val;
      return actualType === v.expected
        ? { status: "passed", message: `${pathLabel} is type "${v.expected}"` }
        : { status: "failed", message: `${pathLabel} is type "${v.expected}"`, actual: actualType };
    }
    case "isArray":
      return Array.isArray(val)
        ? { status: "passed", message: `${pathLabel} is an array` }
        : { status: "failed", message: `${pathLabel} is an array`, actual: typeof val };
    case "arrayLength": {
      if (!Array.isArray(val)) return { status: "failed", message: `${pathLabel} array length check`, actual: "not an array" };
      let ok = true;
      if (v.exact !== undefined && val.length !== v.exact) ok = false;
      if (v.min !== undefined && val.length < v.min) ok = false;
      if (v.max !== undefined && val.length > v.max) ok = false;
      return ok
        ? { status: "passed", message: `${pathLabel} array length check` }
        : { status: "failed", message: `${pathLabel} array length check`, actual: val.length };
    }
    case "greaterThan":
      return typeof val === "number" && val > v.value
        ? { status: "passed", message: `${pathLabel} > ${v.value}` }
        : { status: "failed", message: `${pathLabel} > ${v.value}`, actual: val };
    case "lessThan":
      return typeof val === "number" && val < v.value
        ? { status: "passed", message: `${pathLabel} < ${v.value}` }
        : { status: "failed", message: `${pathLabel} < ${v.value}`, actual: val };
    case "between":
      return typeof val === "number" && val >= v.min && val <= v.max
        ? { status: "passed", message: `${pathLabel} between ${v.min}-${v.max}` }
        : { status: "failed", message: `${pathLabel} between ${v.min}-${v.max}`, actual: val };
    case "matches":
    case "regex": {
      const pattern = v.pattern || v.value;
      const matches = typeof val === "string" && new RegExp(pattern).test(val);
      return matches
        ? { status: "passed", message: `${pathLabel} matches /${pattern}/` }
        : { status: "failed", message: `${pathLabel} matches /${pattern}/`, actual: val };
    }
    case "startsWith": {
      const s = typeof val === "string" ? (v.trim ? val.trim() : val) : val;
      const sv = v.trim && typeof v.value === "string" ? v.value.trim() : v.value;
      return typeof s === "string" && s.startsWith(sv)
        ? { status: "passed", message: `${pathLabel} starts with "${v.value}"` }
        : { status: "failed", message: `${pathLabel} starts with "${v.value}"`, actual: val };
    }
    case "endsWith": {
      const s = typeof val === "string" ? (v.trim ? val.trim() : val) : val;
      const sv = v.trim && typeof v.value === "string" ? v.value.trim() : v.value;
      return typeof s === "string" && s.endsWith(sv)
        ? { status: "passed", message: `${pathLabel} ends with "${v.value}"` }
        : { status: "failed", message: `${pathLabel} ends with "${v.value}"`, actual: val };
    }
    case "isEmpty":
      return val === "" || val === null || val === undefined || (Array.isArray(val) && val.length === 0) || (typeof val === "object" && Object.keys(val as object).length === 0)
        ? { status: "passed", message: `${pathLabel} is empty` }
        : { status: "failed", message: `${pathLabel} is empty`, actual: val };
    case "isNotEmpty":
      return !(val === "" || val === null || val === undefined || (Array.isArray(val) && val.length === 0))
        ? { status: "passed", message: `${pathLabel} is not empty` }
        : { status: "failed", message: `${pathLabel} is not empty`, actual: val };
    case "schema": {
      if (!v.properties || typeof val !== "object" || val === null) {
        return { status: "failed", message: `${pathLabel} matches schema`, actual: typeof val };
      }
      for (const [key, expectedType] of Object.entries(v.properties)) {
        const fieldVal = (val as Record<string, unknown>)[key];
        const actualType = Array.isArray(fieldVal) ? "array" : typeof fieldVal;
        if (actualType !== expectedType) {
          return { status: "failed", message: `${pathLabel}.${key} expected ${expectedType}`, actual: actualType };
        }
      }
      return { status: "passed", message: `${pathLabel} matches schema` };
    }
    case "arrayContains":
      return Array.isArray(val) && val.includes(v.value)
        ? { status: "passed", message: `${pathLabel} contains ${JSON.stringify(v.value)}` }
        : { status: "failed", message: `${pathLabel} contains ${JSON.stringify(v.value)}`, actual: val };
    case "arrayUnique": {
      if (!Array.isArray(val)) return { status: "failed", message: `${pathLabel} has unique values`, actual: "not an array" };
      const items = v.field ? val.map((i: any) => i?.[v.field]) : val;
      const unique = new Set(items.map((i: any) => JSON.stringify(i))).size === items.length;
      return unique
        ? { status: "passed", message: `${pathLabel} has unique values` }
        : { status: "failed", message: `${pathLabel} has unique values` };
    }
    case "isDate": {
      const d = new Date(val as string);
      return !isNaN(d.getTime())
        ? { status: "passed", message: `${pathLabel} is a valid date` }
        : { status: "failed", message: `${pathLabel} is a valid date`, actual: val };
    }
    case "dateBefore": {
      const d = new Date(val as string);
      return !isNaN(d.getTime()) && d < new Date(v.value)
        ? { status: "passed", message: `${pathLabel} is before ${v.value}` }
        : { status: "failed", message: `${pathLabel} is before ${v.value}`, actual: val };
    }
    case "dateAfter": {
      const d = new Date(val as string);
      return !isNaN(d.getTime()) && d > new Date(v.value)
        ? { status: "passed", message: `${pathLabel} is after ${v.value}` }
        : { status: "failed", message: `${pathLabel} is after ${v.value}`, actual: val };
    }
    default:
      return { status: "passed", message: `${v.type} (not validated server-side)` };
  }
}

app.post("/api/projects/:id/quick-run", async (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const testConfig = req.body;
  if (!testConfig?.method || !testConfig?.endpoint) {
    return res.status(400).json({ error: "Test config with method and endpoint is required" });
  }

  // Resolve environment
  const envName = req.query.env as string;
  let baseUrl = ((project as any).baseUrl || "").replace(/\/?$/, "/");
  let authType = (project as any).authType;
  let creds = (project as any).credentials;
  if (envName) {
    const env = ((project as any).environments || []).find((e: any) => e.name === envName);
    if (env) {
      if (env.baseUrl) baseUrl = env.baseUrl.replace(/\/?$/, "/");
      if (env.authType) { authType = env.authType; creds = env.credentials || creds; }
    }
  }

  // Substitute variables
  const endpoint = substituteVariables(testConfig.endpoint);
  const body = substituteDeep(testConfig.body);
  const queryParams = substituteDeep(testConfig.queryParams) as Record<string, string> | undefined;
  const extraHeaders = substituteDeep(testConfig.headers) as Record<string, string> | undefined;

  // Build URL
  let url = baseUrl + endpoint.replace(/^\//, "");
  if (queryParams && typeof queryParams === "object" && Object.keys(queryParams).length > 0) {
    const qs = new URLSearchParams(queryParams).toString();
    url += (url.includes("?") ? "&" : "?") + qs;
  }

  // Build headers
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...(extraHeaders || {}),
  };

  if (authType === "bearer" && creds?.token) {
    requestHeaders["Authorization"] = `Bearer ${creds.token}`;
  } else if (authType === "basic" && creds?.username && creds?.password) {
    const encoded = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
    requestHeaders["Authorization"] = `Basic ${encoded}`;
  } else if (authType === "api-key" && creds?.apiKey) {
    requestHeaders[creds.apiKeyHeader || "X-API-Key"] = creds.apiKey;
  }

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), testConfig.timeout || 30000);

    const fetchOpts: RequestInit = {
      method: testConfig.method.toUpperCase(),
      headers: requestHeaders,
      signal: controller.signal,
    };
    if (body && ["POST", "PUT", "PATCH"].includes(testConfig.method.toUpperCase())) {
      fetchOpts.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOpts);
    clearTimeout(timeout);

    const duration = Date.now() - startTime;
    const status = response.status;
    let data: any;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });

    // Check expected status
    const expectedStatus = testConfig.expectedStatus || 200;
    const statusPassed = status === expectedStatus;

    // Run validations
    const validationResults = (testConfig.validations || [])
      .filter((v: any) => !v.disabled)
      .map((v: any) => runServerValidation(data, v));
    const allValidationsPassed = validationResults.every((r: any) => r.status === "passed");
    const passed = statusPassed && allValidationsPassed;

    res.json({
      passed,
      duration,
      status,
      expectedStatus,
      statusPassed,
      data,
      headers: responseHeaders,
      validations: validationResults,
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    if (err.name === "AbortError") {
      return res.json({ passed: false, duration, error: `Request timed out after ${testConfig.timeout || 30000}ms`, status: null, expectedStatus: testConfig.expectedStatus || 200 });
    }
    return res.json({ passed: false, duration, error: `Request failed: ${err.message}`, status: null, expectedStatus: testConfig.expectedStatus || 200 });
  }
});

// --- Import / Export ---

app.post("/api/import/project", (req, res) => {
  const bundle = req.body;
  if (!bundle?.project || !Array.isArray(bundle?.suites)) {
    return res.status(400).json({ error: "Invalid project bundle format" });
  }

  if (!bundle.project.name || typeof bundle.project.name !== "string") {
    return res.status(400).json({ error: "Project name is required in bundle" });
  }

  const allProjects = getAllProjects();
  const project = bundle.project;

  // Generate safe, unique ID
  let baseId = sanitizeId(project.id || project.name);
  let id = baseId;
  let counter = 1;
  while (allProjects.some((p: { id: string }) => p.id === id)) {
    id = `${baseId}-${counter++}`;
  }
  project.id = id;

  if (!validateId(project.id)) {
    return res.status(400).json({ error: "Could not generate valid project ID" });
  }

  const dir = safePath(TEST_CONFIGS_DIR, project.id);
  if (!dir) return res.status(400).json({ error: "Invalid project ID" });
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Write all suites with validated filenames
  let imported = 0;
  for (const suiteEntry of bundle.suites) {
    const { fileName, ...suiteData } = suiteEntry;
    if (!suiteData.suite || typeof suiteData.suite !== "string") continue;

    const safeName = sanitizeId(fileName?.replace(/\.json$/, "") || suiteData.suite) + ".json";
    if (!validateFileName(safeName)) continue;

    const suitePath = safePath(dir, safeName);
    if (!suitePath) continue;

    fs.writeFileSync(suitePath, JSON.stringify(suiteData, null, 2), "utf-8");
    imported++;
  }

  createProject(project);
  syncProjectsFile();

  res.json({ project, suitesImported: imported });
});

// --- Run Tests (SSE streaming) ---

let activeRun: { projectId: string; kill: () => void } | null = null;

app.post("/api/run/:projectId", (req, res) => {
  if (!validateId(req.params.projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  if (activeRun) {
    return res.status(409).json({ error: `Tests already running for project "${activeRun.projectId}". Please wait.` });
  }

  const projectId = req.params.projectId;
  const grep = req.body?.grep;
  const envName = req.body?.env;
  const tags = req.body?.tags;

  if (grep && typeof grep !== "string") {
    return res.status(400).json({ error: "Invalid grep pattern" });
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Build command — hardcoded executable, user input (grep) passed via env vars only
  const command = "npx playwright test --retries=0";
  const env: Record<string, string | undefined> = { ...process.env, TEST_PROJECT: projectId };
  if (grep) env.TEST_GREP = grep;
  if (envName && typeof envName === "string") env.TEST_ENV = envName;
  if (tags && typeof tags === "string") env.TEST_TAGS = tags;

  const child = exec(command, {
    env,
    cwd: path.resolve("."),
    timeout: 120000,
  });

  activeRun = { projectId, kill: () => child.kill() };
  let fullOutput = "";

  function sendEvent(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    fullOutput += text;
    sendEvent("output", { text });
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    fullOutput += text;
    sendEvent("output", { text });
  });

  child.on("close", (code) => {
    activeRun = null;

    // Read the HTML report generated by Playwright
    let reportHtml = "";
    try {
      const reportPath = path.join(REPORT_DIR, "index.html");
      if (fs.existsSync(reportPath)) {
        reportHtml = fs.readFileSync(reportPath, "utf-8");
      }
    } catch { /* non-critical */ }

    // Save run to SQLite
    const runTimestamp = new Date().toISOString();
    try {
      insertRun({
        projectId,
        timestamp: runTimestamp,
        exitCode: code,
        grep: grep || null,
        output: fullOutput,
        reportHtml,
      });
    } catch { /* non-critical */ }

    // Send notifications (async, non-blocking)
    sendNotifications(projectId, { exitCode: code, grep: grep || null, timestamp: runTimestamp, output: fullOutput }).catch(() => {});

    sendEvent("done", { exitCode: code });
    res.end();
  });

  child.on("error", (err) => {
    activeRun = null;
    sendEvent("error", { message: err.message });
    res.end();
  });

  // Handle client disconnect — use res.on("close") not req.on("close")
  // because req "close" fires when the request body finishes, while
  // res "close" fires when the SSE connection is actually dropped.
  res.on("close", () => {
    if (activeRun?.projectId === projectId) {
      child.kill();
      activeRun = null;
    }
  });
});

// --- Run History API ---

app.get("/api/projects/:id/runs", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  res.json(listRuns(req.params.id));
});

app.get("/api/projects/:id/runs/:runId", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }

  const run = getRun(runId, req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });

  res.json(run);
});

app.get("/api/projects/:id/runs/:runId/report", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }

  const html = getRunReport(runId, req.params.id);
  if (!html) return res.status(404).send("Report not available for this run.");

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// --- JUnit XML Export ---

app.get("/api/projects/:id/runs/:runId/junit", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }

  const run = getRun(runId, req.params.id) as { id: number; projectId: string; timestamp: string; exitCode: number | null; output: string } | undefined;
  if (!run) return res.status(404).json({ error: "Run not found" });

  const xml = generateJUnitXml(run);
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="junit-run-${runId}.xml"`);
  res.send(xml);
});

function generateJUnitXml(run: { id: number; projectId: string; timestamp: string; exitCode: number | null; output: string }) {
  const tests = parseTestsFromOutput(run.output);

  // Group by suite
  const suites: Record<string, typeof tests[number][]> = {};
  for (const t of tests) {
    (suites[t.suite] ||= []).push(t);
  }

  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n';

  for (const [suiteName, suiteTests] of Object.entries(suites)) {
    const failures = suiteTests.filter(t => t.status === "failed").length;
    const skipped = suiteTests.filter(t => t.status === "skipped").length;
    const totalTime = suiteTests.reduce((sum, t) => {
      const ms = parseTimingMs(t.timing);
      return sum + ms;
    }, 0);

    xml += `  <testsuite name="${escXml(suiteName)}" tests="${suiteTests.length}" failures="${failures}" skipped="${skipped}" time="${(totalTime / 1000).toFixed(3)}" timestamp="${run.timestamp}">\n`;

    for (const t of suiteTests) {
      const timeSeconds = (parseTimingMs(t.timing) / 1000).toFixed(3);
      xml += `    <testcase name="${escXml(t.name)}" classname="${escXml(suiteName)}" time="${timeSeconds}"`;

      if (t.status === "failed") {
        xml += `>\n      <failure message="Test failed">${escXml(t.name)} failed</failure>\n    </testcase>\n`;
      } else if (t.status === "skipped") {
        xml += `>\n      <skipped/>\n    </testcase>\n`;
      } else {
        xml += `/>\n`;
      }
    }

    xml += `  </testsuite>\n`;
  }

  xml += `</testsuites>\n`;
  return xml;
}

function parseTimingMs(timing: string): number {
  if (!timing) return 0;
  const m = timing.match(/([\d.]+)(ms|s|m)/);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  if (m[2] === "ms") return val;
  if (m[2] === "s") return val * 1000;
  if (m[2] === "m") return val * 60000;
  return 0;
}

// --- CSV Export ---

app.get("/api/projects/:id/runs/:runId/csv", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }

  const run = getRun(runId, req.params.id) as { id: number; projectId: string; timestamp: string; exitCode: number | null; output: string } | undefined;
  if (!run) return res.status(404).json({ error: "Run not found" });

  const tests = parseTestsFromOutput(run.output);
  const escCsv = (s: string) => `"${s.replace(/"/g, '""')}"`;

  let csv = "Suite,Test Name,Status,Duration (ms)\n";
  for (const t of tests) {
    csv += `${escCsv(t.suite)},${escCsv(t.name)},${t.status},${parseTimingMs(t.timing)}\n`;
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="run-${runId}.csv"`);
  res.send(csv);
});

// --- PDF-friendly Report ---

app.get("/api/projects/:id/runs/:runId/pdf", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const runId = parseInt(req.params.runId, 10);
  if (isNaN(runId)) {
    return res.status(400).json({ error: "Invalid run ID" });
  }

  const run = getRun(runId, req.params.id) as { id: number; projectId: string; timestamp: string; exitCode: number | null; output: string } | undefined;
  if (!run) return res.status(404).json({ error: "Run not found" });

  const tests = parseTestsFromOutput(run.output);
  const passed = tests.filter(t => t.status === "passed").length;
  const failed = tests.filter(t => t.status === "failed").length;
  const skipped = tests.filter(t => t.status === "skipped").length;
  const date = new Date(run.timestamp).toLocaleString();

  // Group by suite
  const suites: Record<string, typeof tests> = {};
  for (const t of tests) {
    if (!suites[t.suite]) suites[t.suite] = [];
    suites[t.suite].push(t);
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Test Report — Run #${runId}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px; color: #1e293b; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; }
  .summary-item { padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 18px; }
  .summary-item span { display: block; font-size: 12px; font-weight: 400; color: #64748b; }
  .pass-bg { background: #dcfce7; color: #166534; }
  .fail-bg { background: #fee2e2; color: #991b1b; }
  .skip-bg { background: #f1f5f9; color: #475569; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  .status-pass { color: #16a34a; font-weight: 600; }
  .status-fail { color: #dc2626; font-weight: 600; }
  .status-skip { color: #64748b; font-weight: 600; }
  h2 { font-size: 16px; margin: 16px 0 8px; color: #334155; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
<h1>Test Run Report — #${runId}</h1>
<div class="meta">${esc(run.projectId)} &bull; ${esc(date)} &bull; ${tests.length} test(s)</div>
<div class="summary">
  <div class="summary-item pass-bg">${passed}<span>Passed</span></div>
  <div class="summary-item fail-bg">${failed}<span>Failed</span></div>
  <div class="summary-item skip-bg">${skipped}<span>Skipped</span></div>
</div>`;

  for (const [suite, suiteTests] of Object.entries(suites)) {
    html += `<h2>${esc(suite)}</h2><table><thead><tr><th>Test</th><th>Status</th><th>Duration</th></tr></thead><tbody>`;
    for (const t of suiteTests) {
      const cls = t.status === "passed" ? "status-pass" : t.status === "failed" ? "status-fail" : "status-skip";
      html += `<tr><td>${esc(t.name)}</td><td class="${cls}">${t.status.toUpperCase()}</td><td>${esc(t.timing || "-")}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<div class="no-print" style="text-align:center;margin-top:32px;">
    <button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;">Print / Save as PDF</button>
  </div></body></html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// --- Trends API ---

app.get("/api/projects/:id/trends", (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const runs = listRunsWithOutput(req.params.id) as { id: number; timestamp: string; exitCode: number | null; output: string }[];
  // Return last 20 runs for trend data
  const recent = runs.slice(0, 20).reverse();

  const trends = recent.map((run) => {
    const tests = parseTestsFromOutput(run.output);
    const passed = tests.filter(t => t.status === "passed").length;
    const failed = tests.filter(t => t.status === "failed").length;
    const skipped = tests.filter(t => t.status === "skipped").length;
    return {
      id: run.id,
      timestamp: run.timestamp,
      passed,
      failed,
      skipped,
      total: tests.length,
    };
  });

  res.json(trends);
});

function parseTestsFromOutput(output: string) {
  const clean = (output || "").replace(/\x1b\[[0-9;]*m/g, "");
  const lines = clean.split("\n");

  interface TestResult { suite: string; name: string; status: string; timing: string }
  const tests: TestResult[] = [];

  for (const line of lines) {
    const m = line.match(/^\s*(✓|ok|✘|✗|x|-)\s+\d+\s+\[.*?\]\s+›\s+[^›]+›\s+(.+?)\s+›\s+(.+?)(?:\s+\(([^)]+)\))?\s*$/);
    if (m) {
      const statusChar = m[1];
      let status = "skipped";
      if (statusChar === "✓" || statusChar === "ok") status = "passed";
      else if (statusChar === "✘" || statusChar === "✗" || statusChar === "x") status = "failed";
      tests.push({ suite: m[2].trim(), name: m[3].trim(), status, timing: m[4] || "" });
    }
  }

  return tests;
}

// --- Response Comparison / Snapshots ---

// Capture a snapshot: run all tests in a project and store responses
app.post("/api/projects/:id/snapshot", async (req, res) => {
  if (!validateId(req.params.id)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const dir = safePath(TEST_CONFIGS_DIR, req.params.id);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ error: "No test suites found" });

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const allTests: { suite: string; test: any }[] = [];
  for (const f of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      for (const t of content.tests || []) {
        if (t.skip) continue;
        allTests.push({ suite: content.suite || f, test: t });
      }
    } catch { /* skip invalid */ }
  }

  if (allTests.length === 0) return res.status(400).json({ error: "No tests to snapshot" });

  // Build auth headers once
  const baseUrl = ((project as any).baseUrl || "").replace(/\/?$/, "/");
  const authType = (project as any).authType;
  const creds = (project as any).credentials;
  const authHeaders: Record<string, string> = {};
  if (authType === "bearer" && creds?.token) {
    authHeaders["Authorization"] = `Bearer ${creds.token}`;
  } else if (authType === "basic" && creds?.username && creds?.password) {
    authHeaders["Authorization"] = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
  } else if (authType === "api-key" && creds?.apiKey) {
    authHeaders[creds.apiKeyHeader || "X-API-Key"] = creds.apiKey;
  }

  // Create a run record for the snapshot
  const runId = insertRun({
    projectId: req.params.id,
    timestamp: new Date().toISOString(),
    exitCode: 0,
    grep: null,
    output: "[snapshot]",
    reportHtml: "",
  }) as number;

  const results: any[] = [];
  for (const { suite, test } of allTests) {
    let url = baseUrl + (test.endpoint || "").replace(/^\//, "");
    if (test.queryParams && typeof test.queryParams === "object") {
      const qs = new URLSearchParams(test.queryParams).toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...authHeaders,
      ...(test.headers || {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), test.timeout || 30000);
      const start = Date.now();

      const fetchOpts: RequestInit = { method: (test.method || "GET").toUpperCase(), headers, signal: controller.signal };
      if (test.body && ["POST", "PUT", "PATCH"].includes(fetchOpts.method as string)) {
        fetchOpts.body = typeof test.body === "string" ? test.body : JSON.stringify(test.body);
      }

      const response = await fetch(url, fetchOpts);
      clearTimeout(timeout);
      const elapsed = Date.now() - start;

      const ct = response.headers.get("content-type") || "";
      let body: any;
      if (ct.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      results.push({
        runId,
        projectId: req.params.id,
        suite,
        testName: test.name || test.endpoint,
        method: test.method || "GET",
        endpoint: test.endpoint || "",
        status: response.status === (test.expectedStatus || 200) ? "passed" : "failed",
        httpStatus: response.status,
        responseBody: typeof body === "string" ? body : JSON.stringify(body),
        responseTime: elapsed,
      });
    } catch (err: any) {
      results.push({
        runId,
        projectId: req.params.id,
        suite,
        testName: test.name || test.endpoint,
        method: test.method || "GET",
        endpoint: test.endpoint || "",
        status: "failed",
        httpStatus: 0,
        responseBody: JSON.stringify({ error: err.message }),
        responseTime: 0,
      });
    }
  }

  insertRunResults(results);

  const passed = results.filter(r => r.status === "passed").length;
  const failed = results.length - passed;

  res.json({ runId, total: results.length, passed, failed });
});

// Get stored results for a run
app.get("/api/projects/:id/runs/:runId/results", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  const runId = parseInt(req.params.runId);
  if (isNaN(runId)) return res.status(400).json({ error: "Invalid run ID" });

  const results = getRunResults(runId, req.params.id);
  res.json(results);
});

// Compare two runs: side-by-side diff of response bodies
app.get("/api/projects/:id/compare/:runId1/:runId2", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  const runId1 = parseInt(req.params.runId1);
  const runId2 = parseInt(req.params.runId2);
  if (isNaN(runId1) || isNaN(runId2)) return res.status(400).json({ error: "Invalid run IDs" });

  const results1 = getRunResults(runId1, req.params.id) as any[];
  const results2 = getRunResults(runId2, req.params.id) as any[];

  // Index by suite::testName
  const map1: Record<string, any> = {};
  const map2: Record<string, any> = {};
  for (const r of results1) map1[r.suite + "::" + r.testName] = r;
  for (const r of results2) map2[r.suite + "::" + r.testName] = r;

  const allKeys = new Set([...Object.keys(map1), ...Object.keys(map2)]);
  const comparisons: any[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const r1 = map1[key];
    const r2 = map2[key];

    let bodyDiff = "unchanged";
    if (!r1) bodyDiff = "added";
    else if (!r2) bodyDiff = "removed";
    else if (r1.responseBody !== r2.responseBody) bodyDiff = "changed";

    comparisons.push({
      key,
      suite: (r1 || r2).suite,
      testName: (r1 || r2).testName,
      method: (r1 || r2).method,
      endpoint: (r1 || r2).endpoint,
      run1: r1 ? { status: r1.status, httpStatus: r1.httpStatus, responseBody: r1.responseBody, responseTime: r1.responseTime } : null,
      run2: r2 ? { status: r2.status, httpStatus: r2.httpStatus, responseBody: r2.responseBody, responseTime: r2.responseTime } : null,
      bodyDiff,
    });
  }

  res.json({ comparisons });
});

// --- Schema Drift Detection ---

function extractSchema(data: any, maxDepth = 5): any {
  if (maxDepth <= 0) return typeof data;
  if (data === null || data === undefined) return "null";
  if (Array.isArray(data)) {
    if (data.length === 0) return { _type: "array", _items: "unknown" };
    return { _type: "array", _items: extractSchema(data[0], maxDepth - 1), _length: data.length };
  }
  if (typeof data === "object") {
    const schema: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      schema[key] = extractSchema(val, maxDepth - 1);
    }
    return { _type: "object", _fields: schema };
  }
  return typeof data; // "string", "number", "boolean"
}

function compareSchemas(baseline: any, current: any, path = ""): any[] {
  const diffs: any[] = [];
  const bType = typeof baseline === "string" ? baseline : baseline?._type;
  const cType = typeof current === "string" ? current : current?._type;

  if (bType !== cType) {
    diffs.push({ path: path || "(root)", change: "type_changed", from: bType, to: cType });
    return diffs;
  }

  if (bType === "object" && baseline._fields && current._fields) {
    const bFields = baseline._fields;
    const cFields = current._fields;
    const allKeys = new Set([...Object.keys(bFields), ...Object.keys(cFields)]);
    for (const key of allKeys) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (!(key in bFields)) {
        diffs.push({ path: fieldPath, change: "field_added", type: typeof current._fields[key] === "string" ? current._fields[key] : current._fields[key]?._type });
      } else if (!(key in cFields)) {
        diffs.push({ path: fieldPath, change: "field_removed", type: typeof baseline._fields[key] === "string" ? baseline._fields[key] : baseline._fields[key]?._type });
      } else {
        diffs.push(...compareSchemas(bFields[key], cFields[key], fieldPath));
      }
    }
  }

  if (bType === "array" && baseline._items && current._items) {
    diffs.push(...compareSchemas(baseline._items, current._items, path + "[]"));
  }

  return diffs;
}

// Capture current schemas as baseline
app.post("/api/projects/:id/schema-baseline", async (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });

  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const dir = safePath(TEST_CONFIGS_DIR, req.params.id);
  if (!dir || !fs.existsSync(dir)) return res.status(404).json({ error: "No test suites" });

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const allTests: { suite: string; test: any }[] = [];
  for (const f of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      for (const t of content.tests || []) {
        if (t.skip) continue;
        allTests.push({ suite: content.suite || f, test: t });
      }
    } catch { /* skip */ }
  }

  if (allTests.length === 0) return res.status(400).json({ error: "No tests found" });

  // Build auth headers
  const baseUrl = ((project as any).baseUrl || "").replace(/\/?$/, "/");
  const authType = (project as any).authType;
  const creds = (project as any).credentials;
  const authHeaders: Record<string, string> = {};
  if (authType === "bearer" && creds?.token) authHeaders["Authorization"] = `Bearer ${creds.token}`;
  else if (authType === "basic" && creds?.username && creds?.password)
    authHeaders["Authorization"] = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
  else if (authType === "api-key" && creds?.apiKey) authHeaders[creds.apiKeyHeader || "X-API-Key"] = creds.apiKey;

  const baselines: any[] = [];
  let captured = 0;
  const now = new Date().toISOString();

  for (const { suite, test } of allTests) {
    let url = baseUrl + (test.endpoint || "").replace(/^\//, "");
    if (test.queryParams && typeof test.queryParams === "object") {
      const qs = new URLSearchParams(test.queryParams).toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json", "Accept": "application/json",
      ...authHeaders, ...(test.headers || {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), test.timeout || 30000);
      const fetchOpts: RequestInit = { method: (test.method || "GET").toUpperCase(), headers, signal: controller.signal };
      if (test.body && ["POST", "PUT", "PATCH"].includes(fetchOpts.method as string)) {
        fetchOpts.body = typeof test.body === "string" ? test.body : JSON.stringify(test.body);
      }

      const response = await fetch(url, fetchOpts);
      clearTimeout(timeout);

      const ct = response.headers.get("content-type") || "";
      let data: any;
      if (ct.includes("application/json")) data = await response.json();
      else data = await response.text();

      const schema = extractSchema(data);
      baselines.push({
        projectId: req.params.id,
        suite,
        testName: test.name || test.endpoint,
        endpoint: test.endpoint || "",
        schema: JSON.stringify(schema),
        capturedAt: now,
      });
      captured++;
    } catch { /* skip failed requests */ }
  }

  if (baselines.length > 0) upsertSchemaBaselines(baselines);

  res.json({ captured, total: allTests.length });
});

// Get current baselines
app.get("/api/projects/:id/schema-baseline", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  const baselines = getSchemaBaselines(req.params.id);
  res.json(baselines);
});

// Delete baselines
app.delete("/api/projects/:id/schema-baseline", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  deleteSchemaBaselines(req.params.id);
  res.json({ ok: true });
});

// Detect drift: compare current responses against stored baselines
app.post("/api/projects/:id/schema-drift", async (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });

  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const baselines = getSchemaBaselines(req.params.id) as any[];
  if (baselines.length === 0) return res.status(400).json({ error: "No schema baselines captured. Capture a baseline first." });

  // Build auth headers
  const baseUrl = ((project as any).baseUrl || "").replace(/\/?$/, "/");
  const authType = (project as any).authType;
  const creds = (project as any).credentials;
  const authHeaders: Record<string, string> = {};
  if (authType === "bearer" && creds?.token) authHeaders["Authorization"] = `Bearer ${creds.token}`;
  else if (authType === "basic" && creds?.username && creds?.password)
    authHeaders["Authorization"] = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
  else if (authType === "api-key" && creds?.apiKey) authHeaders[creds.apiKeyHeader || "X-API-Key"] = creds.apiKey;

  // Load current test configs to get request details
  const dir = safePath(TEST_CONFIGS_DIR, req.params.id);
  const testMap: Record<string, any> = {};
  if (dir && fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
        for (const t of content.tests || []) {
          testMap[(content.suite || f) + "::" + (t.name || t.endpoint)] = t;
        }
      } catch { /* skip */ }
    }
  }

  const report: any[] = [];
  let drifted = 0;

  for (const bl of baselines) {
    const test = testMap[bl.suite + "::" + bl.testName];
    const endpoint = test?.endpoint || bl.endpoint;

    let url = baseUrl + endpoint.replace(/^\//, "");
    if (test?.queryParams && typeof test.queryParams === "object") {
      const qs = new URLSearchParams(test.queryParams).toString();
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json", "Accept": "application/json",
      ...authHeaders, ...(test?.headers || {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), test?.timeout || 30000);
      const fetchOpts: RequestInit = { method: (test?.method || "GET").toUpperCase(), headers, signal: controller.signal };
      if (test?.body && ["POST", "PUT", "PATCH"].includes(fetchOpts.method as string)) {
        fetchOpts.body = typeof test.body === "string" ? test.body : JSON.stringify(test.body);
      }

      const response = await fetch(url, fetchOpts);
      clearTimeout(timeout);

      const ct = response.headers.get("content-type") || "";
      let data: any;
      if (ct.includes("application/json")) data = await response.json();
      else data = await response.text();

      const currentSchema = extractSchema(data);
      const baselineSchema = JSON.parse(bl.schema);
      const diffs = compareSchemas(baselineSchema, currentSchema);

      if (diffs.length > 0) drifted++;
      report.push({
        suite: bl.suite,
        testName: bl.testName,
        endpoint,
        method: test?.method || "GET",
        baselineCapturedAt: bl.capturedAt,
        drifted: diffs.length > 0,
        diffs,
      });
    } catch (err: any) {
      report.push({
        suite: bl.suite,
        testName: bl.testName,
        endpoint,
        method: test?.method || "GET",
        baselineCapturedAt: bl.capturedAt,
        drifted: true,
        diffs: [{ path: "(request)", change: "error", message: err.message }],
      });
      drifted++;
    }
  }

  res.json({ total: baselines.length, drifted, stable: baselines.length - drifted, report });
});

// --- Scheduled Test Runs ---

// Lightweight cron expression parser (minute hour dom month dow)
function parseCronField(field: string, min: number, max: number): number[] {
  const values: number[] = [];
  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    let range = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? parseInt(stepMatch[2]) : 1;

    if (range === "*") {
      for (let i = min; i <= max; i += step) values.push(i);
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      for (let i = a; i <= b; i += step) values.push(i);
    } else {
      values.push(parseInt(range));
    }
  }
  return values.filter(v => v >= min && v <= max);
}

function getNextCronRun(cronExpr: string, after: Date = new Date()): Date | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const minutes = parseCronField(parts[0], 0, 59);
  const hours = parseCronField(parts[1], 0, 23);
  const doms = parseCronField(parts[2], 1, 31);
  const months = parseCronField(parts[3], 1, 12);
  const dows = parseCronField(parts[4], 0, 6);

  if (!minutes.length || !hours.length) return null;

  const candidate = new Date(after.getTime() + 60000); // start 1 minute after
  candidate.setSeconds(0, 0);

  // Search up to 1 year ahead
  const limit = new Date(after.getTime() + 366 * 24 * 60 * 60 * 1000);

  while (candidate < limit) {
    if (months.includes(candidate.getMonth() + 1) &&
        (parts[2] === "*" || doms.includes(candidate.getDate())) &&
        (parts[4] === "*" || dows.includes(candidate.getDay())) &&
        hours.includes(candidate.getHours()) &&
        minutes.includes(candidate.getMinutes())) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return null;
}

function isValidCron(expr: string): boolean {
  return getNextCronRun(expr) !== null;
}

// Presets for common schedules
const CRON_PRESETS: Record<string, string> = {
  "every-5-min": "*/5 * * * *",
  "every-15-min": "*/15 * * * *",
  "every-30-min": "*/30 * * * *",
  "hourly": "0 * * * *",
  "every-6-hours": "0 */6 * * *",
  "daily-midnight": "0 0 * * *",
  "daily-9am": "0 9 * * *",
  "weekdays-9am": "0 9 * * 1-5",
};

// Schedule CRUD endpoints
app.get("/api/projects/:id/schedules", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  res.json(listSchedules(req.params.id));
});

app.post("/api/projects/:id/schedules", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  if (!getProject(req.params.id)) return res.status(404).json({ error: "Project not found" });

  const { name, cronExpr, preset } = req.body;
  const cron = preset ? CRON_PRESETS[preset] || cronExpr : cronExpr;

  if (!cron || !isValidCron(cron)) {
    return res.status(400).json({ error: "Invalid cron expression" });
  }

  const nextRun = getNextCronRun(cron);
  const id = insertSchedule({
    projectId: req.params.id,
    name: name || `Schedule (${cron})`,
    cronExpr: cron,
    enabled: 1,
    nextRunAt: nextRun ? nextRun.toISOString() : "",
    createdAt: new Date().toISOString(),
  });

  res.json({ id, cronExpr: cron, nextRunAt: nextRun?.toISOString() });
});

app.put("/api/projects/:id/schedules/:scheduleId", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  const scheduleId = parseInt(req.params.scheduleId);
  if (isNaN(scheduleId)) return res.status(400).json({ error: "Invalid schedule ID" });

  const existing = getSchedule(scheduleId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Schedule not found" });

  const { name, cronExpr, enabled } = req.body;
  const cron = cronExpr || (existing as any).cronExpr;

  if (cronExpr && !isValidCron(cronExpr)) {
    return res.status(400).json({ error: "Invalid cron expression" });
  }

  const isEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (existing as any).enabled;
  const nextRun = isEnabled ? getNextCronRun(cron) : null;

  updateSchedule({
    id: scheduleId,
    name: name || (existing as any).name,
    cronExpr: cron,
    enabled: isEnabled,
    nextRunAt: nextRun ? nextRun.toISOString() : "",
  });

  res.json({ ok: true });
});

app.delete("/api/projects/:id/schedules/:scheduleId", (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });
  const scheduleId = parseInt(req.params.scheduleId);
  if (isNaN(scheduleId)) return res.status(400).json({ error: "Invalid schedule ID" });

  deleteSchedule(scheduleId, req.params.id);
  res.json({ ok: true });
});

app.get("/api/cron-presets", (_req, res) => {
  res.json(CRON_PRESETS);
});

// --- Notification Engine ---

interface NotificationConfig {
  enabled?: boolean;
  onFailureOnly?: boolean;
  slack?: { webhookUrl?: string };
  teams?: { webhookUrl?: string };
  email?: { to?: string; smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPass?: string; from?: string };
}

async function sendNotifications(projectId: string, runSummary: { exitCode: number | null; grep?: string | null; timestamp: string; output: string }) {
  const project = getProject(projectId);
  if (!project) return;

  const config = (project.notifications || {}) as NotificationConfig;
  if (!config.enabled) return;

  const failed = runSummary.exitCode !== 0;
  if (config.onFailureOnly && !failed) return;

  const status = failed ? "FAILED" : "PASSED";
  const emoji = failed ? "\u274c" : "\u2705";

  // Extract pass/fail counts from output
  const passMatch = runSummary.output.match(/(\d+)\s+passed/);
  const failMatch = runSummary.output.match(/(\d+)\s+failed/);
  const skipMatch = runSummary.output.match(/(\d+)\s+skipped/);
  const passed = passMatch ? passMatch[1] : "0";
  const failedCount = failMatch ? failMatch[1] : "0";
  const skipped = skipMatch ? skipMatch[1] : "0";

  const runLabel = runSummary.grep ? ` (${runSummary.grep})` : "";
  const title = `${emoji} API Tests ${status}: ${project.name}${runLabel}`;
  const summary = `Passed: ${passed} | Failed: ${failedCount} | Skipped: ${skipped}`;
  const time = new Date(runSummary.timestamp).toLocaleString();

  // Send to Slack
  if (config.slack?.webhookUrl) {
    try {
      const color = failed ? "#e74c3c" : "#2ecc71";
      const payload = {
        attachments: [{
          color,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*Status:* ${status}` },
              { type: "mrkdwn", text: `*Project:* ${project.name}` },
              { type: "mrkdwn", text: `*Results:* ${summary}` },
              { type: "mrkdwn", text: `*Time:* ${time}` },
            ]},
          ],
        }],
      };
      await fetch(config.slack.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log(`[Notifications] Slack notification sent for project "${project.name}"`);
    } catch (err: any) {
      console.error(`[Notifications] Slack error:`, err.message);
    }
  }

  // Send to Microsoft Teams
  if (config.teams?.webhookUrl) {
    try {
      const themeColor = failed ? "e74c3c" : "2ecc71";
      const payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor,
        summary: title,
        sections: [{
          activityTitle: title,
          facts: [
            { name: "Project", value: project.name },
            { name: "Status", value: status },
            { name: "Results", value: summary },
            { name: "Time", value: time },
          ],
          markdown: true,
        }],
      };
      await fetch(config.teams.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log(`[Notifications] Teams notification sent for project "${project.name}"`);
    } catch (err: any) {
      console.error(`[Notifications] Teams error:`, err.message);
    }
  }

  // Send email via SMTP (basic implementation using raw TCP — or skip if no config)
  if (config.email?.to && config.email?.smtpHost) {
    try {
      const net = await import("net");
      const { smtpHost, smtpPort = 25, smtpUser, smtpPass, from = "api-test-manager@localhost" } = config.email;
      const to = config.email.to;

      const emailBody = [
        `Subject: ${title}`,
        `From: ${from}`,
        `To: ${to}`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        `<h2>${title}</h2>`,
        `<p><strong>Project:</strong> ${project.name}</p>`,
        `<p><strong>Results:</strong> ${summary}</p>`,
        `<p><strong>Time:</strong> ${time}</p>`,
      ].join("\r\n");

      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(smtpPort, smtpHost, () => {
          const commands = [
            `EHLO localhost`,
            ...(smtpUser && smtpPass ? [
              `AUTH LOGIN`,
              Buffer.from(smtpUser).toString("base64"),
              Buffer.from(smtpPass).toString("base64"),
            ] : []),
            `MAIL FROM:<${from}>`,
            `RCPT TO:<${to}>`,
            `DATA`,
            `${emailBody}\r\n.`,
            `QUIT`,
          ];
          let i = 0;
          socket.on("data", () => {
            if (i < commands.length) {
              socket.write(commands[i] + "\r\n");
              i++;
            }
          });
        });
        socket.on("end", () => resolve());
        socket.on("error", (err: Error) => reject(err));
        socket.setTimeout(10000, () => { socket.destroy(); reject(new Error("SMTP timeout")); });
      });
      console.log(`[Notifications] Email sent to ${to} for project "${project.name}"`);
    } catch (err: any) {
      console.error(`[Notifications] Email error:`, err.message);
    }
  }
}

// Test notification endpoint
app.post("/api/projects/:id/test-notification", async (req, res) => {
  if (!validateId(req.params.id)) return res.status(400).json({ error: "Invalid project ID" });

  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const config = (project.notifications || {}) as NotificationConfig;
  if (!config.slack?.webhookUrl && !config.teams?.webhookUrl && !config.email?.to) {
    return res.status(400).json({ error: "No notification channels configured" });
  }

  // Send a test notification
  const mockSummary = {
    exitCode: 1,
    grep: null as string | null,
    timestamp: new Date().toISOString(),
    output: "3 passed\n1 failed\n0 skipped",
  };

  // Temporarily force enabled for test
  const origEnabled = config.enabled;
  const origFailOnly = config.onFailureOnly;
  (project.notifications as any).enabled = true;
  (project.notifications as any).onFailureOnly = false;

  try {
    await sendNotifications(req.params.id, mockSummary);
    res.json({ ok: true, message: "Test notification sent" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    (project.notifications as any).enabled = origEnabled;
    (project.notifications as any).onFailureOnly = origFailOnly;
  }
});

// --- Scheduler Engine (runs in-process) ---

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function startScheduler() {
  if (schedulerTimer) return;

  // Check every 30 seconds
  schedulerTimer = setInterval(async () => {
    const now = new Date();
    const schedules = getAllEnabledSchedules() as any[];

    for (const sched of schedules) {
      if (!sched.nextRunAt) continue;
      const nextRun = new Date(sched.nextRunAt);
      if (now < nextRun) continue;

      // Time to run!
      console.log(`[Scheduler] Running scheduled tests for project "${sched.projectName}" (schedule: ${sched.name})`);

      try {
        // Execute tests via Playwright
        const projectId = sched.projectId;
        const timestamp = new Date().toISOString();

        await new Promise<void>((resolve) => {
          const cmd = "npx playwright test --retries=0";
          const env: Record<string, string | undefined> = { ...process.env, TEST_PROJECT: projectId };
          exec(cmd, { env, cwd: path.resolve("."), maxBuffer: 10 * 1024 * 1024, timeout: 120000 }, (error, stdout, stderr) => {
            const output = stdout + "\n" + stderr;
            const exitCode = error ? error.code || 1 : 0;

            // Read the HTML report generated by Playwright
            let reportHtml = "";
            const reportPath = path.join(REPORT_DIR, "index.html");
            try { reportHtml = fs.readFileSync(reportPath, "utf-8"); } catch { /* no report */ }

            insertRun({ projectId, timestamp, exitCode, grep: `[scheduled:${sched.name}]`, output, reportHtml });
            console.log(`[Scheduler] Completed: project="${sched.projectName}", exitCode=${exitCode}`);

            // Send notifications for scheduled runs
            sendNotifications(projectId, { exitCode, grep: `[scheduled:${sched.name}]`, timestamp, output }).catch(() => {});

            resolve();
          });
        });
      } catch (err: any) {
        console.error(`[Scheduler] Error running schedule ${sched.id}:`, err.message);
      }

      // Update last run and compute next run
      const nextCron = getNextCronRun(sched.cronExpr);
      updateScheduleRun(sched.id, now.toISOString(), nextCron ? nextCron.toISOString() : "");
    }
  }, 30000);

  console.log("[Scheduler] Started — checking every 30s");
}

// --- Settings API ---

app.get("/api/settings", (_req, res) => {
  res.json({
    dataDir: getDataDir(),
  });
});

app.put("/api/settings", (req, res) => {
  const { dataDir } = req.body;
  if (!dataDir || typeof dataDir !== "string") {
    return res.status(400).json({ error: "dataDir is required" });
  }

  const resolved = path.resolve(dataDir);

  // Verify the directory exists or can be created
  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    // Test write access
    const testFile = path.join(resolved, ".write-test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
  } catch {
    return res.status(400).json({ error: "Cannot write to that directory" });
  }

  setDataDir(resolved);
  res.json({
    dataDir: resolved,
    message: "Data directory updated. Restart the server for changes to take effect.",
    requiresRestart: true,
  });
});

app.post("/api/settings/browse", (req, res) => {
  const { dir } = req.body;
  const target = dir ? path.resolve(dir) : require("os").homedir();

  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      return res.status(400).json({ error: "Not a valid directory" });
    }

    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map(e => ({
        name: e.name,
        path: path.join(target, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(target);
    res.json({
      current: target,
      parent: parent !== target ? parent : null,
      entries,
    });
  } catch {
    return res.status(400).json({ error: "Cannot read directory" });
  }
});

app.post("/api/settings/mkdir", (req, res) => {
  const { dir } = req.body;
  if (!dir || typeof dir !== "string") {
    return res.status(400).json({ error: "dir is required" });
  }
  try {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    res.json({ ok: true, path: resolved });
  } catch (err: any) {
    res.status(400).json({ error: `Cannot create directory: ${err.message}` });
  }
});

// --- Global Error Handler ---

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// --- Start Server ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Test Manager running at http://localhost:${PORT}`);
  startScheduler();
});
