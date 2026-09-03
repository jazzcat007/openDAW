import {Dialog} from "@/ui/components/Dialog"
import {Surface} from "@/ui/surface/Surface"
import {createElement} from "@opendaw/lib-jsx"
import {Errors, UUID} from "@opendaw/lib-std"
import {ServerProjects} from "@opendaw/studio-core"
import {IconSymbol} from "@opendaw/studio-enums"

export const showProjectSharingDialog = async (uuid: UUID.Bytes, projectName: string): Promise<void> => {
    const {members, users} = await ServerProjects.getMembers(uuid)
    const owner = members.find(member => member.role === "owner")
    const currentRoles = new Map(members.map(member => [member.userId, member.role]))
    const rows = users.filter(user => user.id !== owner?.userId).map(user => {
        const select: HTMLSelectElement = (
            <select>
                <option value="">Private</option>
                <option value="viewer" selected={currentRoles.get(user.id) === "viewer"}>Can view</option>
                <option value="editor" selected={currentRoles.get(user.id) === "editor"}>Can edit</option>
            </select>
        ) as HTMLSelectElement
        return {user, select}
    })
    const errorLine: HTMLElement = <div style={{color: "var(--color-red)", minHeight: "1.25em"}}/>
    const content: HTMLElement = (
        <div style={{padding: "1em 0", minWidth: "26em", display: "grid", rowGap: "0.6em"}}>
            <p style={{margin: "0"}}>Only invited collaborators can open <strong>{projectName}</strong>.</p>
            <div style={{display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5em 1em", alignItems: "center"}}>
                <span>{owner?.username ?? "Project owner"} (owner)</span><span>Owner</span>
                {rows.flatMap(({user, select}) => [<span>{user.username}</span>, select])}
            </div>
            {rows.length === 0 && <p style={{margin: "0"}}>No other active users are available yet.</p>}
            {errorLine}
        </div>
    )
    const {resolve, reject, promise} = Promise.withResolvers<void>()
    let completed = false
    const dialog: HTMLDialogElement = (
        <Dialog headline="Share Project" icon={IconSymbol.UserFolder} cancelable={true} buttons={[{
            text: "Save sharing", primary: true, onClick: async handler => {
                errorLine.textContent = ""
                try {
                    await ServerProjects.updateMembers(uuid, rows.flatMap(({user, select}) =>
                        select.value === "editor" || select.value === "viewer"
                            ? [{userId: user.id, role: select.value as "editor" | "viewer"}] : []))
                    completed = true
                    handler.close()
                    resolve()
                } catch (reason) {
                    errorLine.textContent = reason instanceof Error ? reason.message : String(reason)
                }
            }
        }, {text: "Cancel", onClick: handler => handler.close()}]}>
            {content}
        </Dialog>
    )
    dialog.addEventListener("close", () => {
        if (!completed) {reject(Errors.AbortError)}
    }, {once: true})
    Surface.get().flyout.appendChild(dialog)
    dialog.showModal()
    return promise
}
