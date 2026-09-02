import {
  copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync,
  writeFileSync
} from "node:fs"
import {writeFile} from "node:fs/promises"
import {createServer} from "node:http"
import {randomBytes, randomUUID, scryptSync, timingSafeEqual} from "node:crypto"
import {extname, join, normalize} from "node:path"
import {WebSocketServer} from "ws"
import * as Y from "yjs"
import {setupWSConnection, ROOM_CLEANUP_DELAY_MS, setPersistence} from "./packages/server/yjs-server/utils.js"
import * as map from "lib0/map"

const root = "/app/packages/app/studio/dist"
const factoryAssetRoot = process.env.FACTORY_ASSET_ROOT ?? "/data/factory"
const projectRoot = process.env.OPENDAW_PROJECT_ROOT ?? "/data/projects"
const projectsRoot = join(projectRoot, "v1")
const PROJECT_REVISION_LIMIT = 20
const PROJECT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const roomRoot = process.env.OPENDAW_ROOM_ROOT ?? "/data/rooms"
const serverRoot = process.env.OPENDAW_SERVER_ROOT ?? "/data/server"
const factoryOfflineOnly = process.env.OPENDAW_FACTORY_OFFLINE_ONLY === "true"
const upstreamAssets = "https://assets.opendaw.studio"
const upstreamUsername = process.env.OPENDAW_UPSTREAM_ASSET_USERNAME ?? "openDAW"
const upstreamPassword = process.env.OPENDAW_UPSTREAM_ASSET_PASSWORD ?? "prototype"
const upstreamAuth = Buffer.from(`${upstreamUsername}:${upstreamPassword}`).toString("base64")
const siteUsername = process.env.OPENDAW_AUTH_USERNAME
const sitePassword = process.env.OPENDAW_AUTH_PASSWORD
const authEnabled = siteUsername !== undefined && siteUsername.length > 0 &&
  sitePassword !== undefined && sitePassword.length > 0
const rooms = new Map()
const roomCleanupTimers = new Map()

mkdirSync(roomRoot, {recursive: true})
mkdirSync(projectRoot, {recursive: true})
mkdirSync(projectsRoot, {recursive: true})
mkdirSync(serverRoot, {recursive: true})

const settingsFile = join(serverRoot, "settings.json")
const usersFile = join(serverRoot, "users.json")

const readJson = (file, fallback) => {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    console.error(`Failed to read ${file}:`, error)
    return fallback
  }
}

