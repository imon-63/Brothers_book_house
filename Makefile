# Cholo — common tasks.  `make help`
#
# Local mode (recommended for development):
#   Postgres on the host :5432 · API on the host :4000 · web on the host :3000
#   observability in Docker (collector :4318, Prometheus :9090, Tempo :3200, Grafana :3001)
#
#   make obs-up   → start collector + prometheus + tempo + grafana
#   make api      → backend in watch mode (terminal 1)
#   make web      → Next.js dev server   (terminal 2)
#   make seed     → idempotent seed into backend/.env DATABASE_URL

SHELL := /bin/bash
OBS   := docker compose -f docker-compose.observability.yml
LOCAL := docker compose -f docker-compose.local.yml
DEV   := docker compose -f docker-compose.yml -f docker-compose.dev.yml

.DEFAULT_GOAL := help
.PHONY: help install obs-up obs-down obs-logs obs-reload api web seed seed-force migrate db-status \
        test e2e lint typecheck check export-data dashboards up down logs ps seed-docker prod-up backup

help: ## show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## npm ci in backend and frontend
	cd backend && npm ci
	cd frontend && npm ci

# ── local observability (API/web run on the host) ──
obs-up: ## start otel-collector, prometheus, tempo, grafana (Grafana → http://localhost:3001)
	$(OBS) up -d
	@echo ""
	@echo "  Grafana     http://localhost:3001  (API latency by route is the home dashboard)"
	@echo "  Prometheus  http://localhost:9090/targets  (cholo-api should be UP once 'make api' runs)"
	@echo "  Tempo       http://localhost:3200"
	@echo "  OTLP        http://localhost:4318  ← backend/.env OTEL_EXPORTER_OTLP_ENDPOINT"

obs-down: ## stop the observability stack (keeps data volumes)
	$(OBS) down

obs-logs: ## tail observability logs
	$(OBS) logs -f --tail=100

obs-reload: ## reload Prometheus rules/config without restart
	curl -fsS -X POST http://localhost:9090/-/reload && echo "prometheus reloaded"

# ── apps on the host ──
api: ## run the API on :4000 (watch mode; metrics on :9464)
	cd backend && npm run start:dev

web: ## run the storefront/admin on :3000
	cd frontend && npm run dev

migrate: ## apply prisma migrations to backend/.env DATABASE_URL
	cd backend && npx prisma migrate deploy

db-status: ## show migration status
	cd backend && npx prisma migrate status

seed: ## idempotent seed (reference data + demo catalogue + demo users)
	cd backend && npx prisma db seed

seed-force: ## re-seed and refresh copy/prices/settings from the snapshot
	cd backend && SEED_FORCE=true npx prisma db seed

export-data: ## re-export frontend demo data → backend/prisma/seed/data/*.json
	cd backend && npx ts-node --transpile-only prisma/seed/export-frontend-data.ts

dashboards: ## regenerate Grafana dashboards JSON from ops/grafana/generate-dashboards.js
	node ops/grafana/generate-dashboards.js

# ── quality ──
lint: ## backend lint
	cd backend && npm run lint

typecheck: ## backend + frontend typecheck
	cd backend && npm run typecheck
	cd frontend && npx tsc --noEmit

test: ## backend unit tests
	cd backend && npm test

e2e: ## backend e2e tests (needs a migrated + seeded DATABASE_URL)
	cd backend && npm run test:e2e

check: lint typecheck test e2e ## everything CI runs for the backend

# ── full stack in Docker ──
up: ## full stack in Docker (dev overlay, builds from source) → http://localhost:8080
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")
	$(DEV) up -d --build
	@echo ""
	@echo "  Storefront  http://localhost:8080      Grafana http://localhost:8080/grafana/ (or :3001)"
	@echo "  API         http://localhost:8080/api/v1  Swagger http://localhost:4000/api/docs"
	@echo "  seed once:  make seed-docker"

seed-docker: ## seed the Docker database (demo users included)
	$(DEV) --profile seed run --rm seed

down: ## stop the Docker stack
	$(DEV) down

logs: ## tail Docker stack logs
	$(DEV) logs -f --tail=100 api web nginx

ps: ## Docker stack status
	$(DEV) ps

prod-up: ## production-like stack from GHCR images (uses .env)
	docker compose pull && docker compose up -d

backup: ## pg_dump of the Docker database (ops/backup/pg-backup.sh)
	./ops/backup/pg-backup.sh

local: ## EVERYTHING in Docker with one command (db+migrate+seed+api+web+nginx+otel+prometheus+tempo+grafana) → http://localhost:8080
	$(LOCAL) up --build

local-down: ## stop the one-command local stack (add -v manually to wipe data)
	$(LOCAL) down
