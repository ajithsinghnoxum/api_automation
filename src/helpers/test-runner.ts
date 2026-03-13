import { test, expect } from "@playwright/test";
import { randomUUID, randomInt } from "crypto";
import { ApiHelper } from "./api.helper";
import { tryValidation, runValidation, ValidationResult, getValueByPath } from "./validator";
import { TestSuiteConfig, TestCaseConfig, Validation } from "../types/test-config.types";

// Built-in variable generators (called fresh each time they're referenced)
function getBuiltinVar(name: string): string | undefined {
  switch (name) {
    case "$timestamp":
      return String(Date.now());
    case "$isoDate":
      return new Date().toISOString();
    case "$guid":
    case "$uuid":
      return randomUUID();
    case "$randomInt":
      return String(randomInt(1, 100000));
    case "$randomEmail":
      return `test${randomInt(1000, 99999)}@example.com`;
    case "$randomString":
      return randomUUID().replace(/-/g, "").slice(0, 12);
    default:
      return undefined;
  }
}

function replaceVariables(str: string, vars: Record<string, unknown>): string {
  return str.replace(/\{\{(\$?\w+)\}\}/g, (match, name) => {
    // 1. Check extracted/chained variables
    if (name in vars) {
      return String(vars[name]);
    }
    // 2. Check built-in variables ($timestamp, $guid, etc.)
    if (name.startsWith("$")) {
      const builtin = getBuiltinVar(name);
      if (builtin !== undefined) return builtin;
    }
    // 3. Check process.env
    if (name in process.env) {
      return process.env[name]!;
    }
    return match; // leave unresolved placeholders as-is
  });
}

function resolveValue(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === "string") {
    const resolved = replaceVariables(value, vars);
    // If the entire string was a single variable, return the original type
    const singleVarMatch = value.match(/^\{\{(\$?\w+)\}\}$/);
    if (singleVarMatch && singleVarMatch[1] in vars) {
      return vars[singleVarMatch[1]];
    }
    return resolved;
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, vars));
  if (value && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, vars);
    }
    return resolved;
  }
  return value;
}

/**
 * Resolve $ref references in values, e.g. { "$ref": "fixtures.newUser" }
 * Replaces the reference with the actual fixture data.
 */
function resolveRefs(value: unknown, fixtures: Record<string, unknown>): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$ref === "string") {
      // Parse path like "fixtures.newUser" or just "newUser"
      const refPath = obj.$ref.replace(/^fixtures\./, "");
      const parts = refPath.split(".");
      let resolved: unknown = fixtures;
      for (const p of parts) {
        if (resolved && typeof resolved === "object") {
          resolved = (resolved as Record<string, unknown>)[p];
        } else {
          resolved = undefined;
          break;
        }
      }
      return resolved !== undefined ? JSON.parse(JSON.stringify(resolved)) : value;
    }
    // Recurse into object properties
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveRefs(v, fixtures);
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveRefs(v, fixtures));
  }
  return value;
}

/**
 * Evaluate a hook expression. Provides context: { request, response, vars, env }.
 * Returns the (possibly modified) context object.
 */
function evaluateHook(
  code: string,
  context: {
    request: { method: string; endpoint: string; headers?: Record<string, string>; body?: Record<string, unknown> };
    response?: { status: number; data: unknown };
    vars: Record<string, unknown>;
    env: Record<string, string | undefined>;
  }
): typeof context {
  const fn = new Function("ctx", `with(ctx) { ${code} } return ctx;`);
  return fn(context);
}

function resolveTestCase(tc: TestCaseConfig, vars: Record<string, unknown>): TestCaseConfig {
  return {
    ...tc,
    endpoint: replaceVariables(tc.endpoint, vars),
    headers: tc.headers
      ? (resolveValue(tc.headers, vars) as Record<string, string>)
      : undefined,
    queryParams: tc.queryParams
      ? (resolveValue(tc.queryParams, vars) as Record<string, string | number>)
      : undefined,
    body: tc.body
      ? (resolveValue(tc.body, vars) as Record<string, unknown>)
      : undefined,
  };
}