const writeJsonIfMissing = (file, value) => {
  if (existsSync(file)) return
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const defaultSettings = {
  siteName: "Metal-Duck Studios",
  storageMode: "server-first-planned",
  projectDefaults: {
    visibility: "private",
    autosave: true,
    browserStorageRole: "cache-and-recovery"
  },
  asyncWorkspace: {
    label: "Projects",
    persistence: "server-snapshots-planned"
  },
  collaboration: {
    label: "Live Rooms",
    liveRoomsPersisted: true,
    defaultRoomAccess: "project-members"
  },
  assets: {
    factoryOfflineOnly,
    localFactoryRoot: factoryAssetRoot
  }
}

writeJsonIfMissing(settingsFile, defaultSettings)

const hashPassword = (password) => {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`
}

const verifyPassword = (password, stored) => {
  const parts = typeof stored === "string" ? stored.split(":") : []
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = Buffer.from(parts[1], "hex")
  const expected = Buffer.from(parts[2], "hex")
  const actual = scryptSync(password, salt, expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const loadUsers = () => {
  const raw = readJson(usersFile, {users: []})
  return Array.isArray(raw.users) ? raw.users.filter(user => typeof user?.passwordHash === "string") : []
}

let users = loadUsers()
const persistUsers = () => writeFileSync(usersFile, `${JSON.stringify({users}, null, 2)}\n`)

if (users.length === 0 && authEnabled) {
  users.push({
    id: randomUUID(),
    username: siteUsername,
    passwordHash: hashPassword(sitePassword),
    role: "admin",
    createdAt: new Date().toISOString(),
    disabledAt: null,
    lastLoginAt: null
  })
  persistUsers()
  console.log(`Bootstrapped admin user '${siteUsername}' from OPENDAW_AUTH_USERNAME/PASSWORD`)
} else if (!existsSync(usersFile)) {
  persistUsers()
}

const invitesFile = join(serverRoot, "invites.json")
const loadInvites = () => {
  const raw = readJson(invitesFile, {invites: []})
  return Array.isArray(raw.invites) ? raw.invites : []
}
let invites = loadInvites()
const persistInvites = () => writeFileSync(invitesFile, `${JSON.stringify({invites}, null, 2)}\n`)

const sanitizeInvite = (invite) => ({
  token: invite.token,
  role: invite.role,
  createdBy: invite.createdBy,
  createdAt: invite.createdAt,
  expiresAt: invite.expiresAt,
  usedBy: invite.usedBy,
  usedAt: invite.usedAt
})

const findValidInvite = (token) => {
  const invite = invites.find(candidate => candidate.token === token)
  if (invite === undefined || invite.usedAt !== null || invite.expiresAt < Date.now()) return null
  return invite
}

const roomLinksFile = join(serverRoot, "room-links.json")
const ROOM_NAME_PATTERN = /^[a-z0-9.\-_]{1,16}$/
const loadRoomLinks = () => {
  const raw = readJson(roomLinksFile, {rooms: []})
  return Array.isArray(raw.rooms) ? raw.rooms : []
}
let roomLinks = loadRoomLinks()
const persistRoomLinks = () => writeFileSync(roomLinksFile, `${JSON.stringify({rooms: roomLinks}, null, 2)}\n`)

const sessionsFile = join(serverRoot, "sessions.json")
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_COOKIE = "opendaw_session"
const sessions = new Map(Object.entries(readJson(sessionsFile, {})))

const persistSessions = () => writeFileSync(sessionsFile, `${JSON.stringify(Object.fromEntries(sessions), null, 2)}\n`)

const pruneSessions = () => {
  const now = Date.now()
  let changed = false
  for (const [token, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(token)
      changed = true
    }
  }
  if (changed) persistSessions()
}
pruneSessions()

const createSession = (userId) => {
  const token = randomBytes(32).toString("hex")
  sessions.set(token, {userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS})
  persistSessions()
  return token
}

const destroySession = (token) => {
  if (sessions.delete(token)) persistSessions()
}

const destroySessionsForUser = (userId) => {
  let changed = false
  for (const [token, session] of sessions) {
    if (session.userId === userId) {
      sessions.delete(token)
      changed = true
    }
  }
  if (changed) persistSessions()
}

const setSessionCookie = (res, token) => {
  res.setHeader("Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`)
}

const clearSessionCookie = (res) => {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

const parseCookies = (req) => {
  const header = req.headers.cookie
  const cookies = {}
  if (!header) return cookies
  header.split(";").forEach(part => {
    const index = part.indexOf("=")
    if (index < 0) return
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  })
  return cookies
}

const getSession = (req) => {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    persistSessions()
    return null
  }
  return {token, ...session}
}

const getCurrentUser = (req) => {
  const session = getSession(req)
  if (session === null) return null
  const user = users.find(candidate => candidate.id === session.userId)
  if (user === undefined || user.disabledAt !== null) return null
  return user
}

// Per (ip, username) sliding window; small friends-and-family scale, in-memory is fine.
const loginAttempts = new Map()
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
const loginKey = (req, username) => `${req.socket.remoteAddress}|${username.toLowerCase()}`

const isRateLimited = (key) => {
  const entry = loginAttempts.get(key)
  if (!entry) return false
  if (Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key)
    return false
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS
}

const recordFailedAttempt = (key) => {
  const entry = loginAttempts.get(key)
  if (!entry || Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, {firstAttempt: Date.now(), count: 1})
  } else {
    entry.count += 1
  }
}

const clearAttempts = (key) => loginAttempts.delete(key)

const CSRF_HEADER = "x-opendaw-csrf"
const requiresCsrfCheck = (method) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS"
const hasCsrfHeader = (req) => req.headers[CSRF_HEADER] === "1"

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  createdAt: user.createdAt,
  disabledAt: user.disabledAt,
  lastLoginAt: user.lastLoginAt
})

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

