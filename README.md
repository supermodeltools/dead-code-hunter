# Dead Code Hunter

A GitHub Action that finds unused code in your codebase using [Supermodel](https://supermodeltools.com) static analysis.

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
| `github-token` | GitHub token for posting PR comments | No | `github.token` |
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

1. Creates a zip of your repository via `git archive`
2. Sends it to the Supermodel dead code analysis API
3. The API performs symbol-level import analysis to identify unused exports
4. Results are returned with confidence levels and reasons
5. Posts findings as a PR comment with a sortable table

## What it detects

- **Functions** and **methods** with no callers
- **Classes** and **interfaces** that are never referenced
- **Types**, **variables**, and **constants** that are exported but never imported
- **Orphaned files** whose exports have no importers anywhere in the codebase
- **Transitively dead code** — code only called by other dead code

Each finding includes a **confidence level** (high, medium, low) and a **reason** explaining why it was flagged.

## Example output

> ## Dead Code Hunter
>
> Found **3** potentially unused code elements:
>
> | Name | Type | File | Line | Confidence |
> |------|------|------|------|------------|
> | `unusedHelper` | function | src/utils.ts#L42 | L42 | :red_circle: high |
> | `OldValidator` | class | src/validation.ts#L15 | L15 | :red_circle: high |
> | `LegacyConfig` | interface | src/legacy.ts#L8 | L8 | :orange_circle: medium |
>
> <details><summary>Analysis summary</summary>
>
> - **Total declarations analyzed**: 150
> - **Dead code candidates**: 3
> - **Alive code**: 147
> - **Analysis method**: symbol_level_import_analysis
>
> </details>
>
> ---
> _Powered by [Supermodel](https://supermodeltools.com) dead code analysis_

## Supported languages

- TypeScript / JavaScript
- Python
- Java
- Go
- Rust
- And more...

## License

MIT
