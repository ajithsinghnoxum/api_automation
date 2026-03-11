import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

interface ProjectConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: "none" | "basic" | "bearer" | "api-key";
  credentials: {
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
    apiKeyHeader?: string;
  };
  environments?: {
    name: string;
    baseUrl?: string;
    authType?: string;
    credentials?: Record<string, string>;
  }[];
}

function loadProjects(): ProjectConfig[] {
  const file = path.resolve("projects.config.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function getAuthHeaders(project: ProjectConfig): Record<string, string> {
  switch (project.authType) {
    case "bearer":
      return project.credentials.token
        ? { Authorization: `Bearer ${project.credentials.token}` }
        : {};
    case "basic": {
      const { username, password } = project.credentials;
      if (!username) return {};
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "api-key": {
      const header = project.credentials.apiKeyHeader || "X-API-Key";
      return project.credentials.apiKey
        ? { [header]: project.credentials.apiKey }
        : {};
    }
    default:
      return {};
  }
}

const allProjects = loadProjects();
const targetProject = process.env.TEST_PROJECT;
const targetEnv = process.env.TEST_ENV;
const projects = targetProject
  ? allProjects.filter((p) => p.id === targetProject)
  : allProjects;

// Apply environment overrides if TEST_ENV is specified
const resolvedProjects = projects.map((p) => {
  if (!targetEnv || !p.environments?.length) return p;
  const env = p.environments.find((e) => e.name === targetEnv);
  if (!env) return p;
  return {
    ...p,
    baseUrl: env.baseUrl || p.baseUrl,
    authType: (env.authType || p.authType) as ProjectConfig["authType"],
    credentials: { ...p.credentials, ...(env.credentials || {}) },
  };
});

const grepPattern = process.env.TEST_GREP;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 1,
  workers: 4,
  timeout: 30_000,
  grep: grepPattern ? new RegExp(grepPattern) : undefined,

  reporter: [
    ["list"],
    ["./src/reporters/html-reporter.ts"],
  ],

  projects: resolvedProjects.map((p) => ({
    name: p.name,
    testMatch: "**/*.api.spec.ts",
    use: {
      baseURL: p.baseUrl.replace(/\/?$/, "/"),
      extraHTTPHeaders: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...getAuthHeaders(p),
      },
      ignoreHTTPSErrors: true,
      httpCredentials: p.authType === "basic" && p.credentials.username
        ? {
            username: p.credentials.username,
            password: p.credentials.password || "",
            send: "always" as const,
          }
        : undefined,
    },
    metadata: { projectId: p.id },
  })),
});