const methodNotAllowed = (res, allowed) => {
  sendJson(res, 405, {error: "Method not allowed", allowed})
}

const unauthorized = (res) => {
  send(res, 401, {
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="openDAW", charset="UTF-8"'
  }, "Authentication required")
}

const isAuthorized = (req) => {
  if (!authEnabled) return true
  const header = req.headers.authorization
  if (!header?.startsWith("Basic ")) return false
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8")
  const separator = decoded.indexOf(":")
  if (separator < 0) return false
  const username = decoded.slice(0, separator)
  const password = decoded.slice(separator + 1)
  return username === siteUsername && password === sitePassword
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

const sendBinary = (res, status, buffer, headers = {}) => {
  res.writeHead(status, {...commonHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(buffer.length), ...headers})
  res.end(buffer)
}

const readBody = (req, limit = 500 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  req.on("data", chunk => {
    size += chunk.length
    if (size > limit) {
      req.destroy()
      reject(new Error("Payload too large"))
      return
    }
    chunks.push(chunk)
  })
  req.on("end", () => resolve(Buffer.concat(chunks)))
  req.on("error", reject)
})

const tryParseJson = (buffer) => {
  try {
    return JSON.parse(buffer.toString("utf8"))
  } catch {
    return undefined
  }
}

const copyFileIfExists = (src, dest) => {
  if (existsSync(src)) copyFileSync(src, dest)
}

const projectFolder = (uuid) => join(projectsRoot, uuid)
const projectTrashFile = join(projectsRoot, "trash.json")
const readProjectTrash = () => readJson(projectTrashFile, [])
const writeProjectTrash = (ids) => writeFileSync(projectTrashFile, `${JSON.stringify(ids, null, 2)}\n`)

const listProjectSummaries = () => {
  if (!existsSync(projectsRoot)) return []
  const trash = readProjectTrash()
  return readdirSync(projectsRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && PROJECT_UUID_PATTERN.test(entry.name) && !trash.includes(entry.name))
    .map(entry => {
      const meta = readJson(join(projectsRoot, entry.name, "meta.json"), null)
      return meta === null ? null : {uuid: entry.name, meta}
    })
    .filter(entry => entry !== null)
}

const snapshotProjectRevision = (uuid) => {
  const folder = projectFolder(uuid)
  const filePath = join(folder, "project.od")
  if (!existsSync(filePath)) return
  const revisionsDir = join(folder, "revisions")
  mkdirSync(revisionsDir, {recursive: true})
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  copyFileSync(filePath, join(revisionsDir, `${stamp}.od`))
  const files = readdirSync(revisionsDir).filter(name => name.endsWith(".od")).sort()
  const excess = files.length - PROJECT_REVISION_LIMIT
  for (let i = 0; i < excess; i++) unlinkSync(join(revisionsDir, files[i]))
}

