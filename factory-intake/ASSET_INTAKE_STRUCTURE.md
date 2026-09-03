# Asset Intake Folder Structure - Created 2026-09-02

Media volume root: `T:\srv\dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76\appdata\opendaw`

## Created structure

```
appdata/opendaw/
  factory/
    demos/
    presets/
    samples/
      Bass/
      Drums/
      Foley/
      Guitar/
      Impulse Responses/
      Keys/
      Loops/
      One-Shots/
      Synth/
      Vocals/
    soundfonts/
  projects/
  rooms/
  server/
```

## Docker volume mappings
From `docker-compose.yml`:
- `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory:/data/factory`
- `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/server:/data/server`
- `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/projects:/data/projects`
- `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/rooms:/data/rooms`

## Current state 2026-09-02
- Presets: 9 .odp files synced, index.json populated
- Samples: 590 files across categories (Bass 25, Drums 29, Foley 27, Guitar 18, Impulse-Responses 66, Keys 19, Loops 29, One-Shots 196, Synth 50, Vocals 131)
- Soundfonts: 6 catalogs, 6 .sf2 files (Famicom-Multichip-Chiptune, FluidR3-GM, FreePats-GM-Orchestral, FreePats-GM-Percussion, GeneralUser-GS, VintageDreamsWaves)

## Next steps
1. Create `index.json` files in samples/soundfonts/presets
2. Run `scripts/sync-factory-to-media.ps1` to sync staged intake
3. Import first sample/SF2 batches
4. Update `docker-server.mjs` defaults to point to new structure if needed
