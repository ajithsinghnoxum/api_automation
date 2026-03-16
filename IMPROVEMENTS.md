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
- Example:
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

### 6.13 Webhook Triggers / CI Integration
- [ ] `POST /api/webhook/run/:projectId` endpoint for external triggers (CI/CD pipelines)
- [ ] API key authentication for webhook endpoints
- [ ] Return run results as JSON response (synchronous) or run ID (async polling)
- [ ] GitHub Actions / GitLab CI / Jenkins integration examples

### 6.14 Test Dependencies / Conditional Flow
- [ ] `"dependsOn": "test-name"` — run test only if dependency passed
- [ ] Skip dependent tests automatically when parent fails
- [ ] Visual dependency indicators in the UI

### 6.15 OAuth 2.0 / Token Refresh
- [ ] Auth type `oauth2` with client credentials flow
- [ ] Auto-refresh expired tokens before test execution
- [ ] Token caching within a test run to avoid redundant auth calls

---

## 7. New Validation Types (Phase 2)

### 7.1 Response Performance Assertions
- [ ] `responseTime` — assert response time is under a threshold: `{ "type": "responseTime", "max": 2000 }`
- [ ] SLA validation: warn vs fail modes for performance thresholds

### 7.2 Header Validations
- [ ] `headerEquals` — check response header value: `{ "type": "headerEquals", "header": "content-type", "value": "application/json" }`
- [ ] `headerExists` — check response header presence
- [ ] `headerContains` — partial match on header value

### 7.3 Advanced Validations
- [ ] Custom JavaScript assertion functions (user-defined validators)
- [ ] Checksum / hash validation (MD5, SHA256 of response body)
- [ ] JWT decode and claim validation
- [ ] Response size assertion (max bytes)

---

## 8. Usability & UX

### 8.1 Quick Single-Test Run ✅
- [x] "Play" button on each test card to run it instantly
- [x] Inline result display (pass/fail + response) without opening runner modal
- [x] Quick re-run for failed tests from the test card
- [x] Server-side validation engine (standalone, no Playwright dependency)
- [x] Environment-aware — respects selected environment overrides
- [x] Shows HTTP status, response time, validation results, and response body

### 8.2 Run History Improvements
- [ ] Filter run results by status (show only failures)
- [ ] Search within run output
- [ ] Paginated run history (currently loads all 50 at once)
- [ ] Run retention policy (auto-purge runs older than N days)

### 8.3 Test Flakiness Detection
- [ ] Track pass/fail ratio per test across recent runs
- [ ] Flag tests as "flaky" when they intermittently pass/fail
- [ ] Flakiness badge on test cards in the UI
- [ ] Flakiness report in run history

### 8.4 Performance Regression Detection
- [ ] Track response time trends per test across runs
- [ ] Alert when a test consistently gets slower (e.g., >20% increase over last 5 runs)
- [ ] Performance trend sparkline on test cards

### 8.5 Request Preview in Editor ✅
- [x] Live preview of resolved request (full URL, headers, body with variables substituted)
- [x] Show what the cURL command would look like as you edit
- [x] Collapsible panel in test editor with debounced live updates
- [x] Color-coded HTTP method badges, masked auth tokens
- [x] Shows project auth headers merged with per-test headers

### 8.8 Visual Key-Value Editors ✅
- [x] Structured key-value pair editors for query parameters (replaces textarea)
- [x] Per-test headers KV editor (merged with project auth headers at runtime)
- [x] Add/remove rows with key and value inputs, Postman-style layout
- [x] Monospace font for inputs, automatic collection into object on save

### 8.9 Variable Autocomplete ✅
- [x] Type `{{` in endpoint field to trigger autocomplete dropdown
- [x] Shows built-in variables (`$timestamp`, `$guid`, `$randomEmail`, etc.)
- [x] Shows extracted variables from earlier tests in the same suite
- [x] Keyboard navigation (arrow keys, Enter/Tab to select, Escape to dismiss)
- [x] Cursor-position-aware — works for mid-string `{{` patterns

### 8.10 Response Path Autocomplete ✅
- [x] After "Try & Auto-Generate", response data is stored for path suggestions
- [x] Validation path inputs show dropdown with all available response paths
- [x] Each suggestion shows data type and value preview
- [x] Recursive walk of response data to build flat path list
- [x] Event delegation for dynamically created validation path inputs

### 8.11 Right-Click Context Menu ✅
- [x] Custom context menu on right-click of any test item
- [x] Actions: Quick Run, Edit, Duplicate, Copy as cURL, Move Up, Move Down, Skip/Unskip, Delete
- [x] Viewport boundary detection to prevent off-screen rendering
- [x] Click-away dismiss, keyboard-accessible
- [x] Danger styling for destructive actions (Delete)

