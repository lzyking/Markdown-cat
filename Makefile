.PHONY: all dev build tauri-dev tauri-build clean

all: build

dev:
	npm run dev

build:
	npm run build

tauri-dev:
	npm run tauri:dev

tauri-build:
	npm run tauri:build

clean:
	rm -rf dist node_modules src-tauri/target
