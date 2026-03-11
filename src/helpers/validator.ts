import { expect } from "@playwright/test";
import { Validation } from "../types/test-config.types";

export interface ValidationResult {
  validation: Validation;
  status: "passed" | "failed";
  message: string;
  actual?: unknown;
  expected?: unknown;
}

export function getValueByPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;

  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function describeValidation(v: Validation): string {
  switch (v.type) {
    case "equals": return `${v.path} equals ${JSON.stringify(v.value)}`;
    case "notEquals": return `${v.path} does not equal ${JSON.stringify(v.value)}`;
    case "exists": return `${v.path} exists`;
    case "notExists": return `${v.path} does not exist`;
    case "contains": return `${v.path} contains "${v.value}"`;
    case "regex": return `${v.path} matches pattern "${v.pattern}"`;
    case "isArray": return `${v.path || "response"} is an array`;
    case "arrayLength": {
      const parts: string[] = [];
      if (v.exact !== undefined) parts.push(`exactly ${v.exact}`);
      if (v.min !== undefined) parts.push(`min ${v.min}`);
      if (v.max !== undefined) parts.push(`max ${v.max}`);
      return `${v.path || "response"} array length ${parts.join(", ")}`;
    }
    case "typeOf": return `${v.path} is type "${v.expected}"`;
    case "greaterThan": return `${v.path} > ${v.value}`;
    case "lessThan": return `${v.path} < ${v.value}`;
    case "hasProperty": return `${v.path} has property "${v.property}"`;
    case "schema": return `${v.path || "response"} matches schema`;
    case "arrayEvery": return `every item in ${v.path || "response"} passes ${v.validations.length} check(s)`;
    case "arraySome": return `at least one item in ${v.path || "response"} passes ${v.validations.length} check(s)`;
    case "arrayNone": return `no item in ${v.path || "response"} passes ${v.validations.length} check(s)`;
    case "arrayItemAt": return `item [${v.index}] in ${v.path || "response"} passes ${v.validations.length} check(s)`;
    case "arrayFind": return `item where ${v.where.path} = ${JSON.stringify(v.where.value)} in ${v.path || "response"} passes ${v.validations.length} check(s)`;
    case "startsWith": return `${v.path} starts with "${v.value}"`;
    case "endsWith": return `${v.path} ends with "${v.value}"`;
    case "stringLength": {
      const parts: string[] = [];
      if (v.exact !== undefined) parts.push(`exactly ${v.exact}`);
      if (v.min !== undefined) parts.push(`min ${v.min}`);
      if (v.max !== undefined) parts.push(`max ${v.max}`);
      return `${v.path} string length ${parts.join(", ")}`;
    }
    case "notContains": return `${v.path} does not contain "${v.value}"`;
    case "isEmpty": return `${v.path || "response"} is empty`;
    case "isNotEmpty": return `${v.path || "response"} is not empty`;
    case "greaterThanOrEqual": return `${v.path} >= ${v.value}`;
    case "lessThanOrEqual": return `${v.path} <= ${v.value}`;
    case "between": return `${v.path} is between ${v.min} and ${v.max}`;
    case "arrayContains": return `${v.path || "response"} contains ${JSON.stringify(v.value)}`;
    case "arrayNotContains": return `${v.path || "response"} does not contain ${JSON.stringify(v.value)}`;
    case "arraySorted": return `${v.path || "response"} is sorted ${v.order || "asc"}${v.field ? ` by ${v.field}` : ""}`;
    case "arrayUnique": return `${v.path || "response"} has unique values${v.field ? ` for ${v.field}` : ""}`;
    case "isDate": return `${v.path} is a valid date`;
    case "dateBefore": return `${v.path} is before ${v.value}`;
    case "dateAfter": return `${v.path} is after ${v.value}`;
    case "dateWithinLast": return `${v.path} is within last ${v.amount} ${v.unit}`;
    case "if": return `if ${describeValidation(v.condition)} then run ${v.then.length} check(s)${v.else ? `, else run ${v.else.length} check(s)` : ""}`;
    default: return JSON.stringify(v);
  }
}

