.DEFAULT_GOAL := help
COMPOSE := docker compose

help:                ## Show this help
	@grep -hE '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-14s %s\n", $$1, $$2}'

dev:                 ## Bring up the whole stack (postgres + minio + migrate + seed + api + web)
	@test -f .env || cp .env.example .env
	$(COMPOSE) up --build

down:                ## Stop everything, keep volumes
	$(COMPOSE) down

clean:               ## Stop everything and DESTROY the database and object store
	$(COMPOSE) down -v

logs:                ## Tail api logs
	$(COMPOSE) logs -f api

sh:                  ## Shell into the api container
	$(COMPOSE) exec api sh

psql:                ## psql into the database
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-mindspace} -d $${POSTGRES_DB:-mindspace}

migrate:             ## Apply migrations against the running database
	$(COMPOSE) run --rm migrate

revision:            ## Create an Alembic revision:  make revision m="add x"
	$(COMPOSE) run --rm api alembic revision --autogenerate -m "$(m)"

seed:                ## Re-run the idempotent seed
	$(COMPOSE) run --rm seed

test:                ## Run the API test suite
	$(COMPOSE) run --rm api pytest -q

test-web:            ## Run the web + mobile jest suites on the host
	npm test

lint:                ## ruff check + format --check
	$(COMPOSE) run --rm api sh -c "ruff check app tests seeds && ruff format --check app tests seeds"

mobile:              ## Start Expo on the host (not containerised)
	npm run mobile

lan-ip:              ## Print the LAN IP to put in EXPO_PUBLIC_API_URL
	@ip route get 1.1.1.1 2>/dev/null | awk '{print $$7; exit}' || ipconfig getifaddr en0
