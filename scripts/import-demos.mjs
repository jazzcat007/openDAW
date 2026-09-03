#!/usr/bin/env node
import {existsSync, mkdirSync, renameSync, writeFileSync} from "node:fs"
import {join} from "node:path"

const DEFAULT_ROOT = existsSync("/data/factory")
  ? "/data/factory"
  : "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"

const ids = [
  "ae8ec50bfac",
  "192c9b77aaa",
  "b3c0b901b24",
  "8dd3364e113",
  "84f9c4fbb76",
  "3a96772867c",
  "97b0564366f",
  "f9e029edeb0",
  "0d8b487992b",
  "3038c24e87e",
  "468309b2035",
  "932e7c1d1f1",
  "7a5be6e2478",
  "16982e85776",
  "1cc67c64dde",
  "65efa1e1f7f",
  "b41528b9c53",
  "b43d04558ec",
  "cab976763f0"
]

const usage = `Usage:
  node scripts/import-demos.mjs [options]

Options:
  --root <path>       Factory root. Defaults to /data/factory in Docker, otherwise this install's appdata/opendaw/factory.
  --dry-run           Print planned downloads without writing files.
  --replace           Replace existing metadata and project bundles.
  --help              Show this help.
`

const parseArgs = (argv) => {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`)
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

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`)
  }
  return response.json()
}

const fetchBytes = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

const writeAtomic = (path, data) => {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, path)
}

const main = async () => {
  const args = parseArgs(process.argv)
  if (args.help) {
    process.stdout.write(usage)
    return
  }

  const root = args.root ?? process.env.FACTORY_MIRROR_ROOT ?? process.env.FACTORY_ASSET_ROOT ?? DEFAULT_ROOT
  const demoRoot = join(root, "demos")
  const dryRun = args["dry-run"] === true
  const replace = args.replace === true
  const listUrl = `https://api.opendaw.studio/music/list-by-ids.php?ids=${ids.join(",")}`

  console.log(`Fetching demo metadata from ${listUrl}`)
  const list = await fetchJson(listUrl)
  const tracks = list.tracks ?? []
  if (tracks.length === 0) {
    throw new Error("Demo metadata response did not include any tracks")
  }

  console.log(`${dryRun ? "Would write" : "Writing"} ${tracks.length} demo entries to ${demoRoot}`)
  if (!dryRun) {
    mkdirSync(demoRoot, {recursive: true})
    writeAtomic(join(demoRoot, "projects.json"), `${JSON.stringify({tracks}, null, 2)}\n`)
  }

  let downloaded = 0
  let skipped = 0
  for (const track of tracks) {
    const folder = join(demoRoot, track.id)
    const target = join(folder, "project.odb")
    const url = `https://api.opendaw.studio/music/uploads/${track.id}/project.odb`
    if (existsSync(target) && !replace) {
      console.log(`skip     ${track.name ?? track.id} (${track.id})`)
      skipped++
      continue
    }
    console.log(`${dryRun ? "would get" : "download"} ${track.name ?? track.id} (${track.id})`)
    if (!dryRun) {
      mkdirSync(folder, {recursive: true})
      writeAtomic(target, await fetchBytes(url))
    }
    downloaded++
  }

  console.log(`${dryRun ? "Dry run" : "Import"} complete: tracks=${tracks.length}, downloaded=${downloaded}, skipped=${skipped}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
