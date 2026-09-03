import {Lifecycle} from "@opendaw/lib-std"

export namespace CompactMode {
    export const Query = "(max-width: 760px), (max-width: 1024px) and (pointer: coarse)"

    export const install = (lifecycle: Lifecycle): void => {
        const media = window.matchMedia(Query)
        const update = () => document.documentElement.classList.toggle("compact-workspace", media.matches)
        media.addEventListener("change", update)
        lifecycle.own({terminate: () => {
            media.removeEventListener("change", update)
            document.documentElement.classList.remove("compact-workspace")
        }})
        update()
    }
}
