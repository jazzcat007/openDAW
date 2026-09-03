import css from "./PrivacyPage.sass?inline"
import {createElement, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {Colors} from "@opendaw/studio-enums"
import {installScrollbars} from "@/ui/components/Scrollbars"

const className = Html.adoptStyleSheet(css, "PrivacyPage")

export const PrivacyPage: PageFactory<StudioService> = ({lifecycle}: PageContext<StudioService>) => (
    <div className={className} onConnect={host => lifecycle.own(installScrollbars(host))}>
        <h1>House Rules</h1>
        <p style={{color: Colors.blue.toString()}}>This is Metal-Duck's private lair. Invite-only. No tourists. Your tapes stay in the vault.</p>
        <h3>The Vault</h3>
        <p>Your projects and samples live on the studio server with local cache for backup. Only invited crew get in.</p>
        <h3>Cloud Hookups</h3>
        <p>Hook up Google Drive or Dropbox if you want. OAuth's legit, tokens stay in your browser, nobody else sees 'em.</p>
        <h3>Data</h3>
        <p>No data mining, no tracking, no BS. Your files are yours. We don't touch 'em.</p>
        <h3>Contact</h3>
        <p>Questions? Talk to the duck. <a style={{color: Colors.blue}}
                                                        href="mailto:hello@opendaw.org">hello@opendaw.org</a>
        </p>
    </div>
)