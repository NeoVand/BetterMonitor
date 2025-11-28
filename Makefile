# Better Monitor - Makefile
# ===========================

.PHONY: help install dev build start pack dist clean lint typecheck rebuild

# Default target
help:
	@echo ""
	@echo "Better Monitor - Available Commands"
	@echo "===================================="
	@echo ""
	@echo "  make install     Install all dependencies"
	@echo "  make dev         Start development server (hot reload)"
	@echo "  make build       Build for production"
	@echo "  make start       Run production build locally"
	@echo "  make pack        Package as macOS .app (for testing)"
	@echo "  make dist        Create distributable DMG/ZIP"
	@echo "  make clean       Remove build artifacts"
	@echo "  make lint        Run ESLint"
	@echo "  make typecheck   Run TypeScript type checking"
	@echo "  make rebuild     Clean and rebuild everything"
	@echo ""

# Install dependencies and rebuild native modules for Electron
install:
	npm install
	npm run postinstall

# Start development server with hot reload
dev:
	npm run dev

# Build for production (Next.js + Electron)
build:
	npm run build

# Run the production build locally
start:
	npm start

# Package as macOS .app bundle (unpacked, for testing)
pack:
	npm run pack

# Create distributable DMG and ZIP
dist:
	npm run dist:mac

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf renderer/dist/
	rm -rf release/
	rm -rf node_modules/.cache/
	rm -rf .next/

# Run ESLint
lint:
	npm run lint

# TypeScript type checking (no emit)
typecheck:
	npx tsc --noEmit -p electron/tsconfig.json
	npx tsc --noEmit -p renderer/tsconfig.json

# Full rebuild from clean state
rebuild: clean build

# Development helpers
# -------------------

# Rebuild native modules for Electron
rebuild-native:
	npx electron-builder install-app-deps

# Watch TypeScript compilation for Electron main process
watch-electron:
	npx tsc -p electron --watch

# Build only Next.js
build-next:
	npm run build:next

# Build only Electron
build-electron:
	npm run build:electron