export function runTestSuite(config: TestSuiteConfig) {
  let api: ApiHelper;

  // Suite-level fixtures for $ref resolution
  const fixtures: Record<string, unknown> = config.fixtures || {};

  // Each suite gets its own isolated variable store (safe for parallel execution)
  const vars: Record<string, unknown> = {};

  // Use serial mode when any test uses extract (chaining requires order)
  const hasChaining = config.tests.some((tc) => tc.extract);

  test.describe(config.suite, () => {
    if (hasChaining) {
      test.describe.configure({ mode: "serial" });
    }

    test.beforeEach(async ({ request }) => {
      api = new ApiHelper(request);
    });

    for (let tc of config.tests) {
      // Resolve $ref in the test case before anything else
      if (Object.keys(fixtures).length > 0) {
        tc = resolveRefs(tc, fixtures) as TestCaseConfig;
      }

      // Skip support
      if (tc.skip) {
        test.skip(`${tc.method} ${tc.endpoint} - ${tc.name}`, async () => {});
        continue;
      }

      // onlyIf — conditional execution
      if (tc.onlyIf) {
        const currentEnv = process.env.TEST_ENV || "";
        if (tc.onlyIf.env && tc.onlyIf.env !== currentEnv) {
          test.skip(`${tc.method} ${tc.endpoint} - ${tc.name}`, async () => {});
          continue;
        }
        if (tc.onlyIf.var) {
          // Evaluated at describe time — only checks vars already set
          const varVal = vars[tc.onlyIf.var];
          if (tc.onlyIf.equals !== undefined && varVal !== tc.onlyIf.equals) {
            test.skip(`${tc.method} ${tc.endpoint} - ${tc.name}`, async () => {});
            continue;
          }
          if (tc.onlyIf.equals === undefined && !varVal) {
            test.skip(`${tc.method} ${tc.endpoint} - ${tc.name}`, async () => {});
            continue;
          }
        }
      }

      // Data-driven: expand dataSet into multiple tests, or run once with no data vars
      const dataEntries = tc.dataSet && tc.dataSet.length > 0
        ? tc.dataSet.map((data, i) => ({ suffix: ` [data #${i + 1}]`, dataVars: data }))
        : [{ suffix: "", dataVars: {} as Record<string, unknown> }];

      for (const { suffix, dataVars } of dataEntries) {
        test(`${tc.method} ${tc.endpoint} - ${tc.name}${suffix}`, async ({}, testInfo) => {
          // Per-test timeout
          if (tc.timeout) {
            test.setTimeout(tc.timeout);
          }

          // Merge extracted vars + dataSet vars (dataSet takes precedence)
          const mergedVars = { ...vars, ...dataVars };

          const maxAttempts = tc.retry?.count ? tc.retry.count + 1 : 1;
          const retryDelay = tc.retry?.delay ?? 1000;
          let lastError: Error | null = null;
          let lastValidationResults: ValidationResult[] = [];
          let lastResult: { status: number; data: unknown } = { status: 0, data: null };
          let lastResolved: TestCaseConfig = tc;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (attempt > 1) {
              await new Promise((r) => setTimeout(r, retryDelay));
            }

            lastError = null;

            // Resolve variables in the test case
            lastResolved = resolveTestCase(tc, mergedVars);

            // beforeRequest hook — can modify request fields
            if (tc.beforeRequest) {
              try {
                const hookCtx = evaluateHook(tc.beforeRequest, {
                  request: {
                    method: lastResolved.method,
                    endpoint: lastResolved.endpoint,
                    headers: lastResolved.headers,
                    body: lastResolved.body,
                  },
                  vars: mergedVars,
                  env: process.env as Record<string, string | undefined>,
                });
                // Apply any modifications from the hook
                lastResolved = {
                  ...lastResolved,
                  endpoint: hookCtx.request.endpoint ?? lastResolved.endpoint,
                  headers: hookCtx.request.headers ?? lastResolved.headers,
                  body: hookCtx.request.body ?? lastResolved.body,
                };
              } catch (e) {
                // Hook errors are non-fatal warnings
              }
            }

            lastResult = await executeRequest(api, lastResolved);

            // afterResponse hook — can modify vars, do custom logging
            if (tc.afterResponse) {
              try {
                const hookCtx = evaluateHook(tc.afterResponse, {
                  request: {
                    method: lastResolved.method,
                    endpoint: lastResolved.endpoint,
                    headers: lastResolved.headers,
                    body: lastResolved.body,
                  },
                  response: { status: lastResult.status, data: lastResult.data },
                  vars: mergedVars,
                  env: process.env as Record<string, string | undefined>,
                });
                // Sync any vars the hook may have set
                Object.assign(mergedVars, hookCtx.vars);
              } catch (e) {
                // Hook errors are non-fatal warnings
              }
            }

            // Collect all validation results
            lastValidationResults = [];

            // Status code check
            const statusPassed = lastResult.status === tc.expectedStatus;
            lastValidationResults.push({
              validation: { type: "equals", path: "HTTP Status", value: tc.expectedStatus },
              status: statusPassed ? "passed" : "failed",
              message: `HTTP Status equals ${tc.expectedStatus}`,
              actual: lastResult.status,
              expected: tc.expectedStatus,
            });

            // Run all configured validations (resolve validation values with merged vars)
            if (tc.validations) {
              for (const validation of tc.validations) {
                if ((validation as any).disabled) continue;
                const resolvedValidation = resolveValue(validation, mergedVars) as typeof validation;
                const vResult = tryValidation(lastResult.data, resolvedValidation);
                lastValidationResults.push(vResult);
              }
            }

            const failures = lastValidationResults.filter((v) => v.status === "failed");
            if (failures.length > 0) {
              const failMessages = failures.map((f) => {
                let msg = `FAILED: ${f.message}`;
                if (f.actual !== undefined) msg += `\n  Actual:   ${JSON.stringify(f.actual)}`;
                if (f.expected !== undefined) msg += `\n  Expected: ${JSON.stringify(f.expected)}`;
                return msg;
              });
              lastError = new Error(
                `${failures.length} of ${lastValidationResults.length} validation(s) failed:\n\n${failMessages.join("\n\n")}`
              );

              if (attempt < maxAttempts) continue; // retry
            } else {
              break; // all passed
            }
          }

          // Poll mode — keep re-executing until condition passes or timeout
          if (tc.poll && lastError) {
            const pollStart = Date.now();
            const pollTimeout = tc.poll.timeout;
            const pollInterval = tc.poll.interval;
            const pollCondition = resolveValue(tc.poll.condition, mergedVars) as Validation;

            while (Date.now() - pollStart < pollTimeout) {
              await new Promise((r) => setTimeout(r, pollInterval));

              lastResolved = resolveTestCase(tc, mergedVars);
              lastResult = await executeRequest(api, lastResolved);

              // Check poll condition
              try {
                runValidation(lastResult.data, pollCondition);
                // Condition passed — re-run full validations
                lastValidationResults = [];
                const statusPassed = lastResult.status === tc.expectedStatus;
                lastValidationResults.push({
                  validation: { type: "equals", path: "HTTP Status", value: tc.expectedStatus },
                  status: statusPassed ? "passed" : "failed",
                  message: `HTTP Status equals ${tc.expectedStatus}`,
                  actual: lastResult.status,
                  expected: tc.expectedStatus,
                });
                if (tc.validations) {
                  for (const validation of tc.validations) {
                    if ((validation as any).disabled) continue;
                    const resolvedValidation = resolveValue(validation, mergedVars) as typeof validation;
                    lastValidationResults.push(tryValidation(lastResult.data, resolvedValidation));
                  }
                }
                const pollFailures = lastValidationResults.filter((v) => v.status === "failed");
                if (pollFailures.length === 0) {
                  lastError = null;
                  break;
                }
              } catch {
                // Condition not met yet, keep polling
              }
            }
          }

          // Extract variables from response
          if (tc.extract) {
            for (const [varName, path] of Object.entries(tc.extract)) {
              const value = getValueByPath(lastResult.data, path);
              vars[varName] = value;
            }

            // Attach extracted variables for reporting
            await testInfo.attach("extracted-variables", {
              body: JSON.stringify(tc.extract),
              contentType: "application/json",
            });
          }

          // Attach request details for reporting
          await testInfo.attach("request-details", {
            body: JSON.stringify({
              method: lastResolved.method,
              endpoint: lastResolved.endpoint,
              headers: lastResolved.headers,
              queryParams: lastResolved.queryParams,
              body: lastResolved.body,
            }),
            contentType: "application/json",
          });

          // Attach response body for reporting
          await testInfo.attach("response-body", {
            body: JSON.stringify({ status: lastResult.status, data: lastResult.data }),
            contentType: "application/json",
          });

          // Attach validation results as JSON for the reporter
          await testInfo.attach("validation-results", {
            body: JSON.stringify(lastValidationResults),
            contentType: "application/json",
          });

          // Now fail the test if the last attempt still failed
          if (lastError) {
            throw lastError;
          }
        });
      }
    }
  });
}

async function executeRequest(api: ApiHelper, tc: TestCaseConfig) {
  switch (tc.method) {
    case "GET":
      return api.get(tc.endpoint, tc.queryParams);
    case "POST":
      return api.post(tc.endpoint, tc.body || {});
    case "PUT":
      return api.put(tc.endpoint, tc.body || {});
    case "PATCH":
      return api.patch(tc.endpoint, tc.body || {});
    case "DELETE":
      return api.delete(tc.endpoint);
  }
}
