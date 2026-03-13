import * as fs from "fs";
import * as path from "path";
import { runTestSuite } from "../src/helpers/test-runner";
import { TestSuiteConfig } from "../src/types/test-config.types";
import { TEST_CONFIGS_DIR } from "../src/data-dir";

const configDir = TEST_CONFIGS_DIR;
const targetProject = process.env.TEST_PROJECT;
const targetTags = process.env.TEST_TAGS
  ? process.env.TEST_TAGS.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
  : [];

// Collect all project folders (or just the target)
const projectDirs = fs.readdirSync(configDir).filter((d) => {
  const fullPath = path.join(configDir, d);
  if (!fs.statSync(fullPath).isDirectory()) return false;
  if (targetProject) return d === targetProject;
  return true;
});

for (const projectDir of projectDirs) {
  const dir = path.join(configDir, projectDir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "fixtures.json");

  // Load shared fixtures if present
  const fixturesPath = path.join(dir, "fixtures.json");
  const sharedFixtures: Record<string, unknown> = fs.existsSync(fixturesPath)
    ? JSON.parse(fs.readFileSync(fixturesPath, "utf-8"))
    : {};

  for (const file of files) {
    const filePath = path.join(dir, file);
    const config: TestSuiteConfig = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );

    // Merge shared fixtures with suite-level fixtures (suite takes precedence)
    if (Object.keys(sharedFixtures).length > 0 || config.fixtures) {
      config.fixtures = { ...sharedFixtures, ...config.fixtures };
    }

    // Filter by tags if TEST_TAGS is set
    if (targetTags.length > 0) {
      config.tests = config.tests.filter((tc) => {
        const testTags = (tc.tags || []).map((t) => t.toLowerCase());
        return targetTags.some((tag) => testTags.includes(tag));
      });
      if (config.tests.length === 0) continue;
    }

    runTestSuite(config);
  }
}
