# Dead Code Hunter

A GitHub Action that uses [Supermodel](https://supermodeltools.com) call graphs to find unreachable functions in your codebase.

## What it does

- Analyzes your codebase using Supermodel's call graph API
- Identifies functions with no callers (dead code)
- Comments on PRs with findings
- Optionally auto-generates cleanup PRs

## Usage

```yaml
name: Dead Code Hunter
on:
  pull_request:
  workflow_dispatch:

jobs:
  hunt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supermodeltools/dead-code-hunter@v1
        with:
          supermodel-api-key: ${{ secrets.SUPERMODEL_API_KEY }}
```

## Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `supermodel-api-key` | Your Supermodel API key | Required |
| `comment-on-pr` | Post findings as PR comment | `true` |
| `fail-on-dead-code` | Fail the action if dead code found | `false` |
| `ignore-patterns` | Glob patterns to ignore | `[]` |
| `auto-pr` | Create PR to remove dead code | `false` |

## How it works

1. Creates a zip archive of your repository
2. Sends it to Supermodel's `/v1/graphs/call` endpoint
3. Analyzes the call graph to find functions with zero incoming calls
4. Filters out entry points, exports, and test files
5. Reports findings

## License

MIT
