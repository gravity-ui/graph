# Development Guide

This document provides a comprehensive guide for developing @gravity-ui/graph packages.

## Project Structure

This repository is a monorepo containing the following packages:

```
packages/
├── graph/         # @gravity-ui/graph - Core library
├── react/         # @gravity-ui/graph-react - React components
└── stories/       # @gravity-ui/graph-stories - Storybook examples (internal)
```

### Package Details

- **@gravity-ui/graph** (`packages/graph/`) - Core graph library with Canvas rendering, state management, and plugins (devtools, minimap)
- **@gravity-ui/graph-react** (`packages/react/`) - React components and hooks for graph integration
- **@gravity-ui/graph-stories** (`packages/stories/`) - Internal package for Storybook examples

## Setup

### Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)

### Installation

```bash
# Install all dependencies for the monorepo
npm install
```

This will install dependencies for all packages using npm workspaces. The workspaces feature automatically creates symlinks between local packages, so `@gravity-ui/graph-react` can use the local version of `@gravity-ui/graph` during development.

## Development Workflow

### 1. Running Storybook (Primary Development Mode)

The main development workflow uses Storybook with webpack aliases pointing directly to source files:

```bash
npm run storybook
# or
npm run dev
```

**How it works:**
- Webpack is configured with aliases that point to `src/` folders
- Changes in `packages/graph/src/` and `packages/react/src/` are immediately reflected
- Hot reload works for both packages
- No build step required for development

**Use this when:**
- Developing new features
- Testing components visually
- Debugging interactions

### 2. TypeScript Type Checking

Check types across all packages:

```bash
npm run typecheck
```

Watch mode for continuous type checking:

```bash
npm run typecheck:watch
```

**How it works:**
- Uses TypeScript project references
- Checks all packages in dependency order
- Works directly with source files

### 3. Running Tests

Run all tests once:

```bash
npm run test
```

Watch mode for continuous testing:

```bash
npm run test:watch
```

Update snapshots:

```bash
npm run test:update
```

**How it works:**
- Jest is configured with `moduleNameMapper` pointing to `src/` folders
- Tests work directly with source files
- No build step required

### 4. Building for Production

Build both packages:

```bash
npm run build
```

Build individual packages:

```bash
npm run build:graph    # Build @gravity-ui/graph
npm run build:react    # Build @gravity-ui/graph-react
```

Watch mode for incremental builds:

```bash
npm run watch
```

**How it works:**
- Uses Rollup to build ESM modules
- Outputs to `packages/*/dist/` directories
- Preserves module structure with `preserveModules`
- Copies CSS files to dist

**When to build:**
- Before publishing to npm
- When testing the built output
- For production deployments

### 5. Linting

Lint all packages:

```bash
npm run lint
```

Auto-fix linting issues:

```bash
npm run lint:fix
```

### 6. Cleaning Build Artifacts

```bash
npm run clean
```

This removes all `dist` and `build` directories from packages.

## Package Development

### Adding a New Feature

1. **Develop in source files:**
   ```bash
   # Edit files in packages/graph/src/ or packages/react/src/
   npm run dev  # Start Storybook to see changes
   ```

2. **Add tests:**
   ```bash
   # Create test files next to your source files
   npm run test:watch  # Run tests in watch mode
   ```

3. **Type check:**
   ```bash
   npm run typecheck  # Ensure no type errors
   ```

4. **Build to verify:**
   ```bash
   npm run build  # Verify production build works
   ```

### Working with Dependencies

#### Adding Dependencies to Packages

Add runtime dependency to @gravity-ui/graph:
```bash
npm install <package> -w @gravity-ui/graph
```

Add runtime dependency to @gravity-ui/graph-react:
```bash
npm install <package> -w @gravity-ui/graph-react
```

Add dev dependency to root:
```bash
npm install -D <package>
```

#### Adding Dependencies to Stories

```bash
npm install <package> -w @gravity-ui/graph-stories
```

### Package Exports

#### @gravity-ui/graph

```typescript
// Main export
import { Graph, Layer } from '@gravity-ui/graph';

// DevTools plugin
import { DevToolsLayer } from '@gravity-ui/graph/devtools';

// MiniMap plugin
import { MiniMapLayer } from '@gravity-ui/graph/minimap';
```