const serveProjectsApi = async (req, res) => {
  const url = new URL(req.url, "https://localhost")
  const segments = url.pathname.replace(/^\/api\/projects\/?/, "").split("/").filter(Boolean)
  if (segments.length === 0) {
    if (req.method === "GET") {
      sendJson(res, 200, {projects: listProjectSummaries()})
      return
    }
    if (req.method === "POST") {
      const body = await readBody(req)
      const parsed = tryParseJson(body)
      const requestedMeta = parsed && typeof parsed === "object" && parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {}
      const uuid = randomUUID()
      const now = new Date().toISOString()
      const meta = {name: "Untitled", artist: "", description: "", tags: [], created: now, modified: now, ...requestedMeta}
      mkdirSync(projectFolder(uuid), {recursive: true})
      writeFileSync(join(projectFolder(uuid), "meta.json"), `${JSON.stringify(meta, null, 2)}\n`)
      sendJson(res, 200, {uuid, meta})
      return
    }
    methodNotAllowed(res, ["GET", "POST"])
    return
  }
  const [uuid, resource, revisionStamp] = segments
  if (!PROJECT_UUID_PATTERN.test(uuid)) {
    sendJson(res, 400, {error: "Invalid project id"})
    return
  }
  const folder = projectFolder(uuid)
  if (segments.length === 1) {
    if (req.method === "GET") {
      const meta = readJson(join(folder, "meta.json"), null)
      if (meta === null) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      sendJson(res, 200, {uuid, meta})
      return
    }
    if (req.method === "DELETE") {
      const permanent = url.searchParams.get("permanent") === "true"
      const trash = readProjectTrash()
      if (permanent) {
        if (existsSync(folder)) rmSync(folder, {recursive: true, force: true})
        writeProjectTrash(trash.filter(id => id !== uuid))
      } else {
        if (!existsSync(join(folder, "meta.json"))) {
          sendJson(res, 404, {error: "Not found"})
          return
        }
        if (!trash.includes(uuid)) {
          trash.push(uuid)
          writeProjectTrash(trash)
        }
      }
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["GET", "DELETE"])
    return
  }
  if (segments.length === 2 && resource === "file") {
    if (req.method === "GET") {
      const filePath = join(folder, "project.od")
      if (!existsSync(filePath)) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      sendBinary(res, 200, readFileSync(filePath))
      return
    }
    if (req.method === "PUT") {
      const body = await readBody(req)
      mkdirSync(folder, {recursive: true})
      snapshotProjectRevision(uuid)
      writeFileSync(join(folder, "project.od"), body)
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["GET", "PUT"])
    return
  }
  if (segments.length === 2 && resource === "cover") {
    if (req.method === "GET") {
      const filePath = join(folder, "image.bin")
      if (!existsSync(filePath)) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      sendBinary(res, 200, readFileSync(filePath))
      return
    }
    if (req.method === "PUT") {
      const body = await readBody(req)
      mkdirSync(folder, {recursive: true})
      writeFileSync(join(folder, "image.bin"), body)
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["GET", "PUT"])
    return
  }
  if (segments.length === 2 && resource === "meta") {
    if (req.method === "PUT") {
      const body = await readBody(req)
      const parsed = tryParseJson(body)
      if (parsed === undefined || typeof parsed !== "object") {
        sendJson(res, 400, {error: "Invalid JSON"})
        return
      }
      mkdirSync(folder, {recursive: true})
      writeFileSync(join(folder, "meta.json"), `${JSON.stringify(parsed, null, 2)}\n`)
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["PUT"])
    return
  }
  if (segments.length === 2 && resource === "duplicate") {
    if (req.method === "POST") {
      const meta = readJson(join(folder, "meta.json"), null)
      if (meta === null) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      const newUuid = randomUUID()
      const newFolder = projectFolder(newUuid)
      mkdirSync(newFolder, {recursive: true})
      copyFileIfExists(join(folder, "project.od"), join(newFolder, "project.od"))
      copyFileIfExists(join(folder, "image.bin"), join(newFolder, "image.bin"))
      const now = new Date().toISOString()
      const duplicatedMeta = {...meta, created: now, modified: now}
      writeFileSync(join(newFolder, "meta.json"), `${JSON.stringify(duplicatedMeta, null, 2)}\n`)
      sendJson(res, 200, {uuid: newUuid, meta: duplicatedMeta})
      return
    }
    methodNotAllowed(res, ["POST"])
    return
  }
  if (segments.length === 2 && resource === "restore") {
    if (req.method === "POST") {
      writeProjectTrash(readProjectTrash().filter(id => id !== uuid))
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["POST"])
    return
  }
  if (segments.length === 2 && resource === "export") {
    if (req.method === "GET") {
      const filePath = join(folder, "project.od")
      if (!existsSync(filePath)) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      const meta = readJson(join(folder, "meta.json"), {name: uuid})
      const fileName = String(meta.name ?? uuid).replace(/["/\\]/g, "_")
      sendBinary(res, 200, readFileSync(filePath), {"Content-Disposition": `attachment; filename="${fileName}.od"`})
      return
    }
    methodNotAllowed(res, ["GET"])
    return
  }
  if (segments.length === 2 && resource === "revisions") {
    if (req.method === "GET") {
      const revisionsDir = join(folder, "revisions")
      const list = existsSync(revisionsDir)
        ? readdirSync(revisionsDir).filter(name => name.endsWith(".od")).map(name => name.replace(/\.od$/, "")).sort().reverse()
        : []
      sendJson(res, 200, {revisions: list})
      return
    }
    methodNotAllowed(res, ["GET"])
    return
  }
  if (segments.length === 3 && resource === "revisions") {
    if (req.method === "GET") {
      const revisionsDir = join(folder, "revisions")
      const stamp = revisionStamp.replace(/[^0-9A-Za-z-]/g, "")
      const filePath = join(revisionsDir, `${stamp}.od`)
      if (!filePath.startsWith(revisionsDir) || !existsSync(filePath)) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      sendBinary(res, 200, readFileSync(filePath))
      return
    }
    methodNotAllowed(res, ["GET"])
    return
  }
  sendJson(res, 404, {error: "Not found"})
}

const serveApi = (req, res) => {
  const url = new URL(req.url, "https://localhost")
  if (url.pathname === "/api/server-info") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"])
      return true
    }
    sendJson(res, 200, {
      name: "Metal-Duck Studios",
      mode: "self-hosted",
      auth: authEnabled ? "basic" : "disabled",
      storage: {
        serverRoot,
        projectRoot,
        roomRoot,
        factoryAssetRoot,
        roomPersistence: "file",
        projectPersistence: "server-files"
      },
      workspaceModel: {
        async: "Projects",
        sync: "Live Rooms"
      },
      features: {
        liveRoomPersistence: true,
        serverProjectLibrary: true,
        adminUsers: true,
        adminSettings: true,
        appAuth: true
      }
    })
    return true
  }
  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, {error: "Not found"})
    return true
  }
  return false
}

