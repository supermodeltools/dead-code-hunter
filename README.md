# Dead Code Hunter

A GitHub Action that uses [Supermodel](https://supermodeltools.com) to find unreachable functions in your codebase.

## What it does

1. Creates a zip archive of your repository using `git archive`
2. Sends it to Supermodel's graph API for analysis
3. Identifies functions with no callers (dead code)
4. Filters out false positives (entry points, exports, tests)
5. Posts findings as a PR comment

## Usage

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

## Getting a Supermodel API Key

1. Sign up at [supermodeltools.com](https://supermodeltools.com)
2. Create an API key in the dashboard
3. Add it as a repository secret named `SUPERMODEL_API_KEY`

## Configuration

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `supermodel-api-key` | Your Supermodel API key | Yes | - |
| `github-token` | GitHub token for PR comments | No | `${{ github.token }}` |
| `comment-on-pr` | Post findings as PR comment | No | `true` |
| `fail-on-dead-code` | Fail the action if dead code found | No | `false` |
| `ignore-patterns` | JSON array of glob patterns to ignore | No | `[]` |

## Outputs

| Output | Description |
|--------|-------------|
| `dead-code-count` | Number of potentially dead functions found |
| `dead-code-json` | JSON array of dead code findings |

## Example PR Comment

When dead code is found, the action posts a comment like:

> ## Dead Code Hunter
>
> Found **3** potentially unused functions:
>
> | Function | File | Line |
> |----------|------|------|
> | `unusedHelperFunction` | src/example-dead-code.ts#L7 | L7 |
> | `formatUnusedData` | src/example-dead-code.ts#L12 | L12 |
> | `fetchUnusedData` | src/example-dead-code.ts#L17 | L17 |
>
> ---
> _Powered by [Supermodel](https://supermodeltools.com) graph analysis_

## False Positive Filtering

The action automatically filters out:

- **Entry point files**: `index.ts`, `main.ts`, `app.ts`
- **Entry point functions**: `main`, `run`, `start`, `init`, `handler`, HTTP methods
- **Exported functions**: Functions marked as exported (may be called externally)
- **Test files**: `*.test.ts`, `*.spec.ts`, `__tests__/**`
- **Build artifacts**: `node_modules`, `dist`, `build`, `target`

You can add custom ignore patterns:

```yaml
- uses: supermodeltools/dead-code-hunter@v1
  with:
    supermodel-api-key: ${{ secrets.SUPERMODEL_API_KEY }}
    ignore-patterns: '["**/generated/**", "**/migrations/**"]'
```

## Supported Languages

Supermodel supports analysis for:

- TypeScript / JavaScript
- Python
- Java
- Go
- Rust
- And more...

## How it Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  git archive    │────▶│  Supermodel API │────▶│  Graph          │
│  (create zip)   │     │  /v1/graphs/    │     │  Analysis       │
└─────────────────┘     │  supermodel     │     └─────────────────┘
                        └─────────────────┘             │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  PR Comment     │◀────│  Filter False   │◀────│  Find Uncalled  │
│  (findings)     │     │  Positives      │     │  Functions      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## License

MIT
