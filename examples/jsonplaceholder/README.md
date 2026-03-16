# JSONPlaceholder Example Test Suites

Ready-to-use test suites for [JSONPlaceholder](https://jsonplaceholder.typicode.com) — a free fake REST API.

## Setup

1. Create a new project in the app with base URL: `https://jsonplaceholder.typicode.com`
2. Import these test suite files via **Import > JSON File** in the project toolbar

## Test Suites

| File | Tests | Description |
|------|-------|-------------|
| `posts.json` | 10 | Full CRUD + schema validation, array filtering, arraySome/arrayNone |
| `users.json` | 17 | Schema, nested objects, regex email, stringLength, between, startsWith/endsWith, skip, timeout |
| `todos.json` | 6 | Boolean filtering, arraySome, arrayFind, arrayNone |
| `comments.json` | 5 | Nested resource, arrayEvery with regex, arrayItemAt, arrayFind |
| `albums-photos.json` | 5 | Related resources, URL regex validation, photo schema |
| `crud-workflow.json` | 6 | Variable chaining with `extract` — create, read, update, patch, delete flow |

## Features Demonstrated

- **Validation types**: equals, exists, typeOf, schema, regex, contains, startsWith, endsWith, isArray, isNotEmpty, arrayLength, greaterThan, lessThan, between, stringLength
- **Array validators**: arrayEvery, arraySome, arrayNone, arrayFind, arrayItemAt
- **Variable chaining**: `extract` + `{{variable}}` interpolation across tests
- **Query parameters**: Filtering with queryParams
- **All HTTP methods**: GET, POST, PUT, PATCH, DELETE
- **Test options**: skip, timeout, description
