# API Test Automation Framework

A full-featured, config-driven API testing framework built with **Playwright**, **Express 5**, and **SQLite**. Manage projects, write tests through a visual web UI, run them with Playwright, and view rich HTML reports — all without writing test code.

## Features

- **Visual Web UI** — Create and manage API test projects, suites, and test cases from the browser
- **Config-Driven Tests** — Define tests as JSON with endpoints, expected status, validations, and more
- **Rich Validations** — 20+ validation types: equals, schema, contains, regex, date checks, array operations, conditional logic
- **Variable Extraction & Chaining** — Extract values from responses and use `{{variables}}` in subsequent tests
- **Data-Driven Testing** — Run parameterized tests with `dataSet` arrays
- **Multiple Auth Types** — Bearer token, Basic auth, API key — configured per project
- **Multi-Environment Support** — Define dev/staging/prod overrides, switch with `TEST_ENV`
- **Import/Export** — Import from Postman collections, OpenAPI/Swagger specs, or JSON bundles
- **Test Templates** — One-click generate CRUD suites, auth flows, pagination checks, and more
- **Bulk Operations** — Multi-select tests to bulk tag, skip, update status, find/replace endpoints
- **Run History & Trends** — SQLite-backed history with pass/fail trends and response time tracking
- **Response Comparison** — Side-by-side diff between test runs with LCS-based line diffing
- **Schema Drift Detection** — Capture a schema baseline and detect when API response structures change
- **Scheduled Runs** — Cron-like scheduling with presets (every 5 min, hourly, daily, weekdays)
- **Notifications** — Slack, Microsoft Teams, and email (SMTP) notifications on test results
- **Chain Builder** — Visual flow editor showing variable dependencies between chained tests
- **Dark/Light Theme** — Toggle between themes with smooth transitions
- **Visual KV Editors** — Structured key-value pair editors for query params and per-test headers (like Postman)
- **Variable Autocomplete** — Type `{{` in endpoint fields to get autocomplete for built-in variables and extracted variables
- **Response Path Autocomplete** — After "Try & Auto-Generate", validation path inputs suggest all available response paths with types and value previews
- **Right-Click Context Menu** — Right-click any test item for quick actions: Run, Edit, Duplicate, Copy as cURL, Move Up/Down, Skip/Unskip, Delete
- **Per-Test Headers** — Define custom headers per test case, merged with project-level auth headers at runtime
- **CodeMirror Body Editor** — JSON syntax highlighting, bracket matching, auto-close brackets, code folding, and line numbers for request body editing
- **Fullscreen Body Editor** — Dedicated fullscreen dialog for editing large JSON payloads with Format and Insert Variable buttons
- **Fullscreen Test Editor** — Toggle the entire test editor modal to fullscreen with F11
- **Request Preview** — Live preview of the full request URL with resolved variables
- **Inline Form Validation** — Required fields highlighted with validation messages before save
- **Keyboard Shortcuts** — Press `?` to view all shortcuts; Ctrl+S to save, Ctrl+Enter to run, F11 for fullscreen

## Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**

### Installation

```bash
git clone https://github.com/ajithsinghnoxum/api_automation.git
cd api_automation
npm install
npx playwright install
```

### Start the Server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Tests via CLI

```bash
# Run all tests for a project
TEST_PROJECT=my-project npx playwright test

# Run with environment override
TEST_PROJECT=my-project TEST_ENV=staging npx playwright test

# Run only tests with specific tags
TEST_PROJECT=my-project TEST_TAGS=smoke npx playwright test
```

## Project Structure

