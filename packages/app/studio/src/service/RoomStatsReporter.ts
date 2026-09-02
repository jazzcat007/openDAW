import {UUID} from "@opendaw/lib-std"

export type RoomResultStatus = "success" | "sync_timeout" | "socket_error" | "abort" | "unknown"

export const newRoomSessionId = (): string => UUID.toString(UUID.generate())

export const reportRoomResult = (sessionId: string, status: RoomResultStatus): void => {
    void sessionId
    void status
}

export const reportRoomDuration = (sessionId: string, durationMinutes: number): void => {
    void sessionId
    void durationMinutes
}

const HEARTBEAT_MS = 60_000

export type RoomDurationHeartbeat = { finalize: () => void }

export const startRoomDurationHeartbeat = (sessionId: string): RoomDurationHeartbeat => {
    let lastTickAt = Date.now()
    let finalized = false
    const interval = setInterval(() => {
        reportRoomDuration(sessionId, 1)
        lastTickAt = Date.now()
    }, HEARTBEAT_MS)
    return {
        finalize: () => {
            if (finalized) {return}
            finalized = true
            clearInterval(interval)
            const trailing = Math.round((Date.now() - lastTickAt) / 60_000)
            if (trailing > 0) {reportRoomDuration(sessionId, trailing)}
        }
    }
}
