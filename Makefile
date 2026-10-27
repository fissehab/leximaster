# LexiMaster tasks. `make help` lists them.
PY       ?= .venv/bin/python
PORT     ?= 8765
DB       ?= data/leximaster.db
BACKUP_DIR ?= backups
STAMP    := $(shell date +%Y-%m-%d)

.PHONY: help setup run test audit site parity backup check-js

help:
	@grep -E "^[a-z-]+:.*## " $(MAKEFILE_LIST) | sed -E "s/:.*## /\t/"

setup: ## Create .venv and install app + tool dependencies
	./setup.sh

run: ## Start the app on localhost:$(PORT)
	.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $(PORT) --log-level warning

test: ## Run the test suite (uses a temp database, never data/)
	$(PY) -m pytest

check-js: ## Syntax-check the front-end JavaScript (needs node)
	@for f in $$(find static/js -name "*.js"); do node --check "$$f" || exit 1; done; echo "js ok"

audit: ## Check data/words.json for content problems
	$(PY) tools/audit.py

site: ## Build the static website into docs/
	$(PY) tools/build_site.py

parity: ## Compare the website with the local app (run `make site` first)
	$(PY) tools/parity.py

backup: ## Snapshot the progress database and data/cache into $(BACKUP_DIR)/
	mkdir -p "$(BACKUP_DIR)"
	sqlite3 "$(DB)" ".backup '$(BACKUP_DIR)/leximaster-$(STAMP).db'"
	tar -czf "$(BACKUP_DIR)/cache-$(STAMP).tar.gz" -C data cache
	@echo "Backed up to $(BACKUP_DIR)/ ($(STAMP))"