#### @gravity-ui/graph-react

```typescript
import { GraphCanvas, useGraph, GraphBlock } from '@gravity-ui/graph-react';
```

## TypeScript Configuration

The project uses TypeScript project references for efficient type checking:

- **`tsconfig.base.json`** - Shared compiler options
- **`tsconfig.json`** - Root configuration with project references
- **`packages/graph/tsconfig.json`** - Config for core package
- **`packages/react/tsconfig.json`** - Config for React package (references graph)
- **`packages/stories/tsconfig.json`** - Config for stories (references both)

## Build System

### Rollup Configuration

The build uses Rollup with the following plugins:

- `@rollup/plugin-typescript` - TypeScript compilation
- `@rollup/plugin-node-resolve` - Resolve node_modules
- `@rollup/plugin-commonjs` - Convert CommonJS to ESM
- `rollup-plugin-postcss` - Process CSS
- `rollup-plugin-copy` - Copy CSS files to dist

### Output Format

- **Format:** ESM only
- **Module Preservation:** Source structure is preserved
- **Type Definitions:** Generated with declaration maps
- **Source Maps:** Included for debugging

## Publishing

The project uses `release-please` for automated releases with **independent package versioning**:

1. **Make changes** following conventional commits:
   ```bash
   git commit -m "feat(graph): add new feature"
   git commit -m "fix(react): resolve bug"
   ```

2. **Push to main:**
   ```bash
   git push origin main
   ```

3. **Release Please** creates **separate PRs** for each changed package:
   - Each package gets its own version bump
   - Independent CHANGELOGs
   - Separate release notes

4. **Merge the PR** to trigger:
   - GitHub Release creation with package-specific tag (e.g., `@gravity-ui/graph-v1.4.1`)
   - **Only the changed package** is published to npm

### How it works:

- **Independent versions**: Each package has its own version number
- **Selective publishing**: Only packages that changed are released
- **Separate tags**: Tags include package name (e.g., `@gravity-ui/graph-v1.4.0`, `@gravity-ui/graph-react-v1.4.1`)
- **Conventional commits**: Use package scope for targeted releases:
  - `feat(graph): ...` → releases `@gravity-ui/graph`
  - `fix(react): ...` → releases `@gravity-ui/graph-react`
  - `feat: ...` (no scope) → releases both if needed

### Manual Publishing (if needed)

```bash
# Build packages
npm run build

# Publish graph package
cd packages/graph
npm publish --access public

# Publish react package
cd packages/react
npm publish --access public
```

## Troubleshooting

### TypeScript Can't Find Types

```bash
# Clean and rebuild TypeScript project references
npm run clean
npm run typecheck
```

### Jest Tests Failing with Import Errors

Check that `jest.config.ts` has correct `moduleNameMapper` entries pointing to source directories.

### Storybook Not Finding Modules

Check that `.storybook/main.ts` has correct webpack aliases pointing to source directories.

### Build Errors

```bash
# Clean everything and start fresh
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Workspaces Not Linking Correctly

```bash
# Reinstall to fix symlinks
npm install
```

## Best Practices

1. **Always type check** before committing:
   ```bash
   npm run typecheck
   ```

2. **Run tests** before pushing:
   ```bash
   npm run test
   ```

3. **Use conventional commits with scopes** for targeted releases:
   - `feat(graph): ...` → releases only `@gravity-ui/graph` (minor bump)
   - `fix(react): ...` → releases only `@gravity-ui/graph-react` (patch bump)
   - `feat!:` or `BREAKING CHANGE:` → major version bump
   - `feat: ...` (no scope) → may trigger both packages if files changed

4. **Test both source and built versions:**
   - Source: Use Storybook (`npm run dev`)
   - Built: Build and test in a separate project

5. **Keep packages focused:**
   - Core logic in `@gravity-ui/graph`
   - React-specific code in `@gravity-ui/graph-react`
   - Examples in stories (not published)

## Additional Resources

- [README.md](./README.md) - Project overview and usage
- [docs/](./docs/) - Detailed documentation
- [Migration Guide](./docs/migration-guides/monorepo-migration.md) - Migrating from single package

