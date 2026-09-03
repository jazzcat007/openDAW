import css from "./IntroTiles.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {createElement, RouteLocation} from "@opendaw/lib-jsx"
import {IconSymbol} from "@opendaw/studio-enums"
import {Icon} from "@/ui/components/Icon"

const className = Html.adoptStyleSheet(css, "IntroTiles")

type Tile = {
    icon: IconSymbol
    title: string
    text: string
    path: string
}

const tiles: ReadonlyArray<Tile> = [
    {
        icon: IconSymbol.Timeline,
        title: "The Lair",
        text: "Guitars, synths, a mixer, MIDI and audio recording — all in one neon-lit room. Build tracks from "
            + "scratch and make 'em loud.",
        path: "/manuals/introduction"
    },
    {
        icon: IconSymbol.Connected,
        title: "Jam Rooms",
        text: "Fire up a room, bring the crew in, and play together live. Same session, same vibe, real time.",
        path: "/manuals/live-rooms"
    },
    {
        icon: IconSymbol.Book,
        title: "House Rules",
        text: "Invite-only. Friends and family. No randoms. Your tapes stay in the vault with full history.",
        path: "/manuals/education"
    },
    {
        icon: IconSymbol.Lock,
        title: "Locked Down",
        text: "Metal-Duck's private rig. Invite-only access, server-backed, no public peeking.",
        path: "/privacy"
    },
    {
        icon: IconSymbol.Code,
        title: "Hack the Rig",
        text: "openDAW's open source. Tear it apart, fork it, build your own boxes and extensions. Make it yours.",
        path: "/manuals/open-source"
    }
]

export const IntroTiles = () => (
    <div className={className}>
        <div className="tiles">
            {tiles.map(({icon, title, text, path}) => (
                <div className="tile" onclick={() => RouteLocation.get().navigateTo(path)}>
                    <div className="tile-head">
                        <Icon symbol={icon}/>
                        <div className="tile-title">{title}</div>
                    </div>
                    <div className="tile-text">{text}</div>
                    <div className="tile-link">{path}</div>
                </div>
            ))}
        </div>
    </div>
)