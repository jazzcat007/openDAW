#!/usr/bin/env node
import {existsSync, mkdirSync, renameSync, writeFileSync} from "node:fs"
import {join} from "node:path"

const DEFAULT_ROOT = existsSync("/data/factory")
  ? "/data/factory"
  : "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"

const ids = [
  "ae8ec50bfac", "192c9b77aaa", "b3c0b901b24", "8dd3364e113", "84f9c4fbb76",
  "3a96772867c", "97b0564366f", "f9e029edeb0", "0d8b487992b", "3038c24e87e",
  "468309b2035", "932e7c1d1f1", "7a5be6e2478", "16982e85776", "1cc67c64dde",
  "65efa1e1f7f", "b41528b9c53", "b43d04558ec", "cab976763f0"
]

const usage = `Usage:
  node scripts/import-demos.mjs [options]

Downloads the OpenDAW demo catalog and project bundles into a local factory mirror.

Options:
  --root <path>  Factory root. Defaults to /data/factory in Docker, otherwise this install's appdata/opendaw/factory.
  --dry-run      Fetch and validate the catalog, but do not write files.
  --replace      Re-download bundle files already present.
  --help         Show this help.
`

const parseArgs = (argv) => {
  const args = {}
  for (let index = 2; index < argv.length; index++) {
    const token = argv[index]
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`)
    const key = token.slice(2)
    if (["dry-run", "replace", "help"].includes(key)) {
      args[key] = true
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`)
    args[key] = value
    index++
  }
  return args
}

const fetchOk = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned ${response.status} ${response.statusText}`)
  return response
}

const writeAtomically = (path, bytes) => {
  const temporary = `${path}.tmp`
  writeFileSync(temporary, bytes)
  renameSync(temporary, path)
}

const main = async () => {
  const args = parseArgs(process.argv)
  if (args.help) return process.stdout.write(usage)

  const root = args.root ?? process.env.FACTORY_MIRROR_ROOT ?? process.env.FACTORY_ASSET_ROOT ?? DEFAULT_ROOT
  const demosRoot = join(root, "demos")
  const catalogResponse = await fetchOk(`https://api.opendaw.studio/music/list-by-ids.php?ids=${ids.join(",")}`)
  const catalog = await catalogResponse.json()
  if (!Array.isArray(catalog.tracks) || catalog.tracks.length !== ids.length) {
    throw new Error(`Expected metadata for ${ids.length} demos, received ${catalog.tracks?.length ?? 0}`)
  }
  const receivedIds = new Set(catalog.tracks.map(track => track.id))
  if (ids.some(id => !receivedIds.has(id))) throw new Error("The upstream demo catalog did not return every requested id")

  if (args["dry-run"]) {
    console.log(`Dry run complete: validated ${catalog.tracks.length} demo(s); no files written.`)
    return
  }

  mkdirSync(demosRoot, {recursive: true})
  writeAtomically(join(demosRoot, "projects.json"), `${JSON.stringify({tracks: catalog.tracks}, null, 2)}\n`)

  let downloaded = 0
  let skipped = 0
  for (const track of catalog.tracks) {
    const projectRoot = join(demosRoot, track.id)
    const projectPath = join(projectRoot, "project.odb")
    if (existsSync(projectPath) && !args.replace) {
      console.log(`skip     ${track.name ?? track.id} (${track.id})`)
      skipped++
      continue
    }
    mkdirSync(projectRoot, {recursive: true})
    const bundle = Buffer.from(await (await fetchOk(`https://api.opendaw.studio/music/uploads/${track.id}/project.odb`)).arrayBuffer())
    writeAtomically(projectPath, bundle)
    downloaded++
    console.log(`download ${track.name ?? track.id} (${track.id}) — ${bundle.length} bytes`)
  }
  console.log(`Demo import complete: catalog=${catalog.tracks.length}, downloaded=${downloaded}, skipped=${skipped}`)
}

main().catch(error => {
  console.error(`Demo import failed: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
