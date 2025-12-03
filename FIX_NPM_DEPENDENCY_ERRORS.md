# Fix NPM Dependency Errors

## Assessment

The errors you're seeing are **peer dependency conflicts** from transitive dependencies. They're not critical, but they're blocking the install.

### Error Breakdown

1. **Warnings (Harmless)**: Multiple `ERESOLVE overriding peer dependency` warnings

   - These are from deep dependency trees (like `@noble/secp256k1` → `ts-jest` → `bs-logger`)
   - They're dev dependencies of dependencies, won't affect runtime
   - Safe to ignore

2. **Blocking Error**: `bs-logger@0.2.6` requires `tslint-plugin-prettier@"2.x"`
   - This is a transitive dev dependency conflict
   - `tslint-plugin-prettier` is deprecated (tslint is deprecated)
   - This is from `@noble/secp256k1` → `ts-jest@28.0.4` → `bs-logger`

## Solution

### Option 1: Use pnpm (Recommended - Your Project Uses pnpm)

Your `package.json` shows all scripts use `pnpm`. Use pnpm instead:

```bash
# Remove node_modules and lock files first
rm -rf node_modules
rm -rf package-lock.json  # if it exists

# Use pnpm
pnpm install
```

pnpm handles peer dependencies more gracefully than npm.

### Option 2: Use npm with --legacy-peer-deps

If you must use npm:

```bash
npm install --legacy-peer-deps
```

This tells npm to ignore peer dependency conflicts (which is safe for these transitive dev dependencies).

### Option 3: Create .npmrc file

Create a `.npmrc` file in the project root:

```
legacy-peer-deps=true
```

Then run `npm install` normally.

## Why This Happens

- `@noble/secp256k1` (used by crypto libraries) has old dev dependencies
- `tslint` is deprecated (replaced by ESLint)
- npm 7+ is stricter about peer dependencies than npm 6
- These are dev dependencies, so they won't affect your production build

## Recommendation

**Use pnpm** - it's what your project is configured for, and it handles these conflicts better.
