#!/usr/bin/env node
import {createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {Readable} from "node:stream"
import {pipeline} from "node:stream/promises"

const DEFAULT_ROOT = "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"
const UPSTREAM = "https://assets.opendaw.studio"
const AUTH = "Basic " + Buffer.from("openDAW:prototype").toString("base64")

const MODELS = [
  "models/htdemucs/v4/model.onnx",
  "models/htdemucs-jx/v4/model.onnx",
  "models/basic-pitch/v0.4.0/model.onnx",
  "models/tempo-cnn/v0/model.onnx"
]

const EXTERNAL_FILES = [
  {
    target: "ffmpeg-core/0.12.6/ffmpeg-core.js",
    url: "https://package.opendaw.studio/ffmpeg-core.js"
  },
  {
    target: "ffmpeg-core/0.12.6/ffmpeg-core.wasm",
    url: "https://package.opendaw.studio/ffmpeg-core.wasm"
  }
]

const parseArgs = (argv) => {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      args[key] = true
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

const fetchUpstream = async (path, init = {}) => {
  const response = await fetch(`${UPSTREAM}/${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      ...(init.headers ?? {})
    }
  })
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status} ${response.statusText}`)
  }
  return response
}

const readJson = async (path) => {
  const response = await fetchUpstream(path)
  return response.json()
}

const collect = (node, property, out = []) => {
  if (Array.isArray(node)) {
    node.forEach(item => collect(item, property, out))
  } else if (node && typeof node === "object") {
    if (Array.isArray(node[property])) out.push(...node[property])
    if (Array.isArray(node.folders)) node.folders.forEach(item => collect(item, property, out))
  }
  return out
}

const ensureParent = (path) => mkdirSync(dirname(path), {recursive: true})

const remoteLength = async (path) => {
  const response = await fetchUpstream(path, {method: "HEAD"})
  const value = response.headers.get("content-length")
  return value === null ? null : Number(value)
}

const remoteUrlLength = async (url) => {
  const response = await fetch(url, {method: "HEAD"})
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status} ${response.statusText}`)
  }
  const value = response.headers.get("content-length")
  return value === null ? null : Number(value)
}

const isComplete = async (root, path, lengthProvider = () => remoteLength(path)) => {
  const target = join(root, path)
  if (!existsSync(target)) return false
  const length = await lengthProvider()
  return length === null || statSync(target).size === length
}

const download = async (root, path) => {
  if (await isComplete(root, path)) return "skipped"
  const target = join(root, path)
  const partial = `${target}.partial`
  ensureParent(target)
  const response = await fetchUpstream(path)
  if (response.body === null) throw new Error(`${path}: empty response body`)
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
    renameSync(partial, target)
    return "downloaded"
  } catch (error) {
    try {
      if (existsSync(partial)) unlinkSync(partial)
    } catch {}
    throw error
  }
}

const downloadUrl = async (root, {target: path, url}) => {
  if (await isComplete(root, path, () => remoteUrlLength(url))) return "skipped"
  const target = join(root, path)
  const partial = `${target}.partial`
  ensureParent(target)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status} ${response.statusText}`)
  }
  if (response.body === null) throw new Error(`${url}: empty response body`)
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
    renameSync(partial, target)
    return "downloaded"
  } catch (error) {
    try {
      if (existsSync(partial)) unlinkSync(partial)
    } catch {}
    throw error
  }
}

const runQueue = async (items, concurrency, worker) => {
  let index = 0
  let done = 0
  let downloaded = 0
  let skipped = 0
  const failed = []
  const next = async () => {
    while (true) {
      const current = index++
      if (current >= items.length) return
      const item = items[current]
      try {
        const status = await worker(item)
        if (status === "downloaded") downloaded++
        if (status === "skipped") skipped++
      } catch (error) {
        failed.push({item, error: error.message})
      }
      done++
      if (done === items.length || done % 25 === 0) {
        console.log(`  ${done}/${items.length} done, downloaded=${downloaded}, skipped=${skipped}, failed=${failed.length}`)
      }
    }
  }
  await Promise.all(Array.from({length: concurrency}, next))
  return {downloaded, skipped, failed}
}

const main = async () => {
  const args = parseArgs(process.argv)
  const root = args.root ?? process.env.FACTORY_MIRROR_ROOT ?? DEFAULT_ROOT
  mkdirSync(root, {recursive: true})

  console.log(`Mirroring factory assets into ${root}`)
  const samplesIndex = await readJson("samples/index.json")
  const soundfontsIndex = await readJson("soundfonts/index.json")
  const presetsIndex = await readJson("presets/index.json")

  for (const [path, value] of [
    ["samples/index.json", samplesIndex],
    ["soundfonts/index.json", soundfontsIndex],
    ["presets/index.json", presetsIndex]
  ]) {
    const target = join(root, path)
    ensureParent(target)
    writeFileSync(target, JSON.stringify(value, null, 2))
  }

  const samples = collect(samplesIndex, "samples").map(({uuid}) => `samples/${uuid}`)
  const soundfonts = collect(soundfontsIndex, "soundfonts").map(({uuid}) => `soundfonts/${uuid}`)
  const presets = presetsIndex.map(({uuid}) => `presets/${uuid}.odp`)
  const files = [...samples, ...soundfonts, ...presets]

  console.log(`Catalog: samples=${samples.length}, soundfonts=${soundfonts.length}, presets=${presets.length}, models=${MODELS.length}, external=${EXTERNAL_FILES.length}`)
  console.log("Mirroring catalog files")
  const assetResult = await runQueue(files, Number(args.concurrency ?? 8), path => download(root, path))

  console.log("Mirroring models")
  const modelResult = await runQueue(MODELS, Number(args["model-concurrency"] ?? 2), path => download(root, path))

  console.log("Mirroring external runtime files")
  const externalResult = await runQueue(EXTERNAL_FILES, Number(args["external-concurrency"] ?? 2), file => downloadUrl(root, file))

  const failed = [...assetResult.failed, ...modelResult.failed, ...externalResult.failed]
  if (failed.length > 0) {
    console.error("Mirror completed with failures:")
    failed.forEach(({item, error}) => console.error(`  ${item}: ${error}`))
    process.exit(1)
  }
  console.log("Mirror complete.")
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
