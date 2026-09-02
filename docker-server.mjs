import {createReadStream, existsSync, mkdirSync, readFileSync, statSync} from "node:fs"
import {writeFile} from "node:fs/promises"
import {createServer} from "node:http"
import {extname, join, normalize} from "node:path"
import {WebSocketServer} from "ws"
import * as Y from "yjs"
import {setupWSConnection, ROOM_CLEANUP_DELAY_MS, setPersistence} from "./packages/server/yjs-server/utils.js"
import * as map from "lib0/map"

const root = "/app/packages/app/studio/dist"
const factoryAssetRoot = process.env.FACTORY_ASSET_ROOT ?? "/data/factory"
const roomRoot = process.env.OPENDAW_ROOM_ROOT ?? "/data/rooms"
const factoryOfflineOnly = process.env.OPENDAW_FACTORY_OFFLINE_ONLY === "true"
const upstreamAssets = "https://assets.opendaw.studio"
const username = "openDAW"
const password = "prototype"
const auth = Buffer.from(`${username}:${password}`).toString("base64")
const rooms = new Map()
const roomCleanupTimers = new Map()

mkdirSync(roomRoot, {recursive: true})

const roomFilePath = (docName) => {
  const safeName = Buffer.from(docName, "utf8").toString("base64url")
  return join(roomRoot, `${safeName}.ydoc`)
}

const roomWriteTimers = new Map()
const scheduleRoomWrite = (docName, doc) => {
  const existing = roomWriteTimers.get(docName)
  if (existing !== undefined) {
    clearTimeout(existing)
  }
  const timer = setTimeout(() => {
    roomWriteTimers.delete(docName)
    writeFile(roomFilePath(docName), Buffer.from(Y.encodeStateAsUpdate(doc))).catch(error => {
      console.error(`Failed to persist room '${docName}':`, error)
    })
  }, 1000)
  roomWriteTimers.set(docName, timer)
}

setPersistence({
  provider: "file",
  bindState: (docName, doc) => {
    const file = roomFilePath(docName)
    if (existsSync(file)) {
      Y.applyUpdate(doc, readFileSync(file))
    }
    doc.on("update", () => scheduleRoomWrite(docName, doc))
  },
  writeState: async (docName, doc) => {
    const timer = roomWriteTimers.get(docName)
    if (timer !== undefined) {
      clearTimeout(timer)
      roomWriteTimers.delete(docName)
    }
    await writeFile(roomFilePath(docName), Buffer.from(Y.encodeStateAsUpdate(doc)))
  }
})

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".sf2", "application/octet-stream"],
  [".odp", "application/octet-stream"]
])

const commonHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff"
}

const send = (res, status, headers = {}, body = "") => {
  res.writeHead(status, {...commonHeaders, ...headers})
  res.end(body)
}

const sendJson = (res, status, value) => {
  send(res, status, {"Content-Type": "application/json; charset=utf-8"}, JSON.stringify(value))
}

const serveStatic = (req, res) => {
  const url = new URL(req.url, "https://localhost")
  const requestPath = decodeURIComponent(url.pathname)
  const candidate = normalize(join(root, requestPath))
  const exists = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()
  if (!exists && requestPath === "/sponsors.json") {
    sendJson(res, 200, {fetchedAt: new Date(0).toISOString(), totalCount: 0, sponsors: []})
    return
  }
  if (!exists && extname(requestPath) === ".json") {
    sendJson(res, 404, {error: "Not found"})
    return
  }
  const file = exists ? candidate : join(root, "index.html")
  const type = mime.get(extname(file)) ?? "application/octet-stream"
  res.writeHead(200, {...commonHeaders, "Content-Type": type})
  createReadStream(file).pipe(res)
}

