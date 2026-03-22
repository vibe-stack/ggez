# create-ggez

Project bootstrap CLI for GGEZ and Web Hammer apps.

## What It Does

`create-ggez` is now intended to behave like a real framework entrypoint rather than a raw template copier.

It handles:

- interactive project setup when no arguments are provided
- package-manager detection from the invoking toolchain
- package name validation
- safe handling for non-empty directories
- optional dependency installation
- optional git repository initialization
- template-driven scaffolding with room for additional starters

## Usage

```bash
bunx create-ggez
```

```bash
bunx create-ggez my-game
```

```bash
npm create ggez@latest my-game -- --package-manager npm
```

```bash
pnpm create ggez my-game --template vanilla-three --no-install
```

## Options

```text
create-ggez [project-dir] [options]

Options:
	-h, --help
	-v, --version
	-y, --yes
			--name <package-name>
			--template <template>
			--package-manager <bun|npm|pnpm|yarn>
			--install / --no-install
			--git / --no-git
			--force
```

## Current Template

### `vanilla-three`

Vite + TypeScript + Three.js + Web Hammer runtime starter.

The generated starter currently targets the vanilla Three.js runtime workflow, but the CLI is structured around a template registry so additional framework starters can be added cleanly.