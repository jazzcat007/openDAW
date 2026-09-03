import css from "./Dashboard.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {Resources} from "@/ui/dashboard/Resources"
import {ActionButtons} from "@/ui/dashboard/ActionButtons"
import {Backup} from "@/ui/dashboard/Backup"
import {Sponsors} from "@/ui/dashboard/Sponsors"
import {Contributors} from "@/ui/dashboard/Contributors"
import {SampleProviders} from "@/ui/dashboard/SampleProviders"
import {HelpFeedback} from "@/ui/dashboard/HelpFeedback"
import {Links} from "@/ui/dashboard/Links"
import {BulletinBoard} from "@/ui/dashboard/BulletinBoard"

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
                <div className="brand-kicker">Private browser DAW · Community switchboard</div>
                <div className="tagline">Make something. Find your people. Leave a little noise behind.</div>
            </header>
            <ActionButtons lifecycle={lifecycle} service={service}/>
        </div>
        <div className="main">
            <div className="board-panel">
                <BulletinBoard service={service}/>
            </div>
            <div className="panel">
                <Resources lifecycle={lifecycle} service={service}/>
            </div>
            <div className="rail">
                <HelpFeedback/>
                <Backup service={service}/>
                <Links/>
                <Sponsors/>
                <SampleProviders/>
                <Contributors/>
            </div>
        </div>
    </div>
)
