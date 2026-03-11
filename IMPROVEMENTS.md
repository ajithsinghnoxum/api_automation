# API Automation Framework — Planned Improvements

## Status Legend
- [ ] Not started
- [x] Completed

---

## 1. UI Theming & Design

### 1.1 Dark / Light Theme Toggle
- [x] Add a theme toggle button (sun/moon icon) in the web UI header
- [x] Define CSS variables for both light and dark palettes
- [x] Store user preference in `localStorage` so it persists across sessions
- [x] Apply theme via `data-theme` attribute on `<html>` element
- [x] Smooth transition animation on theme switch
- [x] Replace all hardcoded colors with CSS variables

### 1.2 Custom Color Themes
- [ ] Allow users to pick an accent color (blue, green, purple, orange, etc.)
- [ ] Store selected theme in `localStorage`
- [ ] Predefined theme presets (e.g., "Ocean", "Forest", "Sunset")

### 1.3 Report Theming
- [x] Match HTML report theme to the web UI theme preference
- [x] Add a theme toggle to the report itself
- [ ] Configurable company/project logo in reports

### 1.4 UI Polish
- [x] Add loading skeletons for project/suite list (full-page shimmer overlay)
- [x] Add transition animations for modals, dropdowns, and expanding sections
- [ ] Responsive design improvements for tablet/mobile
- [x] Breadcrumb navigation (Home > Project > Suite > Test)
- [x] Keyboard shortcuts (Ctrl+S to save, Ctrl+Enter to run tests, Ctrl+Shift+N new suite, Ctrl+Shift+F search)

---

## 2. Web UI Enhancements

### 2.1 Schema Validation Builder
- [x] Visual builder for `schema` validation type
- [x] Add/remove property rows with name input + type dropdown (string, number, boolean, object, array)
- [x] Generate the `properties` object from the form fields
- [x] Load existing schema properties when editing a test

### 2.2 JSON Editor Mode
- [x] Toggle between visual form editor and raw JSON editor for test cases
- [x] Syntax highlighting for JSON (CodeMirror with dark/light theme support)
- [x] JSON validation with error highlighting
- [x] Ability to paste JSON directly and convert to visual form

### 2.3 Import / Export
- [x] Export entire project config as a downloadable JSON bundle (project config + all suites)
- [x] Import project from JSON bundle upload
- [x] Export a single test suite as JSON
- [x] Import test suite from JSON file upload
- [x] Import from Postman collection (v2.1 format)
- [x] Import from OpenAPI/Swagger spec (auto-generate test stubs)

### 2.4 Drag & Drop Reordering
- [x] Drag to reorder tests within a suite
- [x] Drag to reorder validations within a test
- [ ] Drag to move tests between suites

### 2.5 Duplicate / Clone
- [x] Duplicate a test case within a suite (clipboard icon button)
- [x] Clone a suite (with all its tests)
- [x] Clone a project (config + all test files)

### 2.6 Test Status Indicators
- [x] Show last run status (pass/fail/not run) next to each test in the UI
- [x] Show response time from last run next to each test
- [x] Color-code suites based on their last run result

### 2.7 Test Search & Filtering
- [x] Search tests by name, endpoint, or method across all suites
- [x] Combined search + tag filtering with auto-hide empty suites
- [x] Select failed tests for quick re-run

### 2.8 Collapsible Test Suites
- [x] Collapse/expand individual suite cards
- [x] Collapse all / expand all toggle

### 2.9 Copy Test as cURL
- [x] Generate cURL command from any test case (includes auth headers, body, query params)
- [x] One-click copy to clipboard

### 2.10 Auto-Generate Validations (Try & Auto-Generate)
- [x] "Try & Auto-Generate" button in the test editor modal
- [x] Sends the actual API request from the server using project auth config
- [x] Analyzes the response and auto-generates validations (schema, exists, typeOf, isArray, arrayLength)
- [x] "Include value checks" checkbox to additionally generate deep `equals` validations for all response values
- [x] Recursively generates value checks for nested objects and array items
- [x] Option to replace or append to existing validations
- [x] Updates expected status code from actual response
- [x] Server endpoint: `POST /api/projects/:id/try-request`

