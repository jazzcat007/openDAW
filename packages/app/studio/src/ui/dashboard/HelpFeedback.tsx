import {createElement, RouteLocation} from "@opendaw/lib-jsx"
import {IconSymbol} from "@opendaw/studio-enums"
import {Icon} from "@/ui/components/Icon"
import {RailSection} from "@/ui/dashboard/RailSection"

export const HelpFeedback = () => (
    <RailSection title="Help & Feedback" vertical={true}>
        <button className="link" onclick={() => RouteLocation.get().navigateTo("/preferences")}>
            <Icon symbol={IconSymbol.System}/><span>Preferences</span>
        </button>
        <button className="link" onclick={() => RouteLocation.get().navigateTo("/manuals/")}>
            <Icon symbol={IconSymbol.Book}/><span>Manuals</span>
        </button>
        <a className="link" href="/docs/scripting/" target="_blank" rel="noopener noreferrer">
            <Icon symbol={IconSymbol.Code}/><span>Scripting Docs</span>
        </a>
    </RailSection>
)
