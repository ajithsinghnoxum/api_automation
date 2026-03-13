export interface TestSuiteConfig {
  suite: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  fixtures?: Record<string, unknown>;
  tests: TestCaseConfig[];
}

export interface TestCaseConfig {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  description?: string;

  // Request config
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number>;
  body?: Record<string, unknown>;

  // Expected response
  expectedStatus: number;
  validations?: Validation[];

  // Variable extraction — save values from the response for use in later tests
  extract?: Record<string, string>;

  // Data-driven testing — each entry generates a separate test with substituted values
  dataSet?: Record<string, unknown>[];

  // Retry configuration
  retry?: {
    count: number;
    delay?: number;
  };

  // Hooks — JavaScript expressions evaluated at runtime
  beforeRequest?: string;
  afterResponse?: string;

  // Poll mode — repeat until condition passes
  poll?: {
    interval: number;
    timeout: number;
    condition: Validation;
  };

  // Conditional execution — run only when condition matches
  onlyIf?: {
    env?: string;
    var?: string;
    equals?: unknown;
  };

  // Test control
  skip?: boolean | string;
  timeout?: number;
  tags?: string[];
}

export type Validation =
  | { type: "equals"; path: string; value: unknown; trim?: boolean }
  | { type: "notEquals"; path: string; value: unknown; trim?: boolean }
  | { type: "exists"; path: string }
  | { type: "notExists"; path: string }
  | { type: "contains"; path: string; value: string; trim?: boolean }
  | { type: "regex"; path: string; pattern: string }
  | { type: "isArray"; path?: string }
  | { type: "arrayLength"; path?: string; min?: number; max?: number; exact?: number }
  | { type: "typeOf"; path: string; expected: "string" | "number" | "boolean" | "object" }
  | { type: "greaterThan"; path: string; value: number }
  | { type: "lessThan"; path: string; value: number }
  | { type: "hasProperty"; path: string; property: string }
  | { type: "arrayEvery"; path?: string; validations: Validation[] }
  | { type: "arraySome"; path?: string; validations: Validation[] }
  | { type: "arrayNone"; path?: string; validations: Validation[] }
  | { type: "arrayItemAt"; path?: string; index: number; validations: Validation[] }
  | { type: "arrayFind"; path?: string; where: { path: string; value: unknown }; validations: Validation[] }
  | { type: "schema"; path?: string; properties: Record<string, "string" | "number" | "boolean" | "object" | "array"> }
  // String validations
  | { type: "startsWith"; path: string; value: string; trim?: boolean }
  | { type: "endsWith"; path: string; value: string; trim?: boolean }
  | { type: "stringLength"; path: string; min?: number; max?: number; exact?: number }
  | { type: "notContains"; path: string; value: string; trim?: boolean }
  | { type: "isEmpty"; path?: string }
  | { type: "isNotEmpty"; path?: string }
  // Numeric validations
  | { type: "greaterThanOrEqual"; path: string; value: number }
  | { type: "lessThanOrEqual"; path: string; value: number }
  | { type: "between"; path: string; min: number; max: number }
  // Array value validations
  | { type: "arrayContains"; path?: string; value: unknown }
  | { type: "arrayNotContains"; path?: string; value: unknown }
  | { type: "arraySorted"; path?: string; field?: string; order?: "asc" | "desc" }
  | { type: "arrayUnique"; path?: string; field?: string }
  // Date validations
  | { type: "isDate"; path: string }
  | { type: "dateBefore"; path: string; value: string }
  | { type: "dateAfter"; path: string; value: string }
  | { type: "dateWithinLast"; path: string; amount: number; unit: "seconds" | "minutes" | "hours" | "days" }
  // Conditional validations
  | { type: "if"; condition: Validation; then: Validation[]; else?: Validation[] };
