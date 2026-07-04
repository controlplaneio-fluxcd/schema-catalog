.PHONY: deps lint test build

deps:
	cd build && bun install

lint:
	cd build && bunx tsc -p tsconfig.json --noEmit

test:
	cd build && bun test

build:
	cd build && bun src/main.ts build
