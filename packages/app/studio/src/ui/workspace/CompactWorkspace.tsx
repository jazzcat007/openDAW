import css from "./CompactWorkspace.sass?inline"
import {Icon} from "@/ui/components/Icon"
import {PanelState} from "@/ui/workspace/PanelState"
import {PanelType} from "@/ui/workspace/PanelType"
import {PanelPlaceholder} from "@/ui/workspace/PanelPlaceholder"
import {StudioService} from "@/service/StudioService"
import {IconSymbol} from "@opendaw/studio-enums"
import {Html} from "@opendaw/lib-dom"
import {createElement, replaceChildren} from "@opendaw/lib-jsx"
import {Lifecycle, Terminator} from "@opendaw/lib-std"

const className = Html.adoptStyleSheet(css, "CompactWorkspace")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

type CompactPanel = {
    name: string
    icon: IconSymbol
    type: PanelType
}

const Panels: ReadonlyArray<CompactPanel> = [
    {name: "Timeline", icon: IconSymbol.Timeline, type: PanelType.Timeline},
    {name: "Browser", icon: IconSymbol.Panel, type: PanelType.BrowserPanel},
    {name: "Devices", icon: IconSymbol.Flask, type: PanelType.DevicePanel},
    {name: "Mixer", icon: IconSymbol.Mixing, type: PanelType.Mixer}
]

const panelState = ({name, icon, type}: CompactPanel): PanelState => PanelState.create({
    type: "panel",
    name,
    icon,
    panelType: type,
    notMinimizable: true,
    notPopoutable: true,
    constrains: {type: "flex", minSize: 0, flex: 1}
})

export const CompactWorkspace = ({lifecycle, service}: Construct): HTMLElement => {
    const panelLifecycle = lifecycle.own(new Terminator())
    const stage: HTMLElement = <main className="stage"/>
    let activeType = PanelType.Timeline

    const buttons = Panels.map(panel => {
        const button: HTMLButtonElement = (
            <button type="button" aria-label={panel.name} onclick={() => show(panel)}>
                <Icon symbol={panel.icon}/>
                <span>{panel.name}</span>
            </button>
        )
        return {panel, button}
    })

    const show = (panel: CompactPanel): void => {
        if (activeType === panel.type && stage.childElementCount > 0) {return}
        activeType = panel.type
        panelLifecycle.terminate()
        replaceChildren(stage, (
            <PanelPlaceholder lifecycle={panelLifecycle}
                              orientation="vertical"
                              siblings={[]}
                              panelContents={service.panelLayout}
                              panelState={panelState(panel)}
                              roomAwareness={service.roomAwareness}/>
        ))
        buttons.forEach(({panel: candidate, button}) => {
            const active = candidate.type === activeType
            button.classList.toggle("active", active)
            button.setAttribute("aria-current", active ? "page" : "false")
        })
    }

    const element: HTMLElement = (
        <section className={className}>
            {stage}
            <nav aria-label="Studio panels">{buttons.map(({button}) => button)}</nav>
        </section>
    )
    show(Panels[0])
    return element
}
