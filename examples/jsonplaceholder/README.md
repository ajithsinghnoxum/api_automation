# Getting Started — JSONPlaceholder Example

A complete walkthrough to set up your first API test project using [JSONPlaceholder](https://jsonplaceholder.typicode.com), a free fake REST API. Follow these steps to learn how the framework works, then apply the same pattern to your own APIs.

---

## Step 1: Start the Server

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Step 2: Create a Project

1. In the sidebar, click **+ New Project**
2. Fill in the project form:

| Field | Value |
|-------|-------|
| **Project Name** | `JSONPlaceholder (Examples)` |
| **Base URL** | `https://jsonplaceholder.typicode.com` |
| **Auth Type** | `None` |

3. Click **Save**

> **What this does:** Creates a project entry in the database. The base URL is prepended to all test endpoints — so a test with endpoint `posts` will call `https://jsonplaceholder.typicode.com/posts`.

---

## Step 3: Import the Example Test Suites

1. Click your new project in the sidebar to open it
2. In the project toolbar, click **Import** (or the import icon)
3. Select **JSON File**
4. Browse to `examples/jsonplaceholder/` and import each file:

| File | What it teaches |
|------|----------------|
| `posts.json` | Basic CRUD operations (GET, POST, PUT, PATCH, DELETE) |
| `users.json` | Schema validation, nested objects, regex, string checks |
| `todos.json` | Boolean filtering, array search validators |
| `comments.json` | Nested API resources, email validation |
| `albums-photos.json` | Related resources, URL format validation |
| `crud-workflow.json` | **Variable chaining** — the most powerful feature |

---

## Step 4: Run the Tests

- Click **Run All** in the toolbar to execute every test suite
- Or click the **play button** (▶) next to any individual test for a quick run

After running, you'll see pass/fail status dots and response times on each test.

---

## Step 5: Explore Key Features

### Validation Types

Open `posts.json` suite to see these in action:

```json
{ "type": "isArray" }                           // Response is an array
{ "type": "arrayLength", "exact": 100 }         // Exactly 100 items
{ "type": "equals", "path": "id", "value": 1 }  // Field equals value
{ "type": "typeOf", "path": "title", "expected": "string" }  // Type check
```

### Array Validators

Open `users.json` to see advanced array checks:

```json
// Every item in array must pass these validations
{ "type": "arrayEvery", "validations": [
    { "type": "exists", "path": "email" }
]}

// At least one item must match
{ "type": "arraySome", "validations": [
    { "type": "regex", "path": "website", "pattern": "\\.org$" }
]}

// No items should match (negative assertion)
{ "type": "arrayNone", "validations": [
    { "type": "equals", "path": "name", "value": "" }
]}

// Find specific item and validate it
{ "type": "arrayFind", "where": { "path": "name", "value": "Ervin Howell" },
  "validations": [
    { "type": "equals", "path": "id", "value": 2 }
]}

// Validate item at specific index
{ "type": "arrayItemAt", "index": 0, "validations": [
    { "type": "equals", "path": "name", "value": "Leanne Graham" }
]}
```

### Schema Validation

Validate the shape of a response object:

```json
{
  "type": "schema",
  "properties": {
    "userId": "number",
    "id": "number",
    "title": "string",
    "body": "string"
  }
}
```

### Variable Chaining (extract + {{variables}})

Open `crud-workflow.json` — this is the most important pattern for real-world API testing:

```json
// Test 1: GET a post and extract its ID
{
  "name": "fetch post",
  "method": "GET",
  "endpoint": "posts/1",
  "extract": {
    "postId": "id",           // Save response.id as {{postId}}
    "originalTitle": "title"  // Save response.title as {{originalTitle}}
  }
}

// Test 2: Use extracted variable in the next request
{
  "name": "update the post",
  "method": "PUT",
  "endpoint": "posts/{{postId}}",   // Resolves to posts/1
  "body": {
    "id": "{{postId}}",
    "title": "Updated Title"
  }
}
```

Variables work in: endpoints, request bodies, query params, and headers.

### Query Parameters

Filter API results:

```json
{
  "endpoint": "posts",
  "queryParams": { "userId": "1" }
}
// Calls: https://jsonplaceholder.typicode.com/posts?userId=1
```

### Test Options

```json
{ "skip": true }         // Skip this test during runs
{ "timeout": 60000 }     // Custom timeout in ms (default: 30s)
{ "tags": ["smoke"] }    // Tag for filtering: TEST_TAGS=smoke
```

---

## Step 6: Build Your Own API Config

Now apply the same pattern to your own API:

### 1. Create a new project

| Field | Your value |
|-------|------------|
| **Project Name** | Your API name |
| **Base URL** | e.g. `https://api.yourservice.com/v1` |
| **Auth Type** | `Bearer Token`, `Basic Auth`, or `API Key` |
| **Credentials** | Fill in based on auth type |

### 2. Create a test suite

Click **+ New Suite**, give it a name, then add tests using the visual editor:

- Pick the **HTTP method** (GET, POST, PUT, PATCH, DELETE)
- Enter the **endpoint** (relative to base URL, e.g. `users` not the full URL)
- Set the **expected status code**
- Add **validations** to check the response
- Use **Try & Auto-Generate** to send a request and auto-create validations from the actual response

### 3. Chain tests together

For workflows (e.g. create → read → update → delete):

1. In the first test, add `extract` fields to capture response values
2. In subsequent tests, use `{{variableName}}` to reference them
3. Open **Chain Builder** to visualize the variable flow

### 4. Add environments (optional)

In project settings, add environments to override the base URL per environment:

| Environment | Base URL |
|-------------|----------|
| `dev` | `https://dev-api.yourservice.com/v1` |
| `staging` | `https://staging-api.yourservice.com/v1` |
| `prod` | `https://api.yourservice.com/v1` |

Switch environments from the toolbar dropdown, or use CLI: `TEST_ENV=staging npx playwright test`

### 5. Run via CLI

```bash
# Run all tests for your project
TEST_PROJECT=your-project-id npx playwright test

# Run with specific environment
TEST_PROJECT=your-project-id TEST_ENV=staging npx playwright test

# Run only smoke-tagged tests
TEST_PROJECT=your-project-id TEST_TAGS=smoke npx playwright test
```

---

## Test Suite JSON Format Reference

Every `.json` file in `test-configs/<project-id>/` follows this structure:

```json
{
  "suite": "Suite Name",
  "tests": [
    {
      "name": "test name (required)",
      "method": "GET|POST|PUT|PATCH|DELETE (required)",
      "endpoint": "relative/path (required)",
      "expectedStatus": 200,
      "headers": { "X-Custom": "value" },
      "queryParams": { "page": "1" },
      "body": { "key": "value" },
      "extract": { "varName": "response.path" },
      "validations": [
        { "type": "equals", "path": "field", "value": "expected" }
      ],
      "skip": false,
      "timeout": 30000,
      "tags": ["smoke", "regression"],
      "description": "Optional description",
      "dataSet": [
        { "userId": 1 },
        { "userId": 2 }
      ]
    }
  ]
}
```

---

## All Validation Types

| Type | Params | Description |
|------|--------|-------------|
| `equals` | `path`, `value` | Exact match |
| `notEquals` | `path`, `value` | Must not equal |
| `exists` | `path` | Field must be present |
| `notExists` | `path` | Field must not exist |
| `typeOf` | `path`, `expected` | Type check (string/number/boolean/object/array) |
| `contains` | `path`, `value` | Substring match |
| `notContains` | `path`, `value` | Must not contain |
| `startsWith` | `path`, `value` | String starts with |
| `endsWith` | `path`, `value` | String ends with |
| `regex` | `path`, `pattern` | Regex match |
| `greaterThan` | `path`, `value` | Numeric > |
| `greaterThanOrEqual` | `path`, `value` | Numeric >= |
| `lessThan` | `path`, `value` | Numeric < |
| `lessThanOrEqual` | `path`, `value` | Numeric <= |
| `between` | `path`, `min`, `max` | Range check |
| `stringLength` | `path`, `min`, `max` | String length range |
| `isArray` | — | Response is array |
| `isNotEmpty` | `path` | Not empty/null/undefined |
| `arrayLength` | `exact`/`min`/`max` | Array size check |
| `arrayEvery` | `validations[]` | All items must pass |
| `arraySome` | `validations[]` | At least one must pass |
| `arrayNone` | `validations[]` | No items should pass |
| `arrayFind` | `where`, `validations[]` | Find item and validate |
| `arrayItemAt` | `index`, `validations[]` | Validate by index |
| `schema` | `properties` | Object shape validation |
| `hasProperty` | `path`, `property` | Nested property check |
| `if` | `condition`, `then`, `else` | Conditional validation |

---

## What's Next?

- **Schedule automated runs** — Click the clock icon to set up cron schedules
- **Set up notifications** — Configure Slack/Teams/email alerts in project settings
- **Compare responses** — Use Response Diff to track changes between runs
- **Detect schema drift** — Capture a baseline and get alerts when the API structure changes
- **Import from Postman** — Already have a Postman collection? Import it directly
