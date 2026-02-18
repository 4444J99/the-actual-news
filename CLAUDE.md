# CLAUDE.md — the-actual-news

**ORGAN III** (Commerce) · `organvm-iii-ergon/the-actual-news`
**Status:** ACTIVE · **Branch:** `main`

## What This Repo Is

Verifiable news ledger platform — news as a public service

## Stack

**Languages:** TypeScript, PLpgSQL, JavaScript
**Build:** pnpm, Make

## Directory Structure

```
📁 .config/
📁 .github/
📁 apps/
    public-web
📁 contracts/
📁 db/
📁 docs/
    adr
    architecture.md
    design
    glossary.md
    local-development.md
    roadmap.md
📁 infra/
📁 memory/
📁 services/
📁 specs/
📁 tools/
  .editorconfig
  .env.example
  .gitignore
  CHANGELOG.md
  LICENSE
  Makefile
  News-as-Public-Service.md
  README.md
  package.json
  pnpm-workspace.yaml
  seed.yaml
```

## Key Files

- `README.md` — Project documentation
- `package.json` — Dependencies and scripts
- `seed.yaml` — ORGANVM orchestration metadata

## Development

```bash
pnpm install    # Install dependencies
pnpm build      # Build all packages
pnpm test       # Run tests
pnpm dev        # Start development server
```

## ORGANVM Context

This repository is part of the **ORGANVM** eight-organ creative-institutional system.
It belongs to **ORGAN III (Commerce)** under the `organvm-iii-ergon` GitHub organization.

**Registry:** [`registry-v2.json`](https://github.com/meta-organvm/organvm-corpvs-testamentvm/blob/main/registry-v2.json)
**Corpus:** [`organvm-corpvs-testamentvm`](https://github.com/meta-organvm/organvm-corpvs-testamentvm)
