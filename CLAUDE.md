# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent npm packages, each with its own `package.json` and lockfile (no workspace tooling):

- `gpx/`: TypeScript library for parsing, manipulating and computing statistics on GPX files. It compiles with `tsc` to `gpx/dist/`.
- `website/`: SvelteKit (Svelte 5) app for gpx.studio. It is prerendered as a static site (`adapter-static`) and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

`website` depends on `gpx` via `"gpx": "file:../gpx"` and imports the **built** `dist/` output. After changing anything in `gpx/src`, run `npm run build` in `gpx/` (or `npx tsc --watch`) or the website will not see the change.

## Commands

```bash
# gpx library (postinstall also runs the build)
cd gpx && npm install && npm run build

# website (needs PUBLIC_MAPTILER_KEY in website/.env; see .env.example)
cd website && npm install
npm run dev        # vite dev server
npm run build      # prebuild: PWA manifests, vite build, postbuild: sitemap → website/build/
npm run preview
npm run check      # svelte-kit sync + svelte-check (type checking)
npm run lint       # prettier --check + eslint
npm run format     # prettier --write
npm run local-styles  # generate static/local-styles (basemap styles not depending on gpx.studio servers)
```

Neither package has a test suite. `gpx/test-data/*.gpx` holds sample files for manual testing. Use `npm run check` and `npm run lint` in `website/` for verification.

Formatting follows the root `.prettierrc`: 4-space indent, single quotes, `es5` trailing commas, 100-char width.

## Architecture

### gpx library

`gpx/src/gpx.ts` defines a tree: `GPXFile → Track → TrackSegment → TrackPoint`, plus `Waypoint`s. Every class is `[immerable]`, so instances are edited inside Immer drafts. Methods listed under `// Producers` (`replaceTrackSegments`, `crop`, `reverse`, `changeTimestamps`, `setStyle`, …) mutate `this` and are meant to be called on a draft. Some of them use `getOriginal(this)` to read the pre-draft state. Arbitrary app-side metadata (for example the file `id`) is stored in `_data`. `io.ts` (`parseGPX` / `buildGPX`) handles XML through fast-xml-parser. `statistics.ts` computes `GPXStatistics` and `simplify.ts` implements point reduction.

### Website state flow (`website/src/lib/logic/`)

IndexedDB through Dexie (`lib/db.ts`) is the source of truth for open files, undo history and settings. Files persist across reloads.

- **Mutations** go through `fileActionManager` (`file-action-manager.ts`). Its methods `applyToFile`, `applyToFiles`, `applyGlobal` and `applyEachToFilesAndGlobal` run Immer's `produceWithPatches` over the `Map<fileId, GPXFile>`. They store the patch and its inverse in `db.patches` for undo/redo (capped at 100), write the changed files to `db.files` and `db.fileids`, and update the selection. Higher-level operations live in the `fileActions` object in `file-actions.ts`. Add new editing operations there rather than writing to the DB directly.
- **Reading**: `fileStateCollection` (`file-state.ts`) uses Dexie `liveQuery` to watch `db.fileids` and `db.files`. For each file it rebuilds a `GPXFile` plus a `GPXStatisticsTree`, exposed as Svelte stores. Data flows one way: action → DB → liveQuery → stores → UI and map layers.
- **Selection** (`selection.ts`, `selection-tree.ts`) is a tree of `ListItem`s (file / track / segment / waypoint) defined in `components/file-list/file-list.ts`. Most tools act on the current selection.
- **Settings** (`settings.ts`) are `Setting<V>` stores, each backed by a key in `db.settings`.
- The logic layer uses `svelte/store` writables. Components use Svelte 5 runes and subscribe to these stores.

### Website UI

- Routes sit under `src/routes/[[language]]/` (optional language prefix): `/` for the landing page, `/app` for the editor, `/embed` for the embeddable map, and `/help/[...guide]` for the docs. `hooks.server.js` injects per-language `<title>`, meta and `hreflang` tags at prerender time.
- Map: `components/map/map.ts` exports a `map` singleton wrapping MapLibre GL. `gpx-layer/` renders files on the map. `layer-control/` handles basemaps, overlays and Overpass POI layers. Layer and style definitions are in `lib/assets/layers.ts`.
- Toolbar tools are listed in the `Tool` enum in `components/toolbar/tools.ts` (active tool: the `currentTool` store), with implementations in `components/toolbar/tools/`. Routing (GraphHopper-based) is the most complex tool.
- UI primitives in `components/ui/` are generated with shadcn-svelte (`components.json`) and styled with Tailwind v4.

### External services

The gpx.studio servers (`styles.`, `tiles.`, `sprites.`, `fonts.`, `overpass.` and `graphhopper.gpx.studio`) only send CORS headers for `https://gpx.studio`, so from any other origin (localhost, self-hosting) the basemaps, elevation, POIs and routing fail. `lib/services.ts` centralizes these URLs and lets `PUBLIC_*` variables in `.env` override them (see `.env.example`). The defaults are unchanged. For local use:
- `PUBLIC_STYLES_URL=/local-styles` serves styles generated by `npm run local-styles`, rewritten to OpenFreeMap tiles/fonts/sprites and Mapterhorn hillshading, without contour lines.
- `PUBLIC_ELEVATION_TILES_URL=https://tiles.mapterhorn.com` serves the same data that gpx.studio mirrors.
- `PUBLIC_GRAPHHOPPER_URL` points to a self-hosted GraphHopper built from [gpxstudio/graphhopper-config](https://github.com/gpxstudio/graphhopper-config). The profiles and custom models must match `routingProfiles` in `toolbar/tools/routing/routing.ts`.

Do not add new hardcoded `*.gpx.studio` service URLs. Go through `services.ts` instead.

### i18n and docs

- UI strings: `website/src/locales/<lang>.json`, loaded dynamically by `lib/i18n.svelte.ts` and used as `i18n._('dotted.key')`. `lib/languages.ts` lists the languages offered in the UI.
- Help docs: MDsveX `.mdx` files in `website/src/lib/docs/<lang>/`. The guide tree (and its order) is declared in `guides` in `components/docs/docs.ts`.
- Translations are managed on Crowdin (`crowdin.yml`). Only edit `en.json` and `docs/en/**`. Files for other languages are synced automatically ("New Crowdin updates" commits).
