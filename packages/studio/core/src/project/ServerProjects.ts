import {JSONValue, Option, panic, UUID} from "@opendaw/lib-std"
import {ProjectMeta} from "./ProjectMeta"

// Required on every mutating request; enforced server-side as a lightweight CSRF guard alongside session cookies.
const CsrfHeader = {"X-OpenDAW-Csrf": "1"}

// Server-backed Projects API (server is the source of truth; OPFS is cache/recovery only).
export namespace ServerProjects {
    export type ListEntry = { uuid: UUID.Bytes, meta: ProjectMeta, shared: boolean }
    export type List = ReadonlyArray<ListEntry>
    export type MemberRole = "owner" | "editor" | "viewer"
    export type Member = { userId: string, username: string, role: MemberRole, disabled: boolean }
    export type ShareCandidate = { id: string, username: string }

    let availability: Option<boolean> = Option.None

    export const isAvailable = async (): Promise<boolean> => {
        if (availability.nonEmpty()) {return availability.unwrap()}
        const response = await fetch("/api/server-info").catch(() => null)
        const json = response?.ok ? await response.json().catch(() => null) : null
        const available = json?.features?.serverProjectLibrary === true
        availability = Option.wrap(available)
        return available
    }

    export const listProjects = async (): Promise<List> => {
        const response = await fetch("/api/projects")
        if (!response.ok) {return panic(`Failed to list projects (${response.status})`)}
        const {projects} = await response.json() as { projects: Array<{ uuid: string, meta: JSONValue, shared?: boolean }> }
        return projects.map(({uuid, meta, shared}) => ({uuid: UUID.parse(uuid), meta: ProjectMeta.fromJSON(meta), shared: shared === true}))
    }

    export const loadProject = async (uuid: UUID.Bytes): Promise<ArrayBuffer> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}/file`)
        if (!response.ok) {return panic(`Failed to load project (${response.status})`)}
        return response.arrayBuffer()
    }

    export const loadCover = async (uuid: UUID.Bytes): Promise<Option<ArrayBuffer>> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}/cover`)
        return response.ok ? Option.wrap(await response.arrayBuffer()) : Option.None
    }

    export const createProject = async (meta: ProjectMeta): Promise<UUID.Bytes> => {
        const response = await fetch("/api/projects", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({meta})
        })
        if (!response.ok) {return panic(`Failed to create project (${response.status})`)}
        const {uuid} = await response.json() as { uuid: string }
        return UUID.parse(uuid)
    }

    export const saveProject = async (uuid: UUID.Bytes,
                                      project: ArrayBuffer,
                                      meta: ProjectMeta,
                                      cover: Option<ArrayBuffer>): Promise<void> => {
        const uuidString = UUID.toString(uuid)
        const requests: Array<Promise<Response>> = [
            fetch(`/api/projects/${uuidString}/file`, {method: "PUT", headers: CsrfHeader, body: project}),
            fetch(`/api/projects/${uuidString}/meta`, {
                method: "PUT",
                headers: {"Content-Type": "application/json", ...CsrfHeader},
                body: JSON.stringify(meta)
            })
        ]
        cover.ifSome(bytes => requests.push(fetch(`/api/projects/${uuidString}/cover`,
            {method: "PUT", headers: CsrfHeader, body: bytes})))
        const responses = await Promise.all(requests)
        if (responses.some(response => !response.ok)) {return panic("Failed to save project to server")}
    }

    export const duplicateProject = async (uuid: UUID.Bytes): Promise<UUID.Bytes> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}/duplicate`, {method: "POST", headers: CsrfHeader})
        if (!response.ok) {return panic(`Failed to duplicate project (${response.status})`)}
        const {uuid: newUuid} = await response.json() as { uuid: string }
        return UUID.parse(newUuid)
    }

    export const deleteProject = async (uuid: UUID.Bytes): Promise<void> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}`, {method: "DELETE", headers: CsrfHeader})
        if (!response.ok) {return panic(`Failed to delete project (${response.status})`)}
    }

    export const getMembers = async (uuid: UUID.Bytes): Promise<{
        members: ReadonlyArray<Member>, users: ReadonlyArray<ShareCandidate>
    }> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}/members`)
        if (!response.ok) {return panic(`Failed to load collaborators (${response.status})`)}
        return response.json()
    }

    export const updateMembers = async (uuid: UUID.Bytes,
                                        members: ReadonlyArray<{ userId: string, role: "editor" | "viewer" }>): Promise<ReadonlyArray<Member>> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}/members`, {
            method: "PUT",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({members})
        })
        if (!response.ok) {return panic(`Failed to update collaborators (${response.status})`)}
        const result = await response.json() as { members: ReadonlyArray<Member> }
        return result.members
    }

    export const exportUrl = (uuid: UUID.Bytes): string => `/api/projects/${UUID.toString(uuid)}/export`
}