export function tryValidation(data: unknown, validation: Validation): ValidationResult {
  try {
    runValidation(data, validation);
    return {
      validation,
      status: "passed",
      message: describeValidation(validation),
    };
  } catch (e) {
    const actual = validation.type !== "arrayEvery" && validation.type !== "schema" && validation.type !== "if"
      ? getValueByPath(data, (validation as { path?: string }).path)
      : undefined;

    return {
      validation,
      status: "failed",
      message: describeValidation(validation),
      actual,
      expected: (validation as { value?: unknown }).value,
    };
  }
}

export function runValidation(data: unknown, validation: Validation): void {
  switch (validation.type) {
    case "equals": {
      const actual = getValueByPath(data, validation.path);
      expect(actual, `Expected "${validation.path}" to equal ${JSON.stringify(validation.value)}`).toEqual(validation.value);
      break;
    }

    case "notEquals": {
      const actual = getValueByPath(data, validation.path);
      expect(actual, `Expected "${validation.path}" to NOT equal ${JSON.stringify(validation.value)}`).not.toEqual(validation.value);
      break;
    }

    case "exists": {
      const actual = getValueByPath(data, validation.path);
      expect(actual, `Expected "${validation.path}" to exist`).toBeDefined();
      break;
    }

    case "notExists": {
      const actual = getValueByPath(data, validation.path);
      expect(actual, `Expected "${validation.path}" to NOT exist`).toBeUndefined();
      break;
    }

    case "contains": {
      const actual = getValueByPath(data, validation.path) as string;
      expect(actual, `Expected "${validation.path}" to contain "${validation.value}"`).toContain(validation.value);
      break;
    }

    case "regex": {
      const actual = getValueByPath(data, validation.path) as string;
      const regex = new RegExp(validation.pattern);
      expect(actual, `Expected "${validation.path}" to match pattern "${validation.pattern}"`).toMatch(regex);
      break;
    }

    case "isArray": {
      const actual = getValueByPath(data, validation.path);
      expect(Array.isArray(actual), `Expected "${validation.path || "response"}" to be an array`).toBe(true);
      break;
    }

    case "arrayLength": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      if (validation.exact !== undefined) {
        expect(actual.length, `Expected array length to be ${validation.exact}`).toBe(validation.exact);
      }
      if (validation.min !== undefined) {
        expect(actual.length, `Expected array length >= ${validation.min}`).toBeGreaterThanOrEqual(validation.min);
      }
      if (validation.max !== undefined) {
        expect(actual.length, `Expected array length <= ${validation.max}`).toBeLessThanOrEqual(validation.max);
      }
      break;
    }

    case "typeOf": {
      const actual = getValueByPath(data, validation.path);
      expect(typeof actual, `Expected "${validation.path}" to be type "${validation.expected}"`).toBe(validation.expected);
      break;
    }

    case "greaterThan": {
      const actual = getValueByPath(data, validation.path) as number;
      expect(actual, `Expected "${validation.path}" > ${validation.value}`).toBeGreaterThan(validation.value);
      break;
    }

    case "lessThan": {
      const actual = getValueByPath(data, validation.path) as number;
      expect(actual, `Expected "${validation.path}" < ${validation.value}`).toBeLessThan(validation.value);
      break;
    }

    case "hasProperty": {
      const actual = getValueByPath(data, validation.path) as Record<string, unknown>;
      expect(actual, `Expected "${validation.path}" to have property "${validation.property}"`).toHaveProperty(validation.property);
      break;
    }

    case "arrayEvery": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      actual.forEach((item, index) => {
        for (const v of validation.validations) {
          try {
            runValidation(item, v);
          } catch (e) {
            throw new Error(`Array item [${index}] failed: ${(e as Error).message}`);
          }
        }
      });
      break;
    }

    case "arraySome": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const found = actual.some((item) => {
        try {
          for (const v of validation.validations) runValidation(item, v);
          return true;
        } catch {
          return false;
        }
      });
      if (!found) {
        throw new Error(`Expected at least one item in "${validation.path || "response"}" to pass all validations, but none did`);
      }
      break;
    }

    case "arrayNone": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const matching: number[] = [];
      actual.forEach((item, index) => {
        try {
          for (const v of validation.validations) runValidation(item, v);
          matching.push(index);
        } catch {}
      });
      if (matching.length > 0) {
        throw new Error(`Expected no items in "${validation.path || "response"}" to pass, but item(s) [${matching.join(", ")}] matched`);
      }
      break;
    }

    case "arrayItemAt": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const idx = validation.index;
      if (!actual || idx >= actual.length) {
        throw new Error(`Array "${validation.path || "response"}" has no item at index [${idx}] (length: ${actual?.length ?? 0})`);
      }
      const item = actual[idx];
      for (const v of validation.validations) {
        try {
          runValidation(item, v);
        } catch (e) {
          throw new Error(`Array item [${idx}] failed: ${(e as Error).message}`);
        }
      }
      break;
    }

    case "arrayFind": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const found = actual.find((item) => {
        const val = getValueByPath(item, validation.where.path);
        return val === validation.where.value;
      });
      if (!found) {
        throw new Error(`No item found in "${validation.path || "response"}" where ${validation.where.path} = ${JSON.stringify(validation.where.value)}`);
      }
      for (const v of validation.validations) {
        try {
          runValidation(found, v);
        } catch (e) {
          throw new Error(`Item where ${validation.where.path} = ${JSON.stringify(validation.where.value)} failed: ${(e as Error).message}`);
        }
      }
      break;
    }

    case "schema": {
      const actual = getValueByPath(data, validation.path) as Record<string, unknown>;
      for (const [key, expectedType] of Object.entries(validation.properties)) {
        const value = actual[key];
        expect(value, `Expected property "${key}" to exist`).toBeDefined();
        if (expectedType === "array") {
          expect(Array.isArray(value), `Expected "${key}" to be an array`).toBe(true);
        } else {
          expect(typeof value, `Expected "${key}" to be type "${expectedType}"`).toBe(expectedType);
        }
      }
      break;
    }

    case "startsWith": {
      const actual = getValueByPath(data, validation.path) as string;
      expect(String(actual).startsWith(validation.value), `Expected "${validation.path}" to start with "${validation.value}"`).toBe(true);
      break;
    }

    case "endsWith": {
      const actual = getValueByPath(data, validation.path) as string;
      expect(String(actual).endsWith(validation.value), `Expected "${validation.path}" to end with "${validation.value}"`).toBe(true);
      break;
    }

    case "stringLength": {
      const actual = String(getValueByPath(data, validation.path));
      if (validation.exact !== undefined) {
        expect(actual.length, `Expected string length to be ${validation.exact}`).toBe(validation.exact);
      }
      if (validation.min !== undefined) {
        expect(actual.length, `Expected string length >= ${validation.min}`).toBeGreaterThanOrEqual(validation.min);
      }
      if (validation.max !== undefined) {
        expect(actual.length, `Expected string length <= ${validation.max}`).toBeLessThanOrEqual(validation.max);
      }
      break;
    }

    case "notContains": {
      const actual = getValueByPath(data, validation.path) as string;
      expect(String(actual).includes(validation.value), `Expected "${validation.path}" to NOT contain "${validation.value}"`).toBe(false);
      break;
    }

    case "isEmpty": {
      const actual = getValueByPath(data, validation.path);
      const empty = actual === "" || actual === null || actual === undefined || (Array.isArray(actual) && actual.length === 0);
      expect(empty, `Expected "${validation.path || "response"}" to be empty`).toBe(true);
      break;
    }

    case "isNotEmpty": {
      const actual = getValueByPath(data, validation.path);
      const empty = actual === "" || actual === null || actual === undefined || (Array.isArray(actual) && actual.length === 0);
      expect(empty, `Expected "${validation.path || "response"}" to NOT be empty`).toBe(false);
      break;
    }

    case "greaterThanOrEqual": {
      const actual = getValueByPath(data, validation.path) as number;
      expect(actual, `Expected "${validation.path}" >= ${validation.value}`).toBeGreaterThanOrEqual(validation.value);
      break;
    }

    case "lessThanOrEqual": {
      const actual = getValueByPath(data, validation.path) as number;
      expect(actual, `Expected "${validation.path}" <= ${validation.value}`).toBeLessThanOrEqual(validation.value);
      break;
    }

    case "between": {
      const actual = getValueByPath(data, validation.path) as number;
      expect(actual, `Expected "${validation.path}" >= ${validation.min}`).toBeGreaterThanOrEqual(validation.min);
      expect(actual, `Expected "${validation.path}" <= ${validation.max}`).toBeLessThanOrEqual(validation.max);
      break;
    }

    case "arrayContains": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const found = actual.some((item) =>
        JSON.stringify(item) === JSON.stringify(validation.value)
      );
      if (!found) {
        throw new Error(`Expected "${validation.path || "response"}" to contain ${JSON.stringify(validation.value)}`);
      }
      break;
    }

    case "arrayNotContains": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const found = actual.some((item) =>
        JSON.stringify(item) === JSON.stringify(validation.value)
      );
      if (found) {
        throw new Error(`Expected "${validation.path || "response"}" to NOT contain ${JSON.stringify(validation.value)}`);
      }
      break;
    }

    case "arraySorted": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const order = validation.order || "asc";
      for (let i = 1; i < actual.length; i++) {
        const prev = (validation.field ? (actual[i - 1] as Record<string, unknown>)[validation.field] : actual[i - 1]) as string | number;
        const curr = (validation.field ? (actual[i] as Record<string, unknown>)[validation.field] : actual[i]) as string | number;
        if (order === "asc" && prev > curr) {
          throw new Error(`Array "${validation.path || "response"}" is not sorted ascending at index ${i}`);
        }
        if (order === "desc" && prev < curr) {
          throw new Error(`Array "${validation.path || "response"}" is not sorted descending at index ${i}`);
        }
      }
      break;
    }

    case "arrayUnique": {
      const actual = getValueByPath(data, validation.path) as unknown[];
      const values = validation.field
        ? actual.map((item) => (item as Record<string, unknown>)[validation.field!])
        : actual;
      const seen = new Set(values.map((v) => JSON.stringify(v)));
      if (seen.size !== values.length) {
        throw new Error(`Array "${validation.path || "response"}" does not have unique values${validation.field ? ` for field "${validation.field}"` : ""}`);
      }
      break;
    }

    case "isDate": {
      const actual = getValueByPath(data, validation.path) as string;
      const date = new Date(actual);
      if (isNaN(date.getTime())) {
        throw new Error(`Expected "${validation.path}" to be a valid date, got "${actual}"`);
      }
      break;
    }

    case "dateBefore": {
      const actual = getValueByPath(data, validation.path) as string;
      const date = new Date(actual);
      const target = new Date(validation.value);
      if (isNaN(date.getTime())) {
        throw new Error(`Expected "${validation.path}" to be a valid date, got "${actual}"`);
      }
      if (date >= target) {
        throw new Error(`Expected "${validation.path}" (${actual}) to be before ${validation.value}`);
      }
      break;
    }

    case "dateAfter": {
      const actual = getValueByPath(data, validation.path) as string;
      const date = new Date(actual);
      const target = new Date(validation.value);
      if (isNaN(date.getTime())) {
        throw new Error(`Expected "${validation.path}" to be a valid date, got "${actual}"`);
      }
      if (date <= target) {
        throw new Error(`Expected "${validation.path}" (${actual}) to be after ${validation.value}`);
      }
      break;
    }

    case "dateWithinLast": {
      const actual = getValueByPath(data, validation.path) as string;
      const date = new Date(actual);
      if (isNaN(date.getTime())) {
        throw new Error(`Expected "${validation.path}" to be a valid date, got "${actual}"`);
      }
      const multipliers: Record<string, number> = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
      const ms = validation.amount * multipliers[validation.unit];
      const cutoff = new Date(Date.now() - ms);
      if (date < cutoff) {
        throw new Error(`Expected "${validation.path}" (${actual}) to be within last ${validation.amount} ${validation.unit}`);
      }
      break;
    }

    case "if": {
      let conditionMet = false;
      try {
        runValidation(data, validation.condition);
        conditionMet = true;
      } catch {
        conditionMet = false;
      }

      const branch = conditionMet ? validation.then : (validation.else || []);
      for (const v of branch) {
        try {
          runValidation(data, v);
        } catch (e) {
          throw new Error(`Conditional (${conditionMet ? "then" : "else"}) failed: ${(e as Error).message}`);
        }
      }
      break;
    }
  }
}