```
api_automation/
├── server.ts                 # Express server (API + web UI + scheduler)
├── playwright.config.ts      # Playwright configuration
├── src/
│   ├── db.ts                 # SQLite database layer
│   ├── config/
│   │   └── env.config.ts     # Environment configuration
│   ├── helpers/
│   │   ├── api.helper.ts     # API request helper
│   │   ├── test-runner.ts    # Test execution engine
│   │   └── validator.ts      # Validation engine (20+ types)
│   ├── reporters/
│   │   └── html-reporter.ts  # Custom HTML report generator
│   └── types/
│       └── test-config.types.ts  # TypeScript type definitions
├── tests/
│   └── config-driven.api.spec.ts  # Main Playwright test spec
├── web/                      # Web UI
│   ├── index.html
│   ├── css/
│   │   ├── theme.css         # CSS variables & theming
│   │   ├── layout.css        # Page layout
│   │   └── components.css    # UI components
│   └── js/
│       ├── api.js            # API client
│       ├── app.js            # App initialization
│       ├── projects.js       # Project management
│       ├── suites.js         # Suite & test rendering
│       ├── test-editor.js    # Test case editor modal
│       ├── runner.js         # Test runner & history
│       ├── templates.js      # Test template generator
│       ├── bulk-ops.js       # Bulk test operations
│       ├── chain-builder.js  # Variable chain visualization
│       ├── response-diff.js  # Response comparison
│       ├── schema-drift.js   # Schema drift detection
│       ├── schedules.js      # Scheduled test runs
│       ├── settings.js       # Settings management
│       ├── state.js          # Global state management
│       └── drag-reorder.js   # Drag & drop reordering
├── docs/                     # Documentation site
├── test-configs/             # Test suite JSON files (per project)
└── IMPROVEMENTS.md           # Feature roadmap & progress
```

## Test Configuration

Tests are defined as JSON files in `test-configs/<project-id>/`:

```json
{
  "name": "User API Tests",
  "tests": [
    {
      "name": "get all users",
      "method": "GET",
      "endpoint": "users",
      "expectedStatus": 200,
      "validations": [
        { "type": "isArray", "path": "" },
        { "type": "arrayLength", "path": "", "min": 1 },
        { "type": "exists", "path": "[0].id" },
        { "type": "typeOf", "path": "[0].name", "expected": "string" }
      ]
    },
    {
      "name": "create user",
      "method": "POST",
      "endpoint": "users",
      "headers": { "X-Request-ID": "{{$guid}}" },
      "body": { "name": "Test User", "email": "{{$randomEmail}}" },
      "expectedStatus": 201,
      "extract": { "userId": "id" },
      "validations": [
        { "type": "exists", "path": "id" },
        { "type": "equals", "path": "name", "value": "Test User" }
      ]
    },
    {
      "name": "get created user",
      "method": "GET",
      "endpoint": "users/{{userId}}",
      "expectedStatus": 200
    }
  ]
}
```

## Validation Types

| Type | Description |
|------|-------------|
| `equals` | Exact value match |
| `notEquals` | Value must not equal |
| `exists` / `notExists` | Field presence check |
| `typeOf` | Type check (string, number, boolean, object, array) |
| `contains` / `notContains` | Substring check |
| `matches` | Regex match |
| `greaterThan` / `lessThan` | Numeric comparison |
| `between` | Range check (min, max) |
| `isArray` / `arrayLength` | Array checks |
| `arrayContains` / `arrayUnique` | Array content checks |
| `schema` | Object schema validation |
| `startsWith` / `endsWith` | String prefix/suffix |
| `isDate` / `dateBefore` / `dateAfter` | Date validations |
| `isEmpty` / `isNotEmpty` | Empty value check |
| `if` | Conditional validation |

## Built-in Variables

Use these in endpoints, bodies, headers, and query params:

| Variable | Description |
|----------|-------------|
| `{{$increment}}` | Auto-incrementing counter (resets per run) |
| `{{$sequence}}` | Sequential counter (never resets) |
| `{{$timestamp}}` | Current Unix timestamp |
| `{{$isoDate}}` | Current ISO date string |
| `{{$guid}}` | Random UUID v4 |
| `{{$randomInt}}` | Random integer (0-9999) |
| `{{$randomName}}` | Random full name |
| `{{$randomEmail}}` | Random email address |
| `{{$randomString}}` | Random 10-character alphanumeric string |

## Keyboard Shortcuts

Press `?` anywhere in the UI to see the shortcuts overlay.

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Run tests |
| `Ctrl+Shift+N` | New test suite |
| `Ctrl+Shift+F` | Focus search |
| `Ctrl+Shift+D` | Toggle dark/light theme |
| `?` | Show shortcuts help |
| `Ctrl+S` | Save test (in editor) |
| `F11` | Toggle fullscreen editor |
| `Esc` | Close current modal |
| `{{` | Trigger variable autocomplete |

## Notifications

Configure per-project in the project settings:

- **Slack** — Incoming webhook URL
- **Microsoft Teams** — Webhook connector URL
- **Email** — SMTP configuration (host, port, credentials)

Options: enable/disable, notify only on failure.

## Documentation

Full documentation is available at [http://localhost:3000/docs](http://localhost:3000/docs) when the server is running.

## License

ISC