const serveAuthApi = async (req, res) => {
  const url = new URL(req.url, "https://localhost")
  const segment = url.pathname.replace(/^\/api\/auth\/?/, "")
  if (segment === "me") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"])
      return
    }
    const user = getCurrentUser(req)
    if (user !== null) {
      sendJson(res, 200, {authenticated: true, user: {id: user.id, username: user.username, role: user.role}})
      return
    }
    sendJson(res, 200, {authenticated: false, setupRequired: users.length === 0})
    return
  }
  if (segment.startsWith("invite/")) {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"])
      return
    }
    const invite = findValidInvite(segment.slice("invite/".length))
    sendJson(res, 200, invite === null ? {valid: false} : {valid: true, role: invite.role})
    return
  }
  if (segment === "register") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"])
      return
    }
    const parsed = tryParseJson(await readBody(req, 4096))
    const token = typeof parsed?.token === "string" ? parsed.token : ""
    const username = typeof parsed?.username === "string" ? parsed.username.trim() : ""
    const password = typeof parsed?.password === "string" ? parsed.password : ""
    const invite = findValidInvite(token)
    if (invite === null) {
      sendJson(res, 400, {error: "Invite link is invalid or has expired"})
      return
    }
    if (username.length < 3 || password.length < 8) {
      sendJson(res, 400, {error: "Username must be at least 3 characters and password at least 8"})
      return
    }
    if (users.some(candidate => candidate.username.toLowerCase() === username.toLowerCase())) {
      sendJson(res, 409, {error: "Username already exists"})
      return
    }
    const user = {
      id: randomUUID(), username, passwordHash: hashPassword(password), role: invite.role,
      createdAt: new Date().toISOString(), disabledAt: null, lastLoginAt: new Date().toISOString()
    }
    users.push(user)
    invite.usedBy = user.id
    invite.usedAt = new Date().toISOString()
    persistUsers()
    persistInvites()
    setSessionCookie(res, createSession(user.id))
    sendJson(res, 200, {ok: true, user: sanitizeUser(user)})
    return
  }
  if (segment === "setup") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"])
      return
    }
    if (users.length > 0) {
      sendJson(res, 409, {error: "Setup already completed"})
      return
    }
    const parsed = tryParseJson(await readBody(req, 4096))
    const username = typeof parsed?.username === "string" ? parsed.username.trim() : ""
    const password = typeof parsed?.password === "string" ? parsed.password : ""
    if (username.length < 3 || password.length < 8) {
      sendJson(res, 400, {error: "Username must be at least 3 characters and password at least 8"})
      return
    }
    const user = {
      id: randomUUID(), username, passwordHash: hashPassword(password), role: "admin",
      createdAt: new Date().toISOString(), disabledAt: null, lastLoginAt: new Date().toISOString()
    }
    users.push(user)
    persistUsers()
    setSessionCookie(res, createSession(user.id))
    sendJson(res, 200, {ok: true, user: sanitizeUser(user)})
    return
  }
  if (segment === "login") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"])
      return
    }
    const parsed = tryParseJson(await readBody(req, 4096))
    const username = typeof parsed?.username === "string" ? parsed.username.trim() : ""
    const password = typeof parsed?.password === "string" ? parsed.password : ""
    const key = loginKey(req, username || "unknown")
    if (isRateLimited(key)) {
      sendJson(res, 429, {error: "Too many attempts. Please wait and try again."})
      return
    }
    const user = users.find(candidate => candidate.username === username)
    if (user === undefined || user.disabledAt !== null || !verifyPassword(password, user.passwordHash)) {
      recordFailedAttempt(key)
      sendJson(res, 401, {error: "Invalid username or password"})
      return
    }
    clearAttempts(key)
    user.lastLoginAt = new Date().toISOString()
    persistUsers()
    setSessionCookie(res, createSession(user.id))
    sendJson(res, 200, {ok: true, user: sanitizeUser(user)})
    return
  }
  if (segment === "password") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"])
      return
    }
    const currentUser = getCurrentUser(req)
    if (currentUser === null) {
      sendJson(res, 401, {error: "Authentication required"})
      return
    }
    const parsed = tryParseJson(await readBody(req, 4096))
    const currentPassword = typeof parsed?.currentPassword === "string" ? parsed.currentPassword : ""
    const newPassword = typeof parsed?.newPassword === "string" ? parsed.newPassword : ""
    if (!verifyPassword(currentPassword, currentUser.passwordHash)) {
      sendJson(res, 401, {error: "Current password is incorrect"})
      return
    }
    if (newPassword.length < 8) {
      sendJson(res, 400, {error: "New password must be at least 8 characters"})
      return
    }
    currentUser.passwordHash = hashPassword(newPassword)
    persistUsers()
    destroySessionsForUser(currentUser.id)
    clearSessionCookie(res)
    sendJson(res, 200, {ok: true})
    return
  }
  if (segment === "logout") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"])
      return
    }
    const session = getSession(req)
    if (session !== null) destroySession(session.token)
    clearSessionCookie(res)
    sendJson(res, 200, {ok: true})
    return
  }
  sendJson(res, 404, {error: "Not found"})
}

