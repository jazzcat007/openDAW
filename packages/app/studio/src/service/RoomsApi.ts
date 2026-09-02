const CsrfHeader = {"X-OpenDAW-Csrf": "1"}

// Metadata-only link between a Live Room (Yjs doc name) and a server Project, so the room's
// creator can autosnapshot the collaborative session back into the Project. Best-effort: failures
// are logged, never thrown, since this must not interrupt collaboration.
export namespace RoomsApi {
    export const registerRoom = async (roomName: string, projectUuid: string): Promise<void> => {
        await fetch("/api/rooms", {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify({roomName, projectUuid})
        }).catch(error => console.warn("Failed to register room-project link:", error))
    }
}
