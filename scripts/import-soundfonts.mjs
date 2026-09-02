#!/usr/bin/env node
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync} from "node:fs"
import {basename, extname, join} from "node:path"
import {createHash} from "node:crypto"

const DEFAULT_ROOT = "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"

const usage = `Usage:
  node scripts/import-soundfonts.mjs <file-or-folder> [more-files-or-folders...]

Options:
  --root <path>       Factory root. Defaults to this install's appdata/opendaw/factory.
  --folder <name>     Catalog folder name for new entries. Defaults to "Imported".
  --url <url>         Source URL/license page to store on entries. Defaults to "local import".
  --license <text>    License text to store when the .sf2 has no copyright metadata.
  --dry-run           Print planned changes without copying files or writing index.json.
  --replace           Replace existing files/catalog metadata with matching UUIDs.
  --help              Show this help.
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
  folder.soundfonts?.forEach(entry => entries.set(entry.uuid, entry))
  folder.folders?.forEach(child => collectEntries(child, entries))
  return entries
}

const collectCatalogEntries = (catalog) => {
  const entries = new Map()
  catalog.folders.forEach(folder => collectEntries(folder, entries))
  return entries
}

const findOrCreateFolder = (catalog, name) => {
  let folder = catalog.folders.find(folder => folder.name === name)
  if (!folder) {
    folder = {name, soundfonts: []}
    catalog.folders.push(folder)
  }
  folder.soundfonts ??= []
  return folder
}

const walk = (path, files = []) => {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    readdirSync(path, {withFileTypes: true})
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(entry => walk(join(path, entry.name), files))
  } else if (stat.isFile() && extname(path).toLowerCase() === ".sf2") {
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

const cleanInfoText = (buffer) => buffer
  .toString("latin1")
  .replace(/\0+$/g, "")
  .trim()

const readSf2Info = (buffer) => {
  if (buffer.byteLength < 12 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "sfbk") {
    throw new Error("Not a valid SoundFont 2 RIFF file")
  }
  const info = {}
  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const id = buffer.toString("ascii", offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + size
    if (end > buffer.byteLength) {break}
    if (id === "LIST" && buffer.toString("ascii", start, start + 4) === "INFO") {
      let childOffset = start + 4
      while (childOffset + 8 <= end) {
        const childId = buffer.toString("ascii", childOffset, childOffset + 4)
        const childSize = buffer.readUInt32LE(childOffset + 4)
        const childStart = childOffset + 8
        const childEnd = childStart + childSize
        if (childEnd > end) {break}
        info[childId] = cleanInfoText(buffer.subarray(childStart, childEnd))
        childOffset = childEnd + (childSize % 2)
      }
    }
    offset = end + (size % 2)
  }
  return info
}

const fallbackName = (path) => basename(path, extname(path)).replace(/[-_]+/g, " ").trim()

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
  const soundfontRoot = join(root, "soundfonts")
  const indexPath = join(soundfontRoot, "index.json")
  const folderName = args.folder ?? "Imported"
  const defaultLicense = args.license ?? "No license provided"
  const defaultUrl = args.url ?? "local import"
  const dryRun = args["dry-run"] === true
  const replace = args.replace === true

  const files = args.paths.flatMap(path => walk(path))
  if (files.length === 0) {
    console.log("No .sf2 files found.")
    return
  }

  const catalog = readCatalog(indexPath)
  catalog.version = 1
  catalog.folders ??= []
  const existing = collectCatalogEntries(catalog)
  const targetFolder = findOrCreateFolder(catalog, folderName)
  let added = 0
  let updated = 0
  let skipped = 0
  let copied = 0

  for (const file of files) {
    const buffer = readFileSync(file)
    const uuid = contentUuid(buffer)
    const info = readSf2Info(buffer)
    const entry = {
      uuid,
      name: info.INAM || fallbackName(file),
      size: buffer.byteLength,
      url: defaultUrl,
      license: info.ICOP || defaultLicense
    }
    const target = join(soundfontRoot, uuid)
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
      targetFolder.soundfonts.push(entry)
      existing.set(uuid, entry)
      console.log(`add      ${entry.name} (${uuid})`)
      added++
    }
    if (!dryRun && (replace || !existsSync(target))) {
      copyFileSync(file, target)
      copied++
    }
  }

  targetFolder.soundfonts.sort((a, b) => a.name.localeCompare(b.name))
  catalog.updatedAt = new Date().toISOString()

  if (!dryRun) {
    mkdirSync(soundfontRoot, {recursive: true})
    const tmp = `${indexPath}.tmp`
    writeFileSync(tmp, `${JSON.stringify(catalog, null, 2)}\n`)
    renameSync(tmp, indexPath)
  }

  console.log(`${dryRun ? "Dry run" : "Import"} complete: added=${added}, updated=${updated}, skipped=${skipped}, copied=${copied}`)
}

main()