const serveAdminApi = async (req, res) => {
  const currentUser = getCurrentUser(req)
  if (currentUser === null) {
    sendJson(res, 401, {error: "Authentication required"})
    return
  }
  if (currentUser.role !== "admin") {
    sendJson(res, 403, {error: "Admin role required"})
    return
  }
  const url = new URL(req.url, "https://localhost")
  const segments = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean)
  if (segments.length === 1 && segments[0] === "settings") {
    if (req.method === "GET") {
      sendJson(res, 200, {settings: readJson(settingsFile, defaultSettings), users: users.map(sanitizeUser)})
      return
    }
    if (req.method === "PUT") {
      const parsed = tryParseJson(await readBody(req))
      if (parsed === undefined || typeof parsed !== "object") {
        sendJson(res, 400, {error: "Invalid JSON"})
        return
      }
      const merged = {...readJson(settingsFile, defaultSettings), ...parsed}
      writeFileSync(settingsFile, `${JSON.stringify(merged, null, 2)}\n`)
      sendJson(res, 200, {settings: merged})
      return
    }
    methodNotAllowed(res, ["GET", "PUT"])
    return
  }
  if (segments.length === 1 && segments[0] === "users") {
    if (req.method === "GET") {
      sendJson(res, 200, {users: users.map(sanitizeUser)})
      return
    }
    if (req.method === "POST") {
      const parsed = tryParseJson(await readBody(req, 4096))
      const username = typeof parsed?.username === "string" ? parsed.username.trim() : ""
      const password = typeof parsed?.password === "string" ? parsed.password : ""
      const role = parsed?.role === "admin" ? "admin" : "member"
      if (username.length < 3 || password.length < 8) {
        sendJson(res, 400, {error: "Username must be at least 3 characters and password at least 8"})
        return
      }
      if (users.some(candidate => candidate.username.toLowerCase() === username.toLowerCase())) {
        sendJson(res, 409, {error: "Username already exists"})
        return
      }
      const user = {
        id: randomUUID(), username, passwordHash: hashPassword(password), role,
        createdAt: new Date().toISOString(), disabledAt: null, lastLoginAt: null
      }
      users.push(user)
      persistUsers()
      sendJson(res, 200, {user: sanitizeUser(user)})
      return
    }
    methodNotAllowed(res, ["GET", "POST"])
    return
  }
  if (segments.length === 2 && segments[0] === "users") {
    const target = users.find(candidate => candidate.id === segments[1])
    if (target === undefined) {
      sendJson(res, 404, {error: "Not found"})
      return
    }
    if (req.method === "PUT") {
      const parsed = tryParseJson(await readBody(req, 4096))
      if (parsed === undefined || typeof parsed !== "object") {
        sendJson(res, 400, {error: "Invalid JSON"})
        return
      }
      const activeAdminCount = () => users.filter(candidate => candidate.role === "admin" && candidate.disabledAt === null).length
      if (typeof parsed.role === "string" && (parsed.role === "admin" || parsed.role === "member")) {
        if (target.role === "admin" && parsed.role !== "admin" && activeAdminCount() <= 1) {
          sendJson(res, 400, {error: "Cannot demote the last active admin"})
          return
        }
        target.role = parsed.role
      }
      if (typeof parsed.disabled === "boolean") {
        if (parsed.disabled && target.id === currentUser.id) {
          sendJson(res, 400, {error: "Cannot disable your own account"})
          return
        }
        if (parsed.disabled && target.role === "admin" && activeAdminCount() <= 1) {
          sendJson(res, 400, {error: "Cannot disable the last active admin"})
          return
        }
        target.disabledAt = parsed.disabled ? new Date().toISOString() : null
        if (parsed.disabled) destroySessionsForUser(target.id)
      }
      if (typeof parsed.password === "string" && parsed.password.length > 0) {
        if (parsed.password.length < 8) {
          sendJson(res, 400, {error: "Password must be at least 8 characters"})
          return
        }
        target.passwordHash = hashPassword(parsed.password)
        destroySessionsForUser(target.id)
      }
      persistUsers()
      sendJson(res, 200, {user: sanitizeUser(target)})
      return
    }
    if (req.method === "DELETE") {
      if (target.id === currentUser.id) {
        sendJson(res, 400, {error: "Cannot delete your own account"})
        return
      }
      if (target.role === "admin" && users.filter(candidate => candidate.role === "admin").length <= 1) {
        sendJson(res, 400, {error: "Cannot delete the last admin"})
        return
      }
      users = users.filter(candidate => candidate.id !== target.id)
      persistUsers()
      destroySessionsForUser(target.id)
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["PUT", "DELETE"])
    return
  }
  if (segments.length === 1 && segments[0] === "invites") {
    if (req.method === "GET") {
      sendJson(res, 200, {invites: invites.map(sanitizeInvite)})
      return
    }
    if (req.method === "POST") {
      const parsed = tryParseJson(await readBody(req, 4096))
      const role = parsed?.role === "admin" ? "admin" : "member"
      const expiresInHours = Number.isFinite(parsed?.expiresInHours) && parsed.expiresInHours > 0
        ? parsed.expiresInHours : 168
      const invite = {
        token: randomBytes(16).toString("hex"),
        role,
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + expiresInHours * 60 * 60 * 1000,
        usedBy: null,
        usedAt: null
      }
      invites.push(invite)
      persistInvites()
      sendJson(res, 200, {invite: sanitizeInvite(invite)})
      return
    }
    methodNotAllowed(res, ["GET", "POST"])
    return
  }
  if (segments.length === 2 && segments[0] === "invites") {
    if (req.method === "DELETE") {
      const before = invites.length
      invites = invites.filter(candidate => candidate.token !== segments[1])
      if (invites.length === before) {
        sendJson(res, 404, {error: "Not found"})
        return
      }
      persistInvites()
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["DELETE"])
    return
  }
  sendJson(res, 404, {error: "Not found"})
}