---

## 3. Testing Features

### 3.1 Variable Extraction & Chaining
- [x] Extract values from API responses and store as variables
- [x] Use extracted variables in subsequent test requests (headers, body, endpoint, query params)
- [x] Syntax: `{{variableName}}` in endpoint, body, headers
- [x] Define extraction rules: `{ "extract": { "userId": "data.id", "token": "meta.token" } }`
- [x] Auto-enable serial mode when any test uses `extract` (chaining requires order)
- [x] Single-variable placeholders preserve original type (number stays number)
- [x] Deep resolution in nested body objects and arrays
- [x] Web UI: Extract Variables builder with variable name + response path rows
- [x] Attached extracted variables to test report for visibility

### 3.2 Environment Variables in Configs
- [x] Support `{{ENV_VARIABLE}}` syntax in test JSON files
- [x] Resolve from `.env` file or `process.env`
- [x] Useful for dynamic values like timestamps, random IDs, etc.
- [x] Built-in variables: `{{$timestamp}}`, `{{$randomInt}}`, `{{$guid}}`

### 3.3 Data-Driven / Parameterized Tests
- [x] Define a `dataSet` array in a test case
- [x] Each entry in the dataset creates a separate test run with substituted values
- [ ] Example:
  ```json
  {
    "name": "get user by id",
    "method": "GET",
    "endpoint": "users/{{id}}",
    "expectedStatus": 200,
    "dataSet": [
      { "id": 1, "expectedName": "Alice" },
      { "id": 2, "expectedName": "Bob" }
    ],
    "validations": [
      { "type": "equals", "path": "name", "value": "{{expectedName}}" }
    ]
  }
  ```

### 3.4 Pre/Post Request Hooks
- [x] `beforeRequest` — modify headers, generate auth tokens, set timestamps
- [x] `afterResponse` — extract cookies, log response, custom assertions
- [x] JavaScript code blocks evaluated at runtime with request/response/vars context

### 3.5 Retry & Polling
- [x] Configurable retry count and delay per test case
- [x] Poll mode: repeat a test until a condition is met (e.g., async job completes)
- [x] `{ "retry": { "count": 3, "delay": 2000 } }`

### 3.6 Request Timeout per Test
- [x] Override the global 30s timeout for individual test cases
- [x] `"timeout": 60000` in the test case config

### 3.7 Conditional Test Execution
- [x] Skip tests based on environment or conditions
- [x] `"skip": true` or `"skip": "reason for skipping"`
- [x] `"onlyIf": { "env": "production" }` — run only in specific environments

---

## 4. New Validation Types

### 4.1 String Validations
- [x] `startsWith` — check if string starts with a prefix
- [x] `endsWith` — check if string ends with a suffix
- [x] `stringLength` — check string length (min, max, exact)
- [x] `notContains` — string must NOT contain a substring
- [x] `isEmpty` / `isNotEmpty` — check for empty string, null, or empty array

### 4.2 Numeric Validations
- [x] `greaterThanOrEqual` — >= comparison
- [x] `lessThanOrEqual` — <= comparison
- [x] `between` — value is within a range (min, max inclusive)

### 4.3 Date Validations
- [x] `isDate` — check if value is a valid date string
- [x] `dateBefore` / `dateAfter` — compare dates
- [x] `dateWithinLast` — date is within last N hours/days

### 4.4 Array Validations
- [x] `arrayContains` — array contains a specific primitive value
- [x] `arrayNotContains` — array does not contain a specific value
- [x] `arraySorted` — array is sorted (asc/desc by field)
- [x] `arrayUnique` — all items have unique values for a given field

### 4.5 Conditional Validations
- [x] `if` — run validations only if a condition is met
  ```json
  {
    "type": "if",
    "condition": { "type": "equals", "path": "type", "value": "premium" },
    "then": [
      { "type": "exists", "path": "premiumFeatures" }
    ],
    "else": [
      { "type": "notExists", "path": "premiumFeatures" }
    ]
  }
  ```

---

## 5. Reporting Enhancements

### 5.1 Response Body in Report
- [x] Attach full response body to each test in the report
- [x] Collapsible JSON viewer with syntax highlighting
- [x] Show request details (URL, method, headers, body) alongside the response

