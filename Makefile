# DeepSeek Peak Hours — development helpers.
#
#   make test     logic tests (JavaScript + Python) and the headless smoke tests
#   make install  install and enable the extension
#   make zip      build the distributable extension zip
#   make run      print the current verdict from the terminal

SHELL := /bin/bash
UUID := deepseek-peak@akuma.dev

.PHONY: help test test-js test-py test-smoke install zip run lint clean

help:
	@grep -E '^#   ' Makefile | sed 's/^#   //'

test: test-js test-py test-smoke

test-js:
	@echo "== JavaScript logic =="
	node --test tests/core.test.mjs

test-py:
	@echo "== Python logic (cross-checked against the JavaScript suite) =="
	python3 -m unittest discover -s tests -v

test-smoke:
	@echo "== Headless GNOME Shell smoke tests =="
	TZ=UTC node --import ./smoke/register.mjs smoke/run.mjs
	TZ=UTC node --import ./smoke/register.mjs smoke/prefs.mjs

install:
	./install.sh

zip:
	rm -f $(UUID).zip
	cd extension && zip -qr ../$(UUID).zip . -x 'schemas/gschemas.compiled'
	@echo "built $(UUID).zip"

run:
	./bin/deepseek-peak

lint:
	glib-compile-schemas --strict --dry-run extension/schemas
	bash -n install.sh
	node --experimental-vm-modules --input-type=module -e "import vm from 'node:vm'; import {readFileSync} from 'node:fs'; \
	  for (const f of ['extension/extension.js','extension/prefs.js','extension/lib/core.js','extension/lib/format.js','extension/lib/data.js']) \
	    new vm.SourceTextModule(readFileSync(f,'utf8'), {identifier: f}); \
	  console.log('all extension modules parse');" 2>/dev/null

clean:
	rm -f $(UUID).zip
	rm -f extension/schemas/gschemas.compiled