const serveLocalFactory = (req, res) => {
  const url = new URL(req.url, "https://localhost")
  const requestPath = decodeURIComponent(url.pathname.replace(/^\/factory\/?/, ""))
  const candidate = normalize(join(factoryAssetRoot, requestPath))
  if (!candidate.startsWith(factoryAssetRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return false
  }
  const type = mime.get(extname(candidate)) ?? "application/octet-stream"
  const size = statSync(candidate).size
  res.writeHead(200, {
    ...commonHeaders,
    "Content-Type": type,
    "Content-Length": String(size),
    "Cache-Control": "public, max-age=3600"
  })
  if (req.method === "HEAD") {
    res.end()
    return true
  }
  createReadStream(candidate).pipe(res)
  return true
}

const proxyFactory = async (req, res) => {
  if (serveLocalFactory(req, res)) {
    return
  }
  if (factoryOfflineOnly) {
    sendJson(res, 404, {error: "Factory asset not found in local mirror"})
    return
  }
  const url = new URL(req.url, "https://localhost")
  const upstreamPath = url.pathname.replace(/^\/factory/, "")
  const upstreamUrl = `${upstreamAssets}${upstreamPath}${url.search}`
  const response = await fetch(upstreamUrl, {
    headers: {"Authorization": `Basic ${auth}`}
  })
  const headers = {
    "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": response.headers.get("cache-control") ?? "public, max-age=3600"
  }
  const length = response.headers.get("content-length")
  if (length !== null) {headers["Content-Length"] = length}
  res.writeHead(response.status, {...commonHeaders, ...headers})
  if (response.body === null) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  const pump = async () => {
    const {done, value} = await reader.read()
    if (done) {
      res.end()
    } else {
      res.write(value)
      await pump()
    }
  }
  await pump()
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/live")) {
    send(res, 200, {"Content-Type": "text/plain; charset=utf-8"}, "okay")
    return
  }
  if (req.url?.startsWith("/factory/")) {
    proxyFactory(req, res).catch(error => {
      console.error(error)
      send(res, 502, {"Content-Type": "text/plain; charset=utf-8"}, "Factory asset proxy failed")
    })
    return
  }
  serveStatic(req, res)
})

const yjsWss = new WebSocketServer({noServer: true})
yjsWss.on("connection", (ws, req, docName) => {
  setupWSConnection(ws, req, {docName})
})

const signalingWss = new WebSocketServer({noServer: true})

const scheduleSignalingCleanup = (topic) => {
  console.log(`Signaling topic '${topic}' is empty, scheduling cleanup in ${ROOM_CLEANUP_DELAY_MS / 1000}s`)
  const timer = setTimeout(() => {
    roomCleanupTimers.delete(topic)
    const subscribers = rooms.get(topic)
    if (!subscribers || subscribers.size === 0) {
      console.log(`Cleaning up signaling topic: ${topic}`)
      rooms.delete(topic)
    }
  }, ROOM_CLEANUP_DELAY_MS)
  roomCleanupTimers.set(topic, timer)
}

signalingWss.on("connection", (conn, req) => {
  console.log("WebRTC signaling connection from", req.headers.origin)

  const subscribedTopics = new Set()
  let closed = false

  conn.on("message", data => {
    if (closed) return
    try {
      const message = JSON.parse(data.toString())
      switch (message.type) {
        case "subscribe": {
          for (const topic of message.topics || []) {
            if (roomCleanupTimers.has(topic)) {
              clearTimeout(roomCleanupTimers.get(topic))
              roomCleanupTimers.delete(topic)
            }
            subscribedTopics.add(topic)
            const subscribers = map.setIfUndefined(rooms, topic, () => new Set())
            subscribers.add(conn)
          }
          break
        }
        case "unsubscribe": {
          for (const topic of message.topics || []) {
            subscribedTopics.delete(topic)
            const subscribers = rooms.get(topic)
            if (subscribers) {
              subscribers.delete(conn)
              if (subscribers.size === 0) scheduleSignalingCleanup(topic)
            }
          }
          break
        }
        case "publish": {
          const subscribers = message.topic ? rooms.get(message.topic) : null
          if (subscribers) {
            const forwardMessage = JSON.stringify(message)
            subscribers.forEach(subscriber => {
              if (subscriber !== conn) {
                try {
                  subscriber.send(forwardMessage)
                } catch (error) {
                  console.error("Error forwarding signaling message:", error)
                }
              }
            })
          }
          break
        }
        case "ping":
          conn.send(JSON.stringify({type: "pong"}))
          break
      }
    } catch (error) {
      console.error("Signaling error:", error)
    }
  })

  conn.on("close", () => {
    closed = true
    subscribedTopics.forEach(topic => {
      const subscribers = rooms.get(topic)
      if (subscribers) {
        subscribers.delete(conn)
        if (subscribers.size === 0) scheduleSignalingCleanup(topic)
      }
    })
  })

  conn.on("error", error => {
    console.error("Signaling connection error:", error)
  })
})

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "https://localhost")
  if (url.pathname === "/live/signaling") {
    signalingWss.handleUpgrade(req, socket, head, ws => {
      signalingWss.emit("connection", ws, req)
    })
    return
  }
  if (url.pathname.startsWith("/live/")) {
    const docName = decodeURIComponent(url.pathname.replace(/^\/live\//, ""))
    yjsWss.handleUpgrade(req, socket, head, ws => {
      yjsWss.emit("connection", ws, req, docName)
    })
    return
  }
  socket.destroy()
})

server.listen(8080, "0.0.0.0", () => {
  console.log("openDAW static/proxy/live server listening on http://0.0.0.0:8080")
})
