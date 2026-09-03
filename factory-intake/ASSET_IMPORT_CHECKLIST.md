# Asset Import Checklist for Starter Presets

These four starter presets reference external assets. Import the assets first, then copy the presets to `/data/factory/presets`.

## Assets needed

### Soundfonts

1. **GeneralUser GS v2.0.3.sf2**
   - UUID: `9575028c-7a1f-489f-9770-fccc8cff2734`
   - Used by: Clean Piano preset
   - Source: https://github.com/GalleryOfBots/GeneralUser-GS
   - License: GPL-3.0
   - Import command:
     ```bash
     node scripts/import-soundfonts.mjs factory-intake/soundfonts/GeneralUser-GS --folder "GeneralUser" --license "GPL-3.0" --url "https://github.com/GalleryOfBots/GeneralUser-GS"
     ```

2. **FreePats GM Orchestral**
   - UUID: `f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b`
   - Used by: Orchestral Sketch (Harp) preset
   - Source: https://github.com/free-pats/FreePats
   - License: GPL-3.0
   - Import command:
     ```bash
     node scripts/import-soundfonts.mjs factory-intake/soundfonts/FreePats-GM-Orchestral --folder "FreePats" --license "GPL-3.0" --url "https://github.com/free-pats/FreePats"
     ```

### Samples

3. **Guitar Cab IR**
   - File: `AK-SPKRS_ModUk_001.wav`
   - UUID: `f51ed198-f47a-4253-b765-888e0c8d16e6`
   - Used by: Guitar Cab Convolver preset
   - Source: AdventureKid AKRT Speakers — Modern UK
   - License: CC0 / permissive
   - Import command:
     ```bash
     node scripts/import-samples.mjs factory-intake/samples/Impulse-Responses --root /data/factory --folder "Impulse Responses/AdventureKid"
     ```

4. **Piano one-shot**
   - File: `Piano.mf.C4.aiff` (or .wav)
   - UUID: `0ab1a85f-1d07-4a24-8418-ab5a6b6e3490`
   - Used by: Lo-Fi Sampler preset
   - Source: UIowa MIS Steinway Piano
   - License: CC-BY / permissive
   - Note: ~31s sustained note. Consider trimming to a one-shot before import.
   - Import command:
     ```bash
     node scripts/import-samples.mjs factory-intake/samples/Keys --root /data/factory --folder "Keys/UIowa"
     ```

## Import order
1. Place files in `factory-intake/soundfonts/` and `factory-intake/samples/`
2. Run soundfont imports first
3. Run sample imports
4. Verify `soundfonts/index.json` and `samples/index.json` contain the UUIDs above
5. Copy `factory-intake/presets/` to `/data/factory/presets/`
6. Restart or reload factory catalog

## Verification
```bash
grep 9575028c-7a1f-489f-9770-fccc8cff2734 /data/factory/soundfonts/index.json
grep f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b /data/factory/soundfonts/index.json
grep f51ed198-f47a-4253-b765-888e0c8d16e6 /data/factory/samples/index.json
grep 0ab1a85f-1d07-4a24-8418-ab5a6b6e3490 /data/factory/samples/index.json
```

If any grep fails, the preset will be inert until the asset is imported.
