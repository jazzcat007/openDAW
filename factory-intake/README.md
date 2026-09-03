# Factory Intake Structure

This folder defines the canonical layout for the self-hosted factory mirror.

## Target layout on the media volume

```
/data/factory/
  demos/
    projects.json
    <id>/project.odb
  samples/
    index.json
    Drums/
    One-Shots/
    Loops/
    Foley/
    Vocals/
    Bass/
    Synth/
    Guitar/
    Keys/
    Impulse Responses/
  soundfonts/
    index.json
    <catalog-name>/
  presets/
    index.json
    *.odp
```

## Import commands

```bash
# samples
node scripts/import-samples.mjs <folder> --root /data/factory --folder "Imported/Samples"

# soundfonts
node scripts/import-soundfonts.mjs <folder> --folder <catalog-name> --license <license> --url <source-url>

# demos
npm run import-demos
```

Keep `OPENDAW_FACTORY_OFFLINE_ONLY=true` in production.
