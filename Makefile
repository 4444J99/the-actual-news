PLATFORM_ID ?=
POSTGRES_URI ?=
CIVIC_STORY_ID ?= 01JCYSTORY00000000000001
CIVIC_BUNDLE_SCHEMA ?= bundle_01jcycivic000000000000001
INGESTION_PORT ?= 8085
export PLATFORM_ID
export POSTGRES_URI
export CIVIC_STORY_ID
export CIVIC_BUNDLE_SCHEMA

.PHONY: up up-public up-internal down down-public down-internal migrate reset lint test dev dev-minimal civic-seed civic-export civic-replay

up:
	docker compose -f infra/docker-compose.yml up -d

up-public:
	docker compose --env-file .env.public.example -f infra/docker-compose.public.yml up --build -d

up-internal:
	docker compose --env-file .env.internal.example -f infra/docker-compose.internal.yml up --build -d

down:
	docker compose -f infra/docker-compose.yml down -v

down-public:
	docker compose --env-file .env.public.example -f infra/docker-compose.public.yml down

down-internal:
	docker compose --env-file .env.internal.example -f infra/docker-compose.internal.yml down -v

migrate:
	POSTGRES_URI="$(POSTGRES_URI)" bash tools/migrate.sh

reset: down up migrate

lint:
	npx @redocly/cli lint

test:
	node tools/conformance/run.mjs

dev:
	pnpm -r --parallel dev

dev-minimal:
	cd services/gateway && pnpm dev

civic-seed:
	node tools/civic-bundle/seed.mjs

civic-export:
	@node tools/civic-bundle/export.mjs --story-id "$(CIVIC_STORY_ID)" --schema "$(CIVIC_BUNDLE_SCHEMA)"

civic-replay:
	node tools/civic-bundle/replay.mjs
