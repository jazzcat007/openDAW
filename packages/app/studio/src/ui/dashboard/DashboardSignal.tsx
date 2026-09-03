import css from "./DashboardSignal.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {Html} from "@opendaw/lib-dom"
import {createElement, replaceChildren} from "@opendaw/lib-jsx"

const className = Html.adoptStyleSheet(css, "DashboardSignal")
const storageKey = "dashboard-signal-deck-v1"

type Signal = { headline: string, body: string }
type StoredDeck = { queue: number[], last: number | null }

const signals: ReadonlyArray<Signal> = [
    {headline: "GEN X, NO X-FACTOR.", body: "You already survived mixtapes, bad rehearsal rooms, and dubious record-store advice. Drop a beat and trust your ears."},
    {headline: "REMEMBER WHEN YOU WEREN'T A BITCH?", body: "They're still in there — probably under the inbox, the back stretches, and the mysteriously expensive car maintenance. Make something loud."},
    {headline: "DROP ONE GOOD THING.", body: "Eight bars counts. One filthy bassline counts. A snare that makes the dog leave the room definitely counts."},
    {headline: "THE BAND CAN'T REHEARSE THURSDAY.", body: "Dave has pickleball. Somebody has a parent-teacher conference. Pass the tape and make it anyway."},
    {headline: "SIDE A NEEDS YOUR STANK.", body: "Open the handoff, add one part, save it, and let the next duck take the wheel when they escape real life."},
    {headline: "MAKE THE SONG YOU KEEP LOOKING FOR.", body: "The one with the too-loud toms, the suspiciously emotional synth, and absolutely no focus group."},
    {headline: "YOUR KNEES MAY POP. THE DRUMS SHOULD TOO.", body: "No need for a four-hour session. Leave a beat now; the flock can finish the racket later."},
    {headline: "A BASSLINE IS A LOVE LETTER.", body: "Send one to your people. They can answer after the school run, the night shift, or the compact-SUV research."},
    {headline: "DON'T WAIT FOR THE VIBE TO SCHEDULE YOU.", body: "Start a project, make a little trouble, and pass a complete bundle to the next conspirator."},
    {headline: "THE BASEMENT STILL REMEMBERS.", body: "So do your hands. Make a loop, turn it up, and give tomorrow's version of you something to chase."},
    {headline: "YOUR MIXTAPE HAD A THESIS.", body: "So can this track. Make the opening move, pass it along, and let the next old punk add the dangerous bit."},
    {headline: "NO FINISHED TRACKS REQUIRED.", body: "Hooks, loops, breakbeats, half-songs, and beautiful little disasters are all welcome in the tape pile."},
    {headline: "LEAVE THE DOOR OPEN FOR A SOLO.", body: "Someone you trust can add the weird guitar at midnight and hand the whole beast back when they're done."}
]

const shuffledIndexes = (): number[] => {
    const indexes = signals.map((_, index) => index)
    for (let index = indexes.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1))
        ;[indexes[index], indexes[swap]] = [indexes[swap], indexes[index]]
    }
    return indexes
}

const nextSignal = (): Signal => {
    let deck: StoredDeck
    try {
        deck = JSON.parse(localStorage.getItem(storageKey) ?? "") as StoredDeck
        if (!Array.isArray(deck.queue)) {throw new Error("Invalid signal deck")}
    } catch {
        deck = {queue: [], last: null}
    }
    if (deck.queue.length === 0) {
        deck.queue = shuffledIndexes()
        if (deck.queue[0] === deck.last) {[deck.queue[0], deck.queue[1]] = [deck.queue[1], deck.queue[0]]}
    }
    const index = deck.queue.shift()!
    deck.last = index
    localStorage.setItem(storageKey, JSON.stringify(deck))
    return signals[index]
}

export const DashboardSignal = ({lifecycle}: { lifecycle: Lifecycle }) => (
    <div className={className} onInit={element => {
        const render = () => {
            const {headline, body} = nextSignal()
            replaceChildren(
                element,
                <div className="signal-headline">{headline}</div>,
                <div className="signal-body">{body}</div>
            )
        }
        render()
        const interval = window.setInterval(render, 18_000)
        lifecycle.own({terminate: () => window.clearInterval(interval)})
    }}/>
)
