# Local Development Guide

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 (`npm install -g pnpm`)
- **Docker** and Docker Compose (for PostgreSQL and API mocks)
- **Make** (included on macOS/Linux)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/organvm-iii-ergon/the-actual-news.git
cd the-actual-news

# 2. Copy environment config
cp .env.example .env
source .env

# 3. Start infrastructure (PostgreSQL + Prism API mocks)
make up

# 4. Run database migrations
make migrate

# 5. Install dependencies
pnpm install

# 6. Start all services in development mode
make dev
# Or start just the gateway:
make dev-minimal
```

## Architecture Overview

```
the-actual-news/
├── apps/public-web/     # Next.js frontend (port 3000)
├── services/
│   ├── gateway/         # API gateway (port 8080)
│   ├── story/           # Story management (port 8081)
│   ├── claim/           # Claim verification (port 8082)
│   ├── evidence/        # Evidence collection (port 8083)
│   └── verify/          # Verification engine (port 8084)
├── contracts/
│   ├── openapi/         # OpenAPI specs for all services
│   ├── events/          # Event schemas (JSON Schema)
│   └── policy-packs/    # Verification policy configurations
├── infra/               # Docker Compose + Postgres init
├── tools/
│   ├── conformance/     # Protocol conformance test suite
│   └── migrate.sh       # Database migration runner
└── db/migrations/       # SQL migration files
```

## Demo Mode (Without Blockchain)

The platform runs in **demo mode** by default. The Docker Compose setup uses
[Prism](https://stoplight.io/prism) to mock all OpenAPI-defined service
endpoints, so you can demonstrate the full news verification flow without
any blockchain infrastructure.

### Demo Flow

1. **Start infrastructure:** `make up` (starts Postgres + 5 Prism mock services)
2. **Run migrations:** `make migrate`
3. **Start frontend:** `cd apps/public-web && pnpm dev`
4. **Visit** http://localhost:3000 — the frontend renders with mock API data
5. **Run conformance tests:** `make test`

### Service Endpoints

| Service | Port | Health |
|---------|------|--------|
| Frontend | 3000 | http://localhost:3000 |
| Gateway | 8080 | http://localhost:8080 |
| Story | 8081 | http://localhost:8081 |
| Claim | 8082 | http://localhost:8082 |
| Evidence | 8083 | http://localhost:8083 |
| Verify | 8084 | http://localhost:8084 |
| PostgreSQL | 5432 | `pg_isready -h localhost` |

## Useful Commands

```bash
make up          # Start Docker infrastructure
make down        # Stop and remove volumes
make migrate     # Run database migrations
make reset       # down + up + migrate
make lint        # Lint OpenAPI specs with Redocly
make test        # Run conformance tests
make dev         # Start all services in dev mode
make dev-minimal # Start gateway only
```

## Conformance Tests

The `tools/conformance/` directory contains protocol conformance tests with
pre-built fixtures (CT-01 through CT-07). Run them with:

```bash
make test
# Or directly:
node tools/conformance/run.mjs
```

## Teardown

```bash
make down
```

