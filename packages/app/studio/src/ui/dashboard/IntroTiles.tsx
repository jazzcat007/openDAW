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
        title: "Make a racket",
        text: "Guitars, synths, a mixer, MIDI and recording — one neon lair in your browser. Start with a blank "
            + "tape or raid a demo and make it quack.",
        path: "/manuals/introduction"
    },
    {
        icon: IconSymbol.Tape,
        title: "Pass the tape",
        text: "Export a Project Bundle, fling it to a pal, and let them open it whenever life allows. No matching "
            + "schedules, no polite little calendar squares.",
        path: "/manuals/project-management"
    },
    {
        icon: IconSymbol.Book,
        title: "Jam live when ducks align",
        text: "When the flock is actually online, open a Live Room and make noise in the same project — with a link "
            + "just for your crew.",
        path: "/manuals/live-rooms"
    },
    {
        icon: IconSymbol.Lock,
        title: "Keep your tapes greasy",
        text: "Projects live in your private vault. Keep a local backup, use your own cloud, or pass a complete bundle "
            + "hand to hand like a very loud mixtape.",
        path: "/privacy"
    },
    {
        icon: IconSymbol.Code,
        title: "Hack the Rig",
        text: "Built on the open-source openDAW engine. Tear it apart, fork it, build new boxes and extensions.",
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
