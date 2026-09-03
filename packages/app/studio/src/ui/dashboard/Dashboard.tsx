import css from "./Dashboard.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {Resources} from "@/ui/dashboard/Resources"
import {IntroTiles} from "@/ui/dashboard/IntroTiles"
import {ActionButtons} from "@/ui/dashboard/ActionButtons"
import {Backup} from "@/ui/dashboard/Backup"
import {Sponsors} from "@/ui/dashboard/Sponsors"
import {Contributors} from "@/ui/dashboard/Contributors"
import {SampleProviders} from "@/ui/dashboard/SampleProviders"
import {HelpFeedback} from "@/ui/dashboard/HelpFeedback"
import {Links} from "@/ui/dashboard/Links"
import {DashboardSignal} from "@/ui/dashboard/DashboardSignal"

const className = Html.adoptStyleSheet(css, "Dashboard")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const Dashboard = ({lifecycle, service}: Construct) => (
    <div className={className}>
        <div className="intro">
            <header className="hero">
                <img className="brand-logo" src="/images/metal-duck-studio-logo-600.webp"
                     alt="Metal-Duck Studio"/>
                <div className="brand-kicker">Private browser DAW · chipmunk punk / disco duck division</div>
                <div className="tagline">Mixtape muscle memory, browser magic. Start a racket whenever.</div>
            </header>
            <div className="welcome-note">
                <strong>Make music together without getting the whole Gen X band out of bed.</strong>
                <span>Build a banger in your browser, stash it in the private vault, then pass a Project Bundle to
                    the next duck. They add their weird little part whenever the moon is right — between the school
                    run, the back stretches, and an extremely serious conversation about compact SUVs.</span>
            </div>
            <DashboardSignal lifecycle={lifecycle}/>
            <ActionButtons lifecycle={lifecycle} service={service}/>
        </div>
        <div className="main">
            <div className="panel">
                <Resources lifecycle={lifecycle} service={service}/>
            </div>
            <div className="rail">
                <HelpFeedback/>
                <Backup service={service}/>
                <Sponsors/>
                <SampleProviders/>
            </div>
        </div>
        <IntroTiles/>
    </div>
)
