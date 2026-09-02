import {JSONValue, Option, panic, UUID} from "@opendaw/lib-std"
import {ProjectMeta} from "./ProjectMeta"

// Server-backed Projects API (server is the source of truth; OPFS is cache/recovery only).
export namespace ServerProjects {
    export type ListEntry = { uuid: UUID.Bytes, meta: ProjectMeta }
    export type List = ReadonlyArray<ListEntry>

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
        const {projects} = await response.json() as { projects: Array<{ uuid: string, meta: JSONValue }> }
        return projects.map(({uuid, meta}) => ({uuid: UUID.parse(uuid), meta: ProjectMeta.fromJSON(meta)}))
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
            headers: {"Content-Type": "application/json"},
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
            fetch(`/api/projects/${uuidString}/file`, {method: "PUT", body: project}),
            fetch(`/api/projects/${uuidString}/meta`, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(meta)
            })
        ]
        cover.ifSome(bytes => requests.push(fetch(`/api/projects/${uuidString}/cover`, {method: "PUT", body: bytes})))
        const responses = await Promise.all(requests)
        if (responses.some(response => !response.ok)) {return panic("Failed to save project to server")}
    }

    export const duplicateProject = async (uuid: UUID.Bytes): Promise<UUID.Bytes> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}/duplicate`, {method: "POST"})
        if (!response.ok) {return panic(`Failed to duplicate project (${response.status})`)}
        const {uuid: newUuid} = await response.json() as { uuid: string }
        return UUID.parse(newUuid)
    }

    export const deleteProject = async (uuid: UUID.Bytes): Promise<void> => {
        const response = await fetch(`/api/projects/${UUID.toString(uuid)}`, {method: "DELETE"})
        if (!response.ok) {return panic(`Failed to delete project (${response.status})`)}
    }

    export const exportUrl = (uuid: UUID.Bytes): string => `/api/projects/${UUID.toString(uuid)}/export`
}
