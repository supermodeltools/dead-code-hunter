# Dead Code Hunter

A GitHub Action that finds unreachable functions in your codebase using [Supermodel](https://supermodeltools.com).

## Installation

### 1. Get an API key

Sign up at [dashboard.supermodeltools.com](https://dashboard.supermodeltools.com) and create an API key.

### 2. Add the secret to your repository

Go to your repo → Settings → Secrets and variables → Actions → New repository secret

- Name: `SUPERMODEL_API_KEY`
- Value: Your API key from step 1

### 3. Create a workflow file

Create `.github/workflows/dead-code.yml` in your repository:

```yaml
name: Dead Code Hunter

on:
  pull_request:

jobs:
  hunt:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: supermodeltools/dead-code-hunter@v1
        with:
          supermodel-api-key: ${{ secrets.SUPERMODEL_API_KEY }}
```

That's it! The action will now analyze your code on every PR and comment with any dead code found.

## Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `supermodel-api-key` | Your Supermodel API key | Yes | - |
| `comment-on-pr` | Post findings as PR comment | No | `true` |
| `fail-on-dead-code` | Fail the action if dead code found | No | `false` |
| `ignore-patterns` | JSON array of glob patterns to ignore | No | `[]` |

### Example with options

```yaml
- uses: supermodeltools/dead-code-hunter@v1
  with:
    supermodel-api-key: ${{ secrets.SUPERMODEL_API_KEY }}
    fail-on-dead-code: true
    ignore-patterns: '["**/generated/**", "**/migrations/**"]'
```

## What it does

1. Creates a zip of your repository
2. Sends it to Supermodel for analysis
3. Identifies functions with no callers
4. Filters out false positives (entry points, exports, tests)
5. Posts findings as a PR comment

## Example output

> ## Dead Code Hunter
>
> Found **3** potentially unused functions:
>
> | Function | File | Line |
> |----------|------|------|
> | `unusedHelper` | src/utils.ts#L42 | L42 |
> | `oldValidator` | src/validation.ts#L15 | L15 |
> | `deprecatedFn` | src/legacy.ts#L8 | L8 |
>
> ---
> _Powered by [Supermodel](https://supermodeltools.com) graph analysis_

## False positive filtering

The action automatically skips:

- **Entry point files**: `index.ts`, `main.ts`, `app.ts`
- **Entry point functions**: `main`, `run`, `start`, `init`, `handler`
- **Exported functions**: May be called from outside the repo
- **Test files**: `*.test.ts`, `*.spec.ts`, `__tests__/**`
- **Build output**: `node_modules`, `dist`, `build`, `target`

## Supported languages

- TypeScript / JavaScript
- Python
- Java
- Go
- Rust
- And more...

## License

MIT