### 5.2 Test History & Trends
- [x] Store test run results over time (SQLite)
- [x] Show pass/fail trend charts in the web UI
- [x] Compare current run with previous run (new failures, fixed tests)
- [x] Response time tracking per test (displayed as badges + in comparison view)

### 5.3 Report Export
- [x] Export report as PDF (print-friendly HTML with browser Print/Save as PDF)
- [x] Export results as JUnit XML (for CI/CD integration)
- [x] Export as CSV for spreadsheet analysis

### 5.4 Notification Integration
- [x] Send test results summary to Slack/Teams webhook
- [x] Email notifications on test failure (SMTP)
- [x] Configurable notification rules (enable/disable, only on failure)
- [x] Per-project notification settings in the project modal (Slack, Teams, Email channels)
- [x] Test notification button to verify webhook/email configuration
- [x] Notifications triggered on both manual runs and scheduled runs

---

## 6. Advanced Architecture

### 6.1 GraphQL Support
- [ ] New method type: `GRAPHQL`
- [ ] Query and variables fields in test config
- [ ] Validation of GraphQL-specific response structure (data, errors)

### 6.2 WebSocket Testing
- [ ] Connect to WebSocket endpoints
- [ ] Send messages and validate received messages
- [ ] Timeout-based message waiting

### 6.3 Multi-Environment Support
- [x] Define environments (dev, staging, production) per project
- [x] Each environment overrides base URL and credentials
- [x] Switch environments from the web UI or via CLI flag
- [x] `TEST_ENV=staging npx playwright test`

### 6.4 Test Tagging & Filtering
- [x] Add `tags` array to test cases: `"tags": ["smoke", "regression", "critical"]`
- [x] Run only tests with specific tags: `TEST_TAGS=smoke npx playwright test`
- [x] Filter by tags in the web UI

### 6.5 Shared Test Data / Fixtures
- [x] Define reusable data blocks in a `fixtures.json` file
- [x] Reference fixtures in test configs: `"body": { "$ref": "fixtures.newUser" }`
- [x] Common headers, auth tokens, or request bodies shared across tests
- [x] Suite-level `fixtures` field + shared `fixtures.json` per project folder

### 6.6 API Response Caching
- [ ] Cache responses for repeated requests during a test run
- [ ] Useful for tests that reference the same endpoint multiple times
- [ ] Configurable per test: `"cache": true`

### 6.7 Scheduled Test Runs (Cron)
- [x] Schedule test runs at regular intervals (e.g., every 5 min, hourly, daily, weekdays)
- [x] Cron-like configuration per project in the web UI with preset and custom cron support
- [x] In-process scheduler engine that checks every 30 seconds
- [x] Store scheduled run results in run history alongside manual runs
- [x] Visual indicator for scheduled vs manual runs in the history (tagged `[scheduled:name]`)
- [x] Pause/resume individual schedules
- [ ] Auto-run on startup option for critical smoke tests

### 6.8 Response Comparison / Diff Mode
- [x] Compare API responses between two runs (side-by-side diff)
- [x] Snapshot capture: run all tests and store response bodies in DB
- [x] Highlight added, removed, and changed fields in the response (LCS-based line diff)
- [x] Filter comparison by: all, changed, added, removed, unchanged
- [x] Per-test expandable diff detail with color-coded lines
- [ ] Compare responses between environments (staging vs production)
- [ ] "Baseline" mode: save a known-good response and alert when it drifts

### 6.9 Schema Drift Detection
- [x] Automatically detect when an API response structure changes from the last known schema
- [x] Save schema baseline: capture response structure for all tests in a project
- [x] Generate a drift report showing new fields, removed fields, and type changes
- [x] Visual drift report with color-coded progress bar (stable vs drifted)
- [x] Per-test expandable drift details with field-level changes
- [ ] Run in "monitor" mode: periodically hit endpoints and compare against saved schema
- [ ] Option to auto-update validations when drift is detected and approved

