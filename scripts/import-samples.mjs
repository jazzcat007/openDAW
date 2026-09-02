#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs"
import {basename, extname, join} from "node:path"
import {tmpdir} from "node:os"
import {createHash} from "node:crypto"
import {execFileSync} from "node:child_process"

const DEFAULT_ROOT = "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"
const AUDIO_EXTENSIONS = new Set([".wav", ".wave", ".aif", ".aiff", ".flac", ".mp3", ".m4a", ".ogg", ".opus"])

const usage = `Usage:
  node scripts/import-samples.mjs <file-or-folder> [more-files-or-folders...]

Options:
  --root <path>          Factory root. Defaults to this install's appdata/opendaw/factory.
  --folder <path>        Catalog folder path, separated by "/". Defaults to "Imported/Samples".
  --bpm <number>         BPM to assign when one is not found in the filename. Defaults to 120.
  --sample-rate <number> Output WAV sample rate. Defaults to 48000.
  --dry-run              Print planned changes without converting/copying files or writing index.json.
  --replace              Replace existing files/catalog metadata with matching UUIDs.
  --help                 Show this help.
`

const parseArgs = (argv) => {
  const args = {paths: []}
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) {
      args.paths.push(token)
      continue
    }
    const key = token.slice(2)
    if (key === "help" || key === "dry-run" || key === "replace") {
      args[key] = true
      continue
    }
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`)
    }
    args[key] = next
    i++
  }
  return args
}

const readCatalog = (path) => {
  if (!existsSync(path)) {
    return {version: 1, updatedAt: new Date(0).toISOString(), folders: []}
  }
  return JSON.parse(readFileSync(path, "utf8"))
}

const collectEntries = (folder, entries = new Map()) => {
  folder.samples?.forEach(entry => entries.set(entry.uuid, entry))
  folder.folders?.forEach(child => collectEntries(child, entries))
  return entries
}

const collectCatalogEntries = (catalog) => {
  const entries = new Map()
  catalog.folders.forEach(folder => collectEntries(folder, entries))
  return entries
}

const findOrCreateFolder = (catalog, path) => {
  const parts = path.split("/").map(part => part.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error("Folder path cannot be empty")
  let folders = catalog.folders
  let folder
  for (const name of parts) {
    folder = folders.find(candidate => candidate.name === name)
    if (!folder) {
      folder = {name, folders: [], samples: []}
      folders.push(folder)
    }
    folder.folders ??= []
    folder.samples ??= []
    folders = folder.folders
  }
  return folder
}

const walk = (path, files = []) => {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    readdirSync(path, {withFileTypes: true})
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(entry => walk(join(path, entry.name), files))
  } else if (stat.isFile() && AUDIO_EXTENSIONS.has(extname(path).toLowerCase())) {
    files.push(path)
  }
  return files
}

const uuidFromBytes = (bytes) => {
  const buffer = Buffer.from(bytes.subarray(0, 16))
  buffer[6] = (buffer[6] & 0x0f) | 0x40
  buffer[8] = (buffer[8] & 0x3f) | 0x80
  const hex = buffer.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const contentUuid = (buffer) => uuidFromBytes(createHash("sha256").update(buffer).digest())

const fallbackName = (path) => basename(path, extname(path)).replace(/[-_]+/g, " ").trim()

const parseBpm = (path, fallback) => {
  const match = basename(path).match(/(?:^|[^0-9])([1-2]?[0-9]{2})(?:\s?bpm|BPM)(?:[^0-9]|$)/)
  return match ? Number(match[1]) : fallback
}

const ffprobe = (path) => {
  const stdout = execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=sample_rate:format=duration",
    "-of", "json",
    path
  ], {encoding: "utf8"})
  const data = JSON.parse(stdout)
  const stream = data.streams?.[0]
  return {
    duration: Number(data.format?.duration ?? 0),
    sampleRate: Number(stream?.sample_rate ?? 0)
  }
}

const convert = (source, target, sampleRate) => {
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", source,
    "-map", "0:a:0",
    "-vn",
    "-ar", String(sampleRate),
    "-acodec", "pcm_f32le",
    target
  ], {stdio: ["ignore", "pipe", "pipe"]})
}

const main = () => {
  const args = parseArgs(process.argv)
  if (args.help) {
    process.stdout.write(usage)
    return
  }
  if (args.paths.length === 0) {
    process.stderr.write(usage)
    process.exit(2)
  }

  const root = args.root ?? process.env.FACTORY_MIRROR_ROOT ?? DEFAULT_ROOT
  const sampleRoot = join(root, "samples")
  const indexPath = join(sampleRoot, "index.json")
  const folderPath = args.folder ?? "Imported/Samples"
  const defaultBpm = Number(args.bpm ?? 120)
  const sampleRate = Number(args["sample-rate"] ?? 48_000)
  const dryRun = args["dry-run"] === true
  const replace = args.replace === true

  const files = args.paths.flatMap(path => walk(path))
  if (files.length === 0) {
    console.log("No supported audio files found.")
    return
  }

  const catalog = readCatalog(indexPath)
  catalog.version = 1
  catalog.folders ??= []
  const existing = collectCatalogEntries(catalog)
  const targetFolder = findOrCreateFolder(catalog, folderPath)
  const tempRoot = mkdtempSync(join(tmpdir(), "opendaw-samples-"))
  let added = 0
  let updated = 0
  let skipped = 0
  let copied = 0

  try {
    for (const file of files) {
      const converted = join(tempRoot, `${createHash("sha1").update(file).digest("hex")}.wav`)
      convert(file, converted, sampleRate)
      const metadata = ffprobe(converted)
      const buffer = readFileSync(converted)
      const uuid = contentUuid(buffer)
      const entry = {
        uuid,
        name: fallbackName(file),
        bpm: parseBpm(file, defaultBpm),
        duration: metadata.duration,
        sample_rate: sampleRate
      }
      const target = join(sampleRoot, uuid)
      const existingEntry = existing.get(uuid)
      if (existingEntry && !replace) {
        console.log(`skip     ${entry.name} (${uuid}) already exists`)
        skipped++
        continue
      }
      if (existingEntry) {
        Object.assign(existingEntry, entry)
        console.log(`update   ${entry.name} (${uuid})`)
        updated++
      } else {
        targetFolder.samples.push(entry)
        existing.set(uuid, entry)
        console.log(`add      ${entry.name} (${uuid})`)
        added++
      }
      if (!dryRun && (replace || !existsSync(target))) {
        mkdirSync(sampleRoot, {recursive: true})
        copyFileSync(converted, target)
        copied++
      }
    }

    targetFolder.samples.sort((a, b) => a.name.localeCompare(b.name))
    catalog.updatedAt = new Date().toISOString()

    if (!dryRun) {
      mkdirSync(sampleRoot, {recursive: true})
      const tmp = `${indexPath}.tmp`
      writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`)
      renameSync(tmp, indexPath)
    }
  } finally {
    rmSync(tempRoot, {recursive: true, force: true})
  }

  console.log(`${dryRun ? "Dry run" : "Import"} complete: added=${added}, updated=${updated}, skipped=${skipped}, copied=${copied}`)
}

main()