// Links a Live Room (Yjs doc name) to a server Project so the client can autosnapshot into it.
// Content lives entirely in the Yjs doc; this is metadata only, not the room's data.
const serveRoomsApi = async (req, res) => {
  const currentUser = getCurrentUser(req)
  if (currentUser === null) {
    sendJson(res, 401, {error: "Authentication required"})
    return
  }
  const url = new URL(req.url, "https://localhost")
  const segments = url.pathname.replace(/^\/api\/rooms\/?/, "").split("/").filter(Boolean)
  if (segments.length === 0) {
    if (req.method === "GET") {
      sendJson(res, 200, {rooms: roomLinks})
      return
    }
    if (req.method === "POST") {
      const parsed = tryParseJson(await readBody(req, 4096))
      const roomName = typeof parsed?.roomName === "string" ? parsed.roomName : ""
      const projectUuid = typeof parsed?.projectUuid === "string" ? parsed.projectUuid : ""
      if (!ROOM_NAME_PATTERN.test(roomName) || !PROJECT_UUID_PATTERN.test(projectUuid)) {
        sendJson(res, 400, {error: "Invalid room name or project id"})
        return
      }
      const existing = roomLinks.find(candidate => candidate.roomName === roomName)
      if (existing !== undefined && existing.ownerUserId !== currentUser.id) {
        sendJson(res, 403, {error: "Room is linked by another user"})
        return
      }
      const now = new Date().toISOString()
      if (existing !== undefined) {
        existing.projectUuid = projectUuid
        existing.lastActivityAt = now
      } else {
        roomLinks.push({roomName, projectUuid, ownerUserId: currentUser.id, createdAt: now, lastActivityAt: now})
      }
      persistRoomLinks()
      sendJson(res, 200, {ok: true})
      return
    }
    methodNotAllowed(res, ["GET", "POST"])
    return
  }
  if (segments.length === 1) {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"])
      return
    }
    const room = roomLinks.find(candidate => candidate.roomName === segments[0])
    if (room === undefined) {
      sendJson(res, 404, {error: "Not found"})
      return
    }
    sendJson(res, 200, {room})
    return
  }
  sendJson(res, 404, {error: "Not found"})
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
    headers: {"Authorization": `Basic ${upstreamAuth}`}
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
  if (!isAuthorized(req)) {
    unauthorized(res)
    return
  }
  const url = new URL(req.url ?? "/", "https://localhost")
  if (url.pathname.startsWith("/api/") && requiresCsrfCheck(req.method) && !hasCsrfHeader(req)) {
    sendJson(res, 403, {error: "Missing CSRF header"})
    return
  }
  if (url.pathname.startsWith("/api/auth/")) {
    serveAuthApi(req, res).catch(error => {
      console.error(error)
      sendJson(res, 500, {error: "Internal server error"})
    })
    return
  }
  if (url.pathname.startsWith("/api/admin/")) {
    serveAdminApi(req, res).catch(error => {
      console.error(error)
      sendJson(res, 500, {error: "Internal server error"})
    })
    return
  }
  if (url.pathname.startsWith("/live")) {
    if (getCurrentUser(req) === null) {
      sendJson(res, 401, {error: "Authentication required"})
      return
    }
    send(res, 200, {"Content-Type": "text/plain; charset=utf-8"}, "okay")
    return
  }
  if (url.pathname.startsWith("/api/projects")) {
    if (getCurrentUser(req) === null) {
      sendJson(res, 401, {error: "Authentication required"})
      return
    }
    serveProjectsApi(req, res).catch(error => {
      console.error(error)
      sendJson(res, 500, {error: "Internal server error"})
    })
    return
  }
  if (url.pathname.startsWith("/api/rooms")) {
    serveRoomsApi(req, res).catch(error => {
      console.error(error)
      sendJson(res, 500, {error: "Internal server error"})
    })
    return
  }
  if (url.pathname.startsWith("/api/") && serveApi(req, res)) {
    return
  }
  if (url.pathname.startsWith("/factory/")) {
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
  if (!isAuthorized(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"openDAW\", charset=\"UTF-8\"\r\n\r\n")
    socket.destroy()
    return
  }
  if (getCurrentUser(req) === null) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
    socket.destroy()
    return
  }
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
