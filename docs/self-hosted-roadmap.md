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

Direction: retro-future synthwave, under the working brand `Metal-Duck Studios`.

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

4. Add app-level authentication. **(done)**
   - Replace shared Basic Auth with individual users (scrypt password hashing, real `users.json`).
   - Signed secure session cookies (`opendaw_session`, server-side revocable), CSRF header check on mutating routes, and login rate limits.
   - Keep reverse-proxy Basic Auth optional as an extra outer layer (unchanged, still layered in front).
   - Remaining gap: no Admin UI yet, only the API — see phase 5.

5. Build the Admin section.
   - Users: create users, reset passwords, disable users, assign roles. **(done: `/admin` page + `/api/admin/users`)**
   - Invites: one-time invite links for friends. **(done: `/admin` Invites tab + `/api/admin/invites` + `/api/auth/{invite,register}`)**
   - Projects: ownership, membership, archive/trash, storage usage, export/backup.
   - Live Rooms: active rooms, participants, stale-room cleanup, force snapshot, close room.
   - Assets: import queue, sample/soundfont/preset catalogs, license/source metadata.
   - Settings: site name, registration policy, default project visibility, storage quotas, factory offline mode, backup target, retention policy. **(partial: site name editable on `/admin`, rest read-only/TODO)**
   - Audit: login events, admin changes, destructive project actions, import jobs.

6. Harden storage and recovery.
   - Atomic writes for project snapshots and admin JSON.
   - Scheduled backups of `/data/server`, `/data/projects`, `/data/rooms`, and `/data/factory`.
   - Per-project export bundles so no work is locked into the server.
   - Recovery path for browser OPFS drafts that have not synced yet.

## DAW Import/Export

Goal: let people bring projects in from, and take projects out to, the DAWs they already use.

Current state:

- **DAWproject** (the open Bitwig-authored interchange format, `packages/lib/dawproject` + `packages/studio/core/src/dawproject`) is already shipped: `openDAW menu > Export/Import > DAWproject...`. It round-trips tracks, clips, notes, automation, tempo/time signature, audio files, and sends/routing.
- **Standard MIDI files** (`.mid`) already import/export per track, region, and clip (`MidiImport.ts`, `NoteMidiExport.ts`).
- DAWproject itself is only natively supported by a handful of DAWs: Bitwig Studio, PreSonus Studio One, Steinberg Cubase/Nuendo (13+), and Tracktion Waveform, plus community extensions for Reaper/Ardour. **Ableton Live and FL Studio — the two DAWs most likely to be a newcomer's "previous DAW" — support neither DAWproject nor any open project format**, so this path can't reach them regardless of how much DAWproject work is done.
- DAWproject device/FX fidelity is currently asymmetric and incomplete:
  - On import, only the standard `EqualizerSchema` is mapped to a native device (into Revamp); every other foreign plugin or built-in device becomes an "Unknown FX" placeholder box (`DawProjectImporter.ts`, tagged with a ⚠️ comment).
  - On export, every openDAW device is written as an opaque `deviceVendor: "openDAW"` blob that only openDAW itself can decode (`DawProjectExporter.ts`) — a project reopened in Bitwig or Cubase will show unrecognized plugins on every track.
  - Round-tripping openDAW's own devices through DAWproject (openDAW → DAWproject → openDAW) is implemented but currently disabled behind a `TODO`, due to a known bug that produces an invalid host pointer (`DawProjectImporter.ts`).
  - The `lib-dawproject` schema itself only models `EqualizerSchema` as a typed built-in device; the DAWproject spec's other standard device types (compressor, limiter, gate, etc.) aren't represented yet, so there's nothing to map onto even before touching the importer/exporter.

Proposed phases:

1. Fix DAWproject fidelity for openDAW-to-openDAW round trips first.
   - Re-enable and fix the native-device roundtrip path so an openDAW project exported to DAWproject and reimported into openDAW loses nothing (currently every device degrades to Unknown FX).
   - Add regression tests using real files exported from at least one third-party app (Bitwig or Studio One) rather than only self-generated fixtures.

2. Extend `lib-dawproject`'s device schema coverage.
   - Model the DAWproject spec's other standard built-in device types (compressor, limiter, gate) alongside the existing `EqualizerSchema`.
   - Map them to/from the closest native openDAW device, the way `BuiltinDevices.equalizer` already does for EQ.
   - For anything with no native equivalent, keep the Unknown FX fallback but make it visible in the UI (not just a code comment) so users know a plugin didn't transfer.

3. Add Ableton Live (`.als`) import.
   - `.als` is gzipped XML; undocumented but well reverse-engineered by existing open-source parsers.
   - Scope to import-only: track/clip/note/automation structure and audio references. Non-native devices fall back to Unknown FX, same as foreign DAWproject plugins.
   - Writing `.als` is high-risk (undocumented, easy to produce files Live can't open) — not worth attempting.

4. Add FL Studio (`.flp`) import.
   - Proprietary binary format, but has a maintained open-source parser spec (`pyflp`) covering channels, playlist, patterns, and automation.
   - Same import-only scope and Unknown FX fallback as Ableton.

5. Consider Reaper (`.rpp`) as a lower-effort extra.
   - `.rpp` is a human-readable text tree, one of the simpler proprietary formats to parse, and Reaper's user base overlaps with the self-hosted/power-user crowd this fork targets.
   - Could realistically support both import and export given the format's simplicity, unlike Live/FL Studio.

## Immediate Next Steps

1. ~~Wire the client Project browser to server project list/load/save APIs.~~ **(done)**
2. ~~Add individual user/session auth (server-side foundation + login/setup gate).~~ **(done)**
3. ~~Add the Admin shell UI (Users, Invites, Settings) on `/admin`.~~ **(done; Audit tab still open)**
4. ~~Add invite links so friends can self-register instead of an admin calling `/api/admin/users` directly.~~ **(done)**
5. Link Live Rooms to server Projects and autosnapshot them.
6. Build an asset intake folder structure on the media volume.
7. Import the first large sample and SF2 batches.
8. Create ten starter presets/racks.
9. Continue the retro-future synthwave UI pass.
10. Fix the disabled native-device DAWproject roundtrip bug (see DAW Import/Export).