### 8.6 Keyboard Shortcuts Help ✅
- [x] Press `?` to show keyboard shortcuts overlay
- [x] Two-column grid layout with section icons
- [x] Keyboard icon button in top nav bar
- [x] Added Ctrl+S (save test), Ctrl+Shift+D (toggle theme)
- [x] macOS Cmd note in footer

### 8.7 Inline Form Validation ✅
- [x] Red borders + inline error messages on invalid fields (not just toasts)
- [x] Validate test config before save (required fields, valid JSON body, valid endpoint)
- [x] Validates dataset JSON array and poll JSON
- [x] Auto-clear errors on input

### 8.12 CodeMirror Body Editor ✅
- [x] JSON syntax highlighting with CodeMirror 5 for request body editing
- [x] Bracket matching, auto-close brackets, code folding
- [x] Line numbers and line wrapping
- [x] Dark/light theme support matching the app theme
- [x] Variable autocomplete via `{{` trigger inside the body editor
- [x] Placeholder text showing example with built-in variables

### 8.13 Fullscreen Body Editor ✅
- [x] Dedicated fullscreen dialog for editing large JSON request bodies
- [x] Opens from "Fullscreen" button next to body field in test editor
- [x] Full-viewport CodeMirror editor (~100vh - 80px height)
- [x] "Format" button to auto-format JSON with proper indentation
- [x] "Insert Variable" button with variable picker
- [x] Content syncs back to main body editor on close
- [x] Escape key or "Done" button to close
- [x] Theme-aware (dark/light) matching app theme

### 8.14 Fullscreen Test Editor ✅
- [x] Toggle entire test editor modal to fullscreen mode
- [x] F11 keyboard shortcut to toggle fullscreen
- [x] Fullscreen toggle button in modal header
- [x] All CodeMirror editors (body, JSON editor) resize appropriately
- [x] Resets on modal close

### 8.15 Built-in Variables (Extended Set) ✅
- [x] `{{$increment}}` — auto-incrementing counter (resets per run)
- [x] `{{$sequence}}` — sequential counter (never resets across runs)
- [x] `{{$guid}}` — random UUID v4
- [x] `{{$timestamp}}` — current Unix timestamp (seconds)
- [x] `{{$randomInt}}` — random integer (0-9999)
- [x] `{{$randomName}}` — random full name from name pool
- [x] `{{$randomEmail}}` — random email address
- [x] `{{$randomString}}` — random 10-character alphanumeric string
- [x] Server-side variable resolution for Try Request endpoint
- [x] Client-side variable hints displayed below body editor

---

## 9. Security & Enterprise

### 9.1 Web UI Authentication
- [ ] Basic login (username/password) to protect the web UI
- [ ] API key authentication for all server endpoints
- [ ] Session management with configurable timeout

### 9.2 Credential Encryption
- [ ] Encrypt auth tokens and passwords at rest in SQLite
- [ ] Master key configuration via environment variable
- [ ] Mask sensitive fields in project export (redact tokens)

### 9.3 Audit Log
- [ ] Track all changes to tests, suites, and project config
- [ ] Log who changed what and when
- [ ] Audit log viewer in the web UI

### 9.4 Role-Based Access Control
- [ ] Define user roles (admin, editor, viewer)
- [ ] Viewers can see results but not modify tests or credentials
- [ ] Editors can modify tests but not project settings

---

## 10. Developer Experience

### 10.1 CLI Improvements
- [ ] Interactive project creation wizard: `npm run create-project`
- [ ] Generate test stubs from OpenAPI spec: `npm run generate -- --spec openapi.yaml`
- [ ] Validate all test JSON files: `npm run validate-configs`

### 10.2 VS Code Extension
- [ ] JSON schema for test config files (auto-complete in VS Code)
- [ ] Inline validation type suggestions
- [ ] Run individual tests from VS Code
- [ ] View report inline in VS Code

### 10.3 Documentation
- [ ] Add interactive examples in docs (try validation types live)
- [ ] Video tutorials for common workflows
- [ ] Searchable documentation

### 10.4 API Mock Server
- [ ] Built-in mock endpoints for contract testing
- [ ] Define expected responses per endpoint when real API is unavailable
- [ ] Record & replay mode: capture real responses, serve as mocks later

---

## What's Next — Remaining Items

