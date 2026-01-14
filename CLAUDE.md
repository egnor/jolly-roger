# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Jolly Roger?

Jolly Roger is a coordination tool for collaboratively solving puzzlehunts like the MIT Mystery Hunt. It tracks puzzles and guesses, provides per-puzzle chat rooms and automatically creates Google Sheets for each puzzle.

## Development Commands

**Always use `meteor npm` and `meteor node` instead of `npm` or `node`** - Meteor bundles specific versions it needs.

```bash
# Install dependencies
meteor npm install

# Run development server (http://localhost:3000)
meteor

# Run all linting (types, biome, eslint, stylelint, knip)
npm run lint

# Run specific linters
npm run lint:types    # TypeScript type checking
npm run lint:biome    # Biome linting
npm run lint:eslint   # ESLint
npm run lint:css      # Stylelint for SCSS and styled-components

# Run tests (uses Playwright)
npm run test
```

## Architecture Overview

### Entry Points
- [client/main.ts](client/main.ts) - Client bundle entry, mounts React app
- [server/main.ts](server/main.ts) - Server entry, sets up database, methods, publications

### Directory Structure
- `imports/lib/` - Shared code between client and server
  - `models/` - Zod-based MongoDB models with schema validation
  - `publications/` - TypedPublication definitions (pub names and arg types)
- `imports/client/` - Client-only code
  - `components/` - React components
  - `hooks/` - React hooks including `useTypedSubscribe`
- `imports/methods/` - TypedMethod definitions (method names and arg types)
- `imports/server/` - Server-only code
  - `methods/` - Method implementations using `defineMethod()`
  - `publications/` - Publication implementations using `definePublication()`
  - `hooks/` - Server-side event hooks (puzzle created, solved, etc.)

### Key Patterns

**Models** ([imports/lib/models/Model.ts](imports/lib/models/Model.ts)): Wrap Meteor collections with Zod schema validation. Schemas are used for both TypeScript types and MongoDB JSON schema validation.

```typescript
const Puzzle = withCommon(z.object({
  hunt: foreignKey,
  title: nonEmptyString,
  // ...
}));
const Puzzles = new SoftDeletedModel("jr_puzzles", Puzzle);
```

**Methods**: Type definitions are separate from implementations. Definition in `imports/methods/`, implementation in `imports/server/methods/`.

```typescript
// imports/methods/createPuzzle.ts - defines types
new TypedMethod<{ huntId: string; title: string; ... }, string>("Puzzles.methods.create");

// imports/server/methods/createPuzzle.ts - implements
defineMethod(createPuzzle, {
  validate(arg) { check(arg, {...}); return arg; },
  async run({ huntId, title, ... }) { ... }
});
```

**Publications**: Same split pattern - `imports/lib/publications/` for types, `imports/server/publications/` for implementations.

**Server Hooks** ([imports/server/hooks/Hookset.ts](imports/server/hooks/Hookset.ts)): Register for events like `onPuzzleCreated`, `onPuzzleSolved`, `onChatMessageCreated`. Add hooks to the registry in [imports/server/hooks/GlobalHooks.ts](imports/server/GlobalHooks.ts).

### Custom ESLint Rule

The `jolly-roger/no-disallowed-sync-methods` rule enforces async methods on server-side code. Use `findOneAsync()` instead of `findOne()`, `insertAsync()` instead of `insert()`, etc. This rule is disabled for client code.

## Tech Stack

- Meteor v2 framework (requires Node.js v14 for production builds)
- React 18 with react-router-dom v6
- MongoDB with Zod schema validation
- Bootstrap 5 + styled-components
- Discord.js for Discord integration
- Google APIs for Drive/Sheets integration
- Mediasoup for WebRTC audio calls
