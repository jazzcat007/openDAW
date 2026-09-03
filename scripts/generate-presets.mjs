#!/usr/bin/env node
import {mkdirSync, writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {Option, UUID} from "@opendaw/lib-std"
import {
    CaptureAudioBox, CaptureMidiBox,
    CompressorDeviceBox, GateDeviceBox, MaximizerDeviceBox, CrusherDeviceBox,
    DattorroReverbDeviceBox, DelayDeviceBox, ConvolverDeviceBox, RevampDeviceBox,
    VaporisateurDeviceBox, SoundfontDeviceBox, SoundfontFileBox, NanoDeviceBox, AudioFileBox
} from "@opendaw/studio-boxes"
import {AudioUnitType, VoicingMode} from "@opendaw/studio-enums"
import {ClassicWaveform} from "@opendaw/lib-dsp"
import {ProjectSkeleton, AudioUnitFactory, PresetEncoder, PresetHeader} from "@opendaw/studio-adapters"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = join(__dirname, "..", "factory-staging", "intake")

const usage = `Usage:
  node scripts/generate-presets.mjs

Options:
  --root <path>   Intake root. Defaults to factory-staging/intake next to this repo.
  --dry-run       Build presets in memory and report them without writing files.
  --help          Show this help.
`

const parseArgs = (argv) => {
    const args = {}
    for (let i = 2; i < argv.length; i++) {
        const token = argv[i]
        if (!token.startsWith("--")) continue
        const key = token.slice(2)
        if (key === "help" || key === "dry-run") {args[key] = true; continue}
        const next = argv[i + 1]
        if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`)
        args[key] = next
        i++
    }
    return args
}

// Content-hash UUIDs scripts/import-soundfonts.mjs / import-samples.mjs will assign these staged files; inert until imported.
const ASSETS = {
    generalUserGS: {uuid: UUID.parse("9575028c-7a1f-489f-9770-fccc8cff2734"), name: "GeneralUser GS v2.0.3"},
    freePatsOrchestral: {uuid: UUID.parse("f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b"), name: "FreePats GM Orchestral"},
    guitarCabIR: {uuid: UUID.parse("f51ed198-f47a-4253-b765-888e0c8d16e6"), name: "AK-SPKRS ModUk 001", durationSeconds: 0.219313},
    pianoOneShot: {uuid: UUID.parse("0ab1a85f-1d07-4a24-8418-ab5a6b6e3490"), name: "Piano mf C4", durationSeconds: 30.912438}
}

const newChainSource = () => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const capture = CaptureAudioBox.create(boxGraph, UUID.generate())
    const unit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.wrap(capture))
    return {boxGraph, unit}
}

const newInstrumentSource = () => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const capture = CaptureMidiBox.create(boxGraph, UUID.generate())
    const unit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.wrap(capture))
    return {boxGraph, unit}
}

const attachEffect = (unit, index) => (box) => {box.host.refer(unit.audioEffects); box.index.setValue(index)}

const encodeChain = (boxGraph, effects) => {
    boxGraph.endTransaction()
    return PresetEncoder.encodeEffects(effects, PresetHeader.ChainKind.Audio)
}

const encodeInstrument = (unit, boxGraph) => {
    boxGraph.endTransaction()
    return PresetEncoder.encode(unit, {includeTimeline: false})
}

const useAudioFile = (boxGraph, {uuid, name, durationSeconds}) =>
    boxGraph.findBox(uuid).unwrapOrElse(() => AudioFileBox.create(boxGraph, uuid, box => {
        box.fileName.setValue(name)
        box.endInSeconds.setValue(durationSeconds)
    }))

const useSoundfontFile = (boxGraph, {uuid, name}) =>
    boxGraph.findBox(uuid).unwrapOrElse(() => SoundfontFileBox.create(boxGraph, uuid, box => box.fileName.setValue(name)))

const buildDrumBus = () => {
    const {boxGraph, unit} = newChainSource()
    const compressor = CompressorDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 0))
    const crusher = CrusherDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 1))
    return encodeChain(boxGraph, [compressor, crusher])
}

const buildVocalChain = () => {
    const {boxGraph, unit} = newChainSource()
    const gate = GateDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 0))
    const revamp = RevampDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 1))
    const compressor = CompressorDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 2))
    return encodeChain(boxGraph, [gate, revamp, compressor])
}

const buildMasteringChain = () => {
    const {boxGraph, unit} = newChainSource()
    const revamp = RevampDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 0))
    const maximizer = MaximizerDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 1))
    return encodeChain(boxGraph, [revamp, maximizer])
}

const buildAmbientSend = () => {
    const {boxGraph, unit} = newChainSource()
    const reverb = DattorroReverbDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 0))
    const delay = DelayDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 1))
    return encodeChain(boxGraph, [reverb, delay])
}

const buildGuitarCabConvolver = () => {
    const {boxGraph, unit} = newChainSource()
    const audioFile = useAudioFile(boxGraph, ASSETS.guitarCabIR)
    const convolver = ConvolverDeviceBox.create(boxGraph, UUID.generate(), box => {
        attachEffect(unit, 0)(box)
        box.file.refer(audioFile)
    })
    return encodeChain(boxGraph, [convolver])
}

const buildLoFiSampler = () => {
    const {boxGraph, unit} = newInstrumentSource()
    const audioFile = useAudioFile(boxGraph, ASSETS.pianoOneShot)
    NanoDeviceBox.create(boxGraph, UUID.generate(), box => {
        box.host.refer(unit.input)
        box.file.refer(audioFile)
    })
    CrusherDeviceBox.create(boxGraph, UUID.generate(), attachEffect(unit, 0))
    RevampDeviceBox.create(boxGraph, UUID.generate(), box => {
        attachEffect(unit, 1)(box)
        box.lowPass.enabled.setValue(true)
        box.lowPass.frequency.setValue(3500.0)
    })
    return encodeInstrument(unit, boxGraph)
}

const buildCleanPiano = () => {
    const {boxGraph, unit} = newInstrumentSource()
    const soundfontFile = useSoundfontFile(boxGraph, ASSETS.generalUserGS)
    SoundfontDeviceBox.create(boxGraph, UUID.generate(), box => {
        box.host.refer(unit.input)
        box.file.refer(soundfontFile)
        box.presetIndex.setValue(0)
    })
    return encodeInstrument(unit, boxGraph)
}

const buildOrchestralHarp = () => {
    const {boxGraph, unit} = newInstrumentSource()
    const soundfontFile = useSoundfontFile(boxGraph, ASSETS.freePatsOrchestral)
    SoundfontDeviceBox.create(boxGraph, UUID.generate(), box => {
        box.host.refer(unit.input)
        box.file.refer(soundfontFile)
        box.presetIndex.setValue(20)
    })
    return encodeInstrument(unit, boxGraph)
}

const buildSynthBass = () => {
    const {boxGraph, unit} = newInstrumentSource()
    VaporisateurDeviceBox.create(boxGraph, UUID.generate(), box => {
        box.host.refer(unit.input)
        box.cutoff.setValue(700.0)
        box.resonance.setValue(0.15)
        box.attack.setValue(0.005)
        box.decay.setValue(0.15)
        box.sustain.setValue(0.4)
        box.release.setValue(0.15)
        box.filterEnvelope.setValue(0.3)
        box.voicingMode.setValue(VoicingMode.Monophonic)
        box.unisonCount.setValue(1)
        box.oscillators.fields()[0].waveform.setValue(ClassicWaveform.saw)
        box.oscillators.fields()[0].volume.setValue(-6.0)
        box.oscillators.fields()[1].waveform.setValue(ClassicWaveform.square)
        box.oscillators.fields()[1].volume.setValue(-6.0)
        box.oscillators.fields()[1].octave.setValue(-1)
        box.version.setValue(2)
    })
    return encodeInstrument(unit, boxGraph)
}

const now = Date.now()
const presetUuid = () => UUID.toString(UUID.generate())

const CURATED = [
    {
        meta: {uuid: presetUuid(), name: "Drum Bus", category: "audio-effect-chain",
            description: "Compressor into a bit of crunch for a drum bus.", created: now, modified: now},
        build: buildDrumBus
    },
    {
        meta: {uuid: presetUuid(), name: "Vocal Chain", category: "audio-effect-chain",
            description: "Gate, EQ and compression for a lead vocal. No reverb: a true reverb send is bus/mixer routing, which a single effect-chain preset can't express.",
            created: now, modified: now},
        build: buildVocalChain
    },
    {
        meta: {uuid: presetUuid(), name: "Mastering Chain", category: "audio-effect-chain",
            description: "Broad EQ into a brickwall limiter for a master bus.", created: now, modified: now},
        build: buildMasteringChain
    },
    {
        meta: {uuid: presetUuid(), name: "Lo-Fi Sampler", category: "audio-unit", instrument: "Nano",
            description: "A crushed, low-pass-filtered piano one-shot for lo-fi chops.", created: now, modified: now},
        build: buildLoFiSampler
    },
    {
        meta: {uuid: presetUuid(), name: "Ambient Send", category: "audio-effect-chain",
            description: "Dense reverb into delay for ambient washes.", created: now, modified: now},
        build: buildAmbientSend
    },
    {
        meta: {uuid: presetUuid(), name: "Guitar Cab Convolver", category: "audio-effect-chain",
            description: "Convolver pre-wired to a Modern UK cabinet impulse response.", created: now, modified: now},
        build: buildGuitarCabConvolver
    },
    {
        meta: {uuid: presetUuid(), name: "Clean Piano", category: "instrument", device: "Soundfont",
            description: "GeneralUser GS's Grand Piano patch (bank 0, preset index 0).", created: now, modified: now},
        build: buildCleanPiano
    },
    {
        meta: {uuid: presetUuid(), name: "Synth Bass", category: "instrument", device: "Vaporisateur",
            description: "Monophonic saw plus sub-square bass with a short, punchy envelope.", created: now, modified: now},
        build: buildSynthBass
    },
    {
        meta: {uuid: presetUuid(), name: "Orchestral Sketch (Harp)", category: "instrument", device: "Soundfont",
            description: "Scoped down from a full orchestral sketch to a single instrument: FreePats GM Orchestral's Orchestral Harp patch (preset index 20), the most genuinely orchestral melodic voice in that soundfont.",
            created: now, modified: now},
        build: buildOrchestralHarp
    }
]

const SKIPPED = [{
    name: "Sidechain-Style Pump",
    reason: "Compressor and Gate both expose a real side-chain pointer field, but the side-chain source has to be a second track or bus in the project. A single self-contained effect-chain preset has no second track to route from, so faking the pump with just a fast compressor would misrepresent what the preset does."
}]

const main = () => {
    const args = parseArgs(process.argv)
    if (args.help) {
        process.stdout.write(usage)
        return
    }
    const root = args.root ?? DEFAULT_ROOT
    const presetsDir = join(root, "presets")
    const dryRun = args["dry-run"] === true
    const index = []
    for (const {meta, build} of CURATED) {
        const bytes = build()
        console.log(`built     ${meta.name} (${meta.category}) ${meta.uuid} — ${bytes.byteLength} bytes`)
        if (!dryRun) {
            mkdirSync(presetsDir, {recursive: true})
            writeFileSync(join(presetsDir, `${meta.uuid}.odp`), Buffer.from(bytes))
        }
        index.push(meta)
    }
    if (!dryRun) {
        writeFileSync(join(presetsDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`)
    }
    console.log(`${dryRun ? "Dry run" : "Generated"}: ${index.length} presets, skipped: ${SKIPPED.map(s => s.name).join(", ")}`)
}

main()