### High Impact — Work Reducers (Recommended Next)
1. ~~**Test Templates / CRUD Generator** (6.11)~~ — **DONE** (6 built-in templates: CRUD, Auth Flow, Pagination, Health, Search & Filter, Error Handling)
2. ~~**Bulk Test Operations** (6.10)~~ — **DONE** (bulk tag, skip, status, timeout, method, find/replace, auto-generate, delete)
3. ~~**Scheduled Test Runs** (6.7)~~ — **DONE** (cron scheduler with presets, pause/resume, in-process engine)
4. ~~**Response Comparison / Diff** (6.8)~~ — **DONE** (snapshot capture, side-by-side diff, LCS line diff, filter by change type)
5. ~~**Schema Drift Detection** (6.9)~~ — **DONE** (baseline capture, drift report with field-level changes)
6. ~~**Notification Integration** (5.4)~~ — **DONE** (Slack/Teams webhooks, SMTP email, per-project config, failure-only mode)
7. ~~**Visual KV Editors** (8.8)~~ — **DONE** (structured key-value editors for query params & per-test headers)
8. ~~**Variable Autocomplete** (8.9)~~ — **DONE** (`{{` trigger, built-in + extracted vars, keyboard nav)
9. ~~**Response Path Autocomplete** (8.10)~~ — **DONE** (path suggestions from Try & Auto-Generate response data)
10. ~~**Right-Click Context Menu** (8.11)~~ — **DONE** (Quick Run, Edit, Duplicate, cURL, Move, Skip, Delete)
11. ~~**Request Preview in Editor** (8.5)~~ — **DONE** (live resolved URL, headers, body, cURL preview with debounced updates)
12. ~~**Keyboard Shortcuts Help** (8.6)~~ — **DONE** (two-column overlay, `?` key, Ctrl+S save, Ctrl+Shift+D theme)
13. ~~**Inline Form Validation** (8.7)~~ — **DONE** (red borders, inline error messages, JSON validation)

### High Impact — Automation & Testing
7. **Response Time / SLA Assertions** (7.1) — `responseTime` validation, performance thresholds
8. **Header Validations** (7.2) — `headerEquals`, `headerExists`, `headerContains`
9. **Webhook Triggers / CI Integration** (6.13) — REST endpoint for CI pipelines to trigger runs
10. **Quick Single-Test Run** (8.1) — play button on test cards, inline result display
11. **Test Flakiness Detection** (8.3) — track intermittent failures, flag flaky tests
12. **Performance Regression Detection** (8.4) — response time trend alerts

### Security & Enterprise
13. **Web UI Authentication** (9.1) — login, API keys, session management
14. **Credential Encryption** (9.2) — encrypt tokens/passwords at rest
15. **Audit Log** (9.3) — track changes to tests and config
16. **Run Retention Policy** (8.2) — auto-purge old runs, paginated history

### UI & Polish
17. **Custom Color Themes** (1.2) — accent color picker, preset themes (Ocean, Forest, Sunset)
18. **Responsive Design** (1.4) — tablet/mobile layout improvements
19. **Drag Tests Between Suites** (2.4) — cross-suite drag & drop
20. **Configurable Logo in Reports** (1.3) — company/project branding
21. ~~**Inline Form Validation** (8.7)~~ — **DONE** (red borders + inline errors)
22. ~~**Keyboard Shortcuts Help** (8.6)~~ — **DONE** (`?` overlay, tooltip hints)
23. ~~**Request Preview in Editor** (8.5)~~ — **DONE** (live preview of resolved request)
24. ~~**CodeMirror Body Editor** (8.12)~~ — **DONE** (JSON syntax highlighting, bracket matching, code folding)
25. ~~**Fullscreen Body Editor** (8.13)~~ — **DONE** (dedicated fullscreen dialog with format button)
26. ~~**Fullscreen Test Editor** (8.14)~~ — **DONE** (F11 toggle, fullscreen modal)
27. ~~**Extended Built-in Variables** (8.15)~~ — **DONE** ($increment, $sequence, $randomName, $randomString, server-side resolution)

### Advanced Features
24. **Test Dependencies** (6.14) — `dependsOn` for conditional test flow
25. **OAuth 2.0 / Token Refresh** (6.15) — auto-refresh expired tokens
26. **GraphQL Support** (6.1) — query/variables fields, GraphQL-specific validation
27. **WebSocket Testing** (6.2) — connect, send, and validate messages
28. **API Mock Server** (10.4) — contract testing, record & replay
29. **API Response Caching** (6.6) — cache repeated requests within a run
30. **CLI Wizard** (10.1) — interactive project creation, config validation
31. **VS Code Extension** (10.2) — JSON schema, inline suggestions, run from editor
32. **Interactive Docs** (10.3) — searchable docs, live validation examples
