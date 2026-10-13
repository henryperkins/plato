# Repository Guidelines

## Project Structure & Module Organization

plato is a React/Vite microlearning app with a Hono API.

- `client/src/`: pages, components, contexts, hooks, and lesson engines; `client/js/`: storage and AI orchestration.
- `client/assets/` holds images; `client/prompts/` holds bundled agent prompts.
- `server/src/`: routes, middleware, database adapters, and plugin host; local development uses SQLite, production uses AWS Lambda/DynamoDB.
- `plugins/<id>/` contains extensions; `packages/plugin-sdk/` supplies types. Read `docs/plugins/AUTHORING.md` and `docs/plugins/AGENTS.md` before plugin work.

## Build, Test, and Development Commands

Use Node.js 20+ and npm. Install dependencies with `npm --prefix client ci` and `npm --prefix server ci`; commands below run from the repository root.

- `npm run build:client`: build the SPA; run before first server startup.
- `npm run dev:server`: start the SQLite API at `http://localhost:3000`.
- `npm run dev:client`: start Vite with hot reload and API proxying.
- `npm run build`: build client and server; requires AWS SAM CLI.
- `npm test`: run both packages; `npm run test:client` or `npm run test:server` selects one.
- `npm --prefix client run lint` and `npm --prefix server run lint`: run ESLint.

## Coding Style & Naming Conventions

Use JavaScript ES modules, two-space indentation, single quotes, and semicolons, matching surrounding code. Use PascalCase for React `.jsx` components, camelCase for functions, and `use*` for hooks. ESLint checks JavaScript, React, and hooks; no formatter is configured. Every interactive element needs keyboard support and an accessible name.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Place `*.test.js` in `client/tests/` or `server/tests/{routes,lib}/`. Add regression tests for behavior changes; all tests must pass before merge. No numeric coverage threshold is configured. Run plugin tests separately with `node --test plugins/<id>/server/*.test.js` and validate manifests with `node scripts/validate-plugins.js`.

## Commit & Pull Request Guidelines

History uses short imperative subjects such as `Add admin-defined custom user fields` and `Fix chat auto-scroll`, with issue/PR references. Use `feat/<area>`, `fix/<area>`, or `plugin/<id>/<feature>` branches. Open Draft PRs during iteration. Describe behavior, link issues (`Fixes #N`), report validation, and include screenshots for UI changes. Update affected documentation. Merge requires an approving review and passing checks.

## Security & Configuration

Copy `server/.env.example` to `server/.env`; keep credentials untracked. AI conversations require AWS Bedrock access. Preserve authentication and URL-fetch safeguards. Review `docs/ARCHITECTURE.md` before changing lesson completion or persistence.
