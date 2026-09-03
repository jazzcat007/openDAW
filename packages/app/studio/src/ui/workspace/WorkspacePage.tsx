import css from "./WorkspacePage.sass?inline"
import {Terminator} from "@opendaw/lib-std"
import {createElement, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {WorkspaceBuilder} from "@/ui/workspace/WorkspaceBuilder"
import {CompactWorkspace} from "@/ui/workspace/CompactWorkspace"
import {CompactMode} from "@/ui/workspace/CompactMode"

const className = Html.adoptStyleSheet(css, "WorkspacePage")

export const WorkspacePage: PageFactory<StudioService> = ({lifecycle, service}: PageContext<StudioService>) => {
    // const page: Nullable<string> = PageUtils.extractSecondSegment(path)
    // console.debug(page)
    const main: HTMLElement = <main/>
    const screenLifeTime = lifecycle.own(new Terminator())
    const compactMedia = window.matchMedia(CompactMode.Query)
    const render = () => {
        screenLifeTime.terminate()
        const screen = service.layout.screen.getValue()
        const compact = compactMedia.matches
        Html.empty(main)
        if (compact && screen !== null && screen !== "dashboard") {
            main.appendChild(CompactWorkspace({lifecycle: screenLifeTime, service}))
        } else {
            WorkspaceBuilder.buildScreen(screenLifeTime, service.panelLayout, main, screen, service.roomAwareness)
        }
    }
    lifecycle.ownAll(
        service.layout.screen.catchupAndSubscribe(render),
        {
            terminate: () => {
                compactMedia.removeEventListener("change", render)
            }
        }
    )
    compactMedia.addEventListener("change", render)
    return <div className={className}>{main}</div>
}
