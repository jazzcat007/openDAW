# First Sample / SoundFont Import Plan

## Goal
Ship value with zero code risk by populating the self-hosted factory with a small, permissively licensed starter catalog.

## Steps

1. Create local intake folders
   - `factory-intake/samples/` – place source audio here
   - `factory-intake/soundfonts/` – place .sf2 files here

2. Choose permissive sources
   - Samples: GeneralUser GS drum kit, CC0 one-shots from freesound.org, own recordings
   - Soundfonts: GeneralUser GS (GPL), FluidR3 GM (LGPL), or other clearly licensed packs

3. Import
   ```bash
   # samples
   node scripts/import-samples.mjs factory-intake/samples --root /data/factory --folder "Drums/GeneralUser"
   
   # soundfonts
   node scripts/import-soundfonts.mjs factory-intake/soundfonts --folder "GeneralUser" --license "GPL-3.0" --url "https://example.com"
   ```

4. Verify
   - `samples/index.json` and `soundfonts/index.json` updated
   - `npm run import-demos` still works offline

## Notes
Keep `OPENDAW_FACTORY_OFFLINE_ONLY=true`. All imports should be done on a machine with upstream access, then copied to the mounted factory volume.
