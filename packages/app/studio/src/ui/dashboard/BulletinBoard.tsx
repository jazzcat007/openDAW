import css from "./BulletinBoard.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {createElement} from "@opendaw/lib-jsx"
import {IconSymbol} from "@opendaw/studio-enums"
import {Icon} from "@/ui/components/Icon"
import {StudioService} from "@/service/StudioService"
import {connectRoom} from "@/service/StudioLiveRoomConnect"

const className = Html.adoptStyleSheet(css, "BulletinBoard")

type Construct = { service: StudioService }

type Notice = {
    tag: string
    title: string
    body: string
    meta: string
    tone: "hot" | "fresh" | "open"
}

const notices: ReadonlyArray<Notice> = [
    {
        tag: "NEW CALLER",
        title: "Looking for a late-night collaborator",
        body: "Start a live room, share the link, and build something together in real time.",
        meta: "The sysop left the line open for you.",
        tone: "hot"
    },
    {
        tag: "MSG BASE",
        title: "Show us what is living on your timeline",
        body: "Trade sketches, swap techniques, or bring a half-finished loop for fresh ears.",
        meta: "C*Base mood. AmiExpress manners. All signal, no gatekeeping.",
        tone: "fresh"
    },
    {
        tag: "UPLOAD QUEUE",
        title: "Help shape the next box",
        body: "Find a bug, pitch a feature, or pick up an open-source thread from the project board.",
        meta: "Small fixes and strange ideas both welcome.",
        tone: "open"
    }
]

export const BulletinBoard = ({service}: Construct) => (
    <section className={className} aria-label="Community bulletin board">
        <header className="board-head">
            <div>
                <div className="eyebrow"><span className="live-dot"/>openDAW BBS · node 01 · 38,400 baud</div>
                <h2>THE BULLETIN BOARD</h2>
                <p>Dial in. Find a collaborator, a room to join, or one good reason to make some noise.</p>
            </div>
            <button className="post-button" onclick={() => connectRoom(service)}>
                <Icon symbol={IconSymbol.Connected}/><span>Broadcast a jam</span>
            </button>
        </header>
        <div className="board-grid">
            <div className="notices">
                {notices.map(({tag, title, body, meta, tone}) => (
                    <article className="notice">
                        <div className={`notice-tag ${tone}`}>[{tag}]</div>
                        <div className="notice-copy">
                            <h3>{title}</h3>
                            <p>{body}</p>
                            <div className="notice-meta">{meta}</div>
                        </div>
                        <Icon symbol={IconSymbol.ArrowRight}/>
                    </article>
                ))}
            </div>
            <aside className="board-side">
                <div className="side-title">/// Sysop's chores</div>
                <button className="todo" onclick={() => service.newProject()}>
                    <span className="todo-mark">01</span>
                    <span><strong>Start a fresh sketch</strong><small>Blank tape, no pressure.</small></span>
                    <Icon symbol={IconSymbol.New}/>
                </button>
                <a className="todo" href="https://github.com/jazzcat007/openDAW/issues" target="_blank" rel="noopener noreferrer">
                    <span className="todo-mark">02</span>
                    <span><strong>Browse the workbench</strong><small>Find bugs, ideas, and open work.</small></span>
                    <Icon symbol={IconSymbol.Github}/>
                </a>
                <a className="todo" href="https://github.com/jazzcat007/openDAW/issues/new?template=feature_request.yml" target="_blank" rel="noopener noreferrer">
                    <span className="todo-mark">03</span>
                    <span><strong>Pin up an idea</strong><small>Request a feature or start a conversation.</small></span>
                    <Icon symbol={IconSymbol.Add}/>
                </a>
            </aside>
        </div>
        <footer className="board-footer">
            <span>SYSOP: METAL-DUCK</span>
            <span>MSG BASE: OPEN</span>
            <span>NO CARRIER? NEVER.</span>
        </footer>
    </section>
)
