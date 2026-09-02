# Self-Hosted openDAW Roadmap

## Current Baseline

- Fork: `jazzcat007/openDAW`
- Branch: `screwpulp/self-hosted`
- Factory mirror root: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory`
- Available media volume capacity: about 16T free
- Current factory catalog: 902 samples, 7 soundfonts, 49 presets
- Current runtime assets: FFmpeg core, BasicPitch, tempo detection, htdemucs, and htdemucs-jx are mirrored locally
- Current built-in device surface: 9 instruments, 5 MIDI FX, 19 audio FX

## Asset Loading

The quickest path to a richer self-hosted studio is to grow the catalog first, because openDAW already knows how to browse factory samples, soundfonts, and presets from `/factory`.

1. Keep the upstream openDAW factory mirror complete.
   - Run `node scripts/mirror-factory-assets.mjs` after upstream catalog changes.
   - Keep `OPENDAW_FACTORY_OFFLINE_ONLY=true` in production so missing assets fail locally instead of leaking to upstream.

2. Import soundfonts aggressively.
   - Use `npm run import-soundfonts -- <folder> --folder <catalog-name> --license <license> --url <source-url>`.
   - Prioritize permissively licensed SF2 packs: GeneralUser GS, FluidR3-compatible replacements where licensing is clear, orchestral packs, drum kits, GM/GS banks, vintage synth banks, and chiptune/game-style banks.
   - Keep imported entries grouped by source/license so attribution stays auditable.

3. Add curated sample packs.
   - Use `npm run import-samples -- <folder> --folder <catalog-path>`.
   - The importer converts common audio files to the extensionless 48 kHz float WAV format expected by the factory sample loader.
   - Suggested catalog folders: Drums, One-Shots, Loops, Foley, Vocals, Bass, Synth, Guitar, Keys, Impulse Responses.
   - Keep impulse responses in samples so the Convolver device can use them.

4. Add local preset packs.
   - Presets are `.odp` files listed in `presets/index.json`.
   - Create seed projects/racks for common workflows, then export reusable presets into the factory mirror.
   - Suggested first presets: drum bus, vocal chain, mastering chain, lo-fi sampler, ambient send, guitar cab convolver, clean piano, orchestral sketch, synth bass, sidechain-style pump.

5. Treat extra FX as product work.
   - Existing native FX are compiled devices, not just catalog entries.
   - Short-term: ship more presets and IRs for existing FX.
   - Medium-term: make Tone3000/NAM asset handling local-first.
   - Long-term: add new DSP devices through the existing box/adapter/core-wasm pattern.

## Design Overhaul

Direction: retro-future synthwave, under the working brand `ScrewPulp DAW`.

The current UI is a dense production tool, so the redesign should preserve speed and scanability rather than turning it into a landing page.

1. Create a brand layer.
   - Rename visible openDAW touchpoints where legally appropriate.
   - Add a custom app mark, favicon, loading screen, document title, and footer identity.
   - Define brand tokens in one place before changing component-level Sass.

2. Rework the palette.
   - Keep a deep violet/ink studio surface.
   - Use neon cyan for primary selections/actions, magenta for secondary creative emphasis, amber/yellow for signal and transport cues, mint for positive/live states, and red-pink for destructive/error states.
   - Maintain high contrast for timeline, piano roll, meters, and device controls.

3. Improve the first-run/default experience.
   - Custom synthwave demo project and templates.
   - Preloaded starter racks.
   - Better empty states in Browser, Devices, and Projects.

4. Phase the UI work.
   - Phase 1: global tokens, favicon/title/footer, loading screen.
   - Phase 2: browser/device panel polish.
   - Phase 3: timeline and mixer refinements.
   - Phase 4: custom templates and bundled demo content.

## Authentication And Security

1. Protect the app at the edge.
   - Preferred production setup: HTTPS reverse proxy with Basic Auth, OAuth proxy, or Authelia/Authentik.
   - Keep WebSocket paths `/live/*` and `/live/signaling` behind the same auth boundary.

2. Keep app-level fallback auth.
   - `docker-server.mjs` supports optional Basic Auth when `OPENDAW_AUTH_USERNAME` and `OPENDAW_AUTH_PASSWORD` are set.
   - This covers static files, factory assets, and WebSocket upgrades.

3. Harden the container.
   - Move secrets to `.env` or Docker secrets.
   - Run the node server as a non-root user.
   - Add healthcheck and resource limits.
   - Keep factory/project/room volumes separate.

4. Reduce external dependencies.
   - Keep telemetry/reporting disabled.
   - Keep model, FFmpeg, sample, soundfont, and preset URLs local.
   - Audit any remaining `https://api.opendaw.studio`, `assets.opendaw.studio`, `package.opendaw.studio`, `discord.com`, `github.com`, and `npmjs.org` runtime fetches before public exposure.

## Server-First Collaboration Model

The product model is split into two clear modes:

- `Projects` are asynchronous, durable workspaces. They should be listed from the server, saved to the server by default, and available for friends to open later based on membership permissions.
- `Live Rooms` are synchronous collaboration sessions. They should open from a Project, persist live Yjs state on the server, and periodically snapshot back into the Project history.

Current state:

- Live Room documents are already persisted under `/data/rooms`.
- `/api/projects` now serves a server-backed Projects API (list, create, load, save, duplicate, archive/delete, restore, export, revision snapshots) storing data under `/data/projects/v1`.
- The client Project browser, save/save-as flow, and project load now write to and read from the server API first; browser OPFS is written alongside as a cache/recovery copy and is only used as a fallback when the server is unavailable.
- Personal samples, soundfonts, presets, scripts, and templates still use browser OPFS unless they are part of the factory catalog.

Target server data areas:

- `/data/server`: instance settings, users, roles, invites, sessions, admin metadata, and audit logs.
- `/data/projects`: project bundles, metadata, cover images, snapshots, project membership, and trash/archive state.
- `/data/rooms`: persisted Live Room Yjs state, room metadata, active-room records, and room-to-project links.
- `/data/factory`: shared samples, soundfonts, presets, templates, models, and runtime assets.

Implementation phases:

1. Add server control foundation. **(done)**
   - Persist instance settings in `/data/server/settings.json`.
   - Expose authenticated `/api/server-info` and `/api/admin/settings` for future UI wiring.
   - Keep Basic Auth as the deployment gate until app-level sessions are ready.

2. Make Projects server-backed. **(done)**
   - Add project API endpoints for list, create, load, save, duplicate, archive, delete, and export.
   - Store the project file, metadata, cover image, and revision snapshots under `/data/projects`.
   - Change the client Project browser and save flow so server storage is the default and OPFS becomes cache/recovery only.

3. Connect Live Rooms to Projects.
   - Create Live Rooms from a Project, not as anonymous-only documents.
   - Store room metadata including project id, owner, members, created time, last activity, and current snapshot revision.
   - Add autosnapshot from Live Room Yjs state back to the linked Project.

4. Add app-level authentication.
   - Replace shared Basic Auth with individual users.
   - Use password hashing, signed secure cookies, CSRF protection for mutating routes, and login rate limits.
   - Keep reverse-proxy auth optional as an extra outer layer.

5. Build the Admin section.
   - Users: create users, reset passwords, disable users, assign roles.
   - Invites: one-time invite links for friends.
   - Projects: ownership, membership, archive/trash, storage usage, export/backup.
   - Live Rooms: active rooms, participants, stale-room cleanup, force snapshot, close room.
   - Assets: import queue, sample/soundfont/preset catalogs, license/source metadata.
   - Settings: site name, registration policy, default project visibility, storage quotas, factory offline mode, backup target, retention policy.
   - Audit: login events, admin changes, destructive project actions, import jobs.

6. Harden storage and recovery.
   - Atomic writes for project snapshots and admin JSON.
   - Scheduled backups of `/data/server`, `/data/projects`, `/data/rooms`, and `/data/factory`.
   - Per-project export bundles so no work is locked into the server.
   - Recovery path for browser OPFS drafts that have not synced yet.

## Immediate Next Steps

1. ~~Wire the client Project browser to server project list/load/save APIs.~~ **(done)**
2. Add the Admin shell and route guarded by the existing auth boundary.
3. Add individual user/session auth behind the Admin shell.
4. Link Live Rooms to server Projects and autosnapshot them.
5. Build an asset intake folder structure on the media volume.
6. Import the first large sample and SF2 batches.
7. Create ten starter presets/racks.
8. Continue the retro-future synthwave UI pass.