### 6.10 Bulk Test Operations
- [x] Bulk add/remove tags across multiple tests at once
- [x] Bulk enable/disable (skip) tests with a multi-select checkbox
- [x] Bulk update expected status, timeout, or method across selected tests
- [x] "Find and replace" across all test endpoints in a project
- [x] Bulk re-generate validations for multiple tests using auto-generate
- [x] Bulk delete selected tests
- [x] "Bulk Edit" toggle mode with multi-select checkboxes and floating toolbar

### 6.11 Test Templates / Blueprints
- [x] Create reusable test templates (e.g., "Standard CRUD Suite", "Auth Flow", "Pagination Check")
- [x] One-click generate a full CRUD suite (GET all, GET by id, POST, PUT, DELETE) from a base endpoint
- [x] Template library with pre-built patterns for common API patterns (CRUD, Auth Flow, Pagination, Health, Search & Filter, Error Handling)
- [x] Parameterized templates: fill in base endpoint + resource name → full suite generated
- [x] Preview generated tests before creating the suite
- [ ] Custom user-defined templates saved per project

### 6.12 Chain Builder / Flow Editor
- [x] Visual flow editor for multi-step API workflows
- [x] Auto-detect dependency chain from `extract` / `{{variable}}` usage
- [x] Draw connector arrows between tests showing variable flow
- [x] Variable badges showing extracted (green) and consumed (blue) variables
- [x] Warnings for undefined variables (used but never extracted)
- [x] Step-through execution: execute one test at a time with live request/response display
- [x] Visual status feedback (active/passed/failed) on each node during step-through
- [x] Summary panel with test count, variable count, and connection count
- [ ] Drag-and-drop reordering within chain view
- [ ] Export flow as a standard test suite JSON

---

## 7. Developer Experience

### 7.1 CLI Improvements
- [ ] Interactive project creation wizard: `npm run create-project`
- [ ] Generate test stubs from OpenAPI spec: `npm run generate -- --spec openapi.yaml`
- [ ] Validate all test JSON files: `npm run validate-configs`

### 7.2 VS Code Extension
- [ ] JSON schema for test config files (auto-complete in VS Code)
- [ ] Inline validation type suggestions
- [ ] Run individual tests from VS Code
- [ ] View report inline in VS Code

### 7.3 Documentation
- [ ] Add interactive examples in docs (try validation types live)
- [ ] Video tutorials for common workflows
- [ ] Searchable documentation

---

## What's Next — Remaining Items

### High Impact — Work Reducers (Recommended Next)
1. ~~**Test Templates / CRUD Generator** (6.11)~~ — **DONE** (6 built-in templates: CRUD, Auth Flow, Pagination, Health, Search & Filter, Error Handling)
2. ~~**Bulk Test Operations** (6.10)~~ — **DONE** (bulk tag, skip, status, timeout, method, find/replace, auto-generate, delete)
3. ~~**Scheduled Test Runs** (6.7)~~ — **DONE** (cron scheduler with presets, pause/resume, in-process engine)
4. ~~**Response Comparison / Diff** (6.8)~~ — **DONE** (snapshot capture, side-by-side diff, LCS line diff, filter by change type)
5. ~~**Schema Drift Detection** (6.9)~~ — **DONE** (baseline capture, drift report with field-level changes)
6. ~~**Notification Integration** (5.4)~~ — **DONE** (Slack/Teams webhooks, SMTP email, per-project config, failure-only mode)

### UI & Polish
8. **Custom Color Themes** (1.2) — accent color picker, preset themes (Ocean, Forest, Sunset)
9. **Responsive Design** (1.4) — tablet/mobile layout improvements
10. **Drag Tests Between Suites** (2.4) — cross-suite drag & drop
11. **Configurable Logo in Reports** (1.3) — company/project branding

### Nice to Have
12. **GraphQL Support** (6.1) — query/variables fields, GraphQL-specific validation
13. **WebSocket Testing** (6.2) — connect, send, and validate messages
14. **API Response Caching** (6.6) — cache repeated requests within a run
15. **CLI Wizard** (7.1) — interactive project creation, config validation
16. **VS Code Extension** (7.2) — JSON schema, inline suggestions, run from editor
17. **Interactive Docs** (7.3) — searchable docs, live validation examples
