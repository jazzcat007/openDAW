import css from "./DemoProjectsList.sass?inline"
import {Html} from "@opendaw/lib-dom"
import {Bytes, Lifecycle, Option, RuntimeNotifier} from "@opendaw/lib-std"
import {Await, createElement} from "@opendaw/lib-jsx"
import {Colors} from "@opendaw/studio-enums"
import {StudioService} from "@/service/StudioService"
import {ThreeDots} from "@/ui/spinner/ThreeDots"
import {DemoProjectJson} from "@/ui/dashboard/DemoProjectJson"
import {DemoProject} from "@/ui/dashboard/DemoProject"
import {network, Promises} from "@opendaw/lib-runtime"
import {ProjectBundle} from "@opendaw/studio-core"
import {installScrollbars} from "@/ui/components/Scrollbars"

const className = Html.adoptStyleSheet(css, "DemoProjectsList")

type TracksList = { tracks: Array<DemoProjectJson> }

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

// Self-hosted installations provision this catalog with `npm run import-demos`.
// Keeping the runtime URLs relative means demos work with an offline factory mirror.
const listUrl = "/factory/demos/projects.json"

const loadDemoProject = async (service: StudioService, json: DemoProjectJson) => {
    if (!await service.projectProfileService.approveLosingChanges()) {return}
    const approved = await RuntimeNotifier.approve({
        headline: "Install Demo Project",
        message: `Do you want to download the project bundle file (${Bytes.toString(json.bundleSize)})?`
    })
    if (!approved) {return}
    const dialog = RuntimeNotifier.progress({headline: "Loading Demo Project"})
    const {status, value: arrayBuffer, error} = await Promises.tryCatch(
        fetch(`/factory/demos/${json.id}/project.odb`)
            .then(network.progress(progress => dialog.message = `Downloading bundle file... (${(progress * 100).toFixed(1)}%)`))
            .then(response => response.arrayBuffer()))
    dialog.terminate()
    if (status === "rejected") {
        return RuntimeNotifier.info({headline: "Could not load bundle file", message: String(error)})
    }
    const {status: decodeStatus, value: profile, error: decodeError} =
        await Promises.tryCatch(ProjectBundle.decode(service, arrayBuffer))
    if (decodeStatus === "rejected") {
        return RuntimeNotifier.info({headline: "Could not decode bundle file", message: String(decodeError)})
    }
    const {status: saveStatus, error: saveError} = await Promises.tryCatch(profile.saveAs(profile.meta))
    if (saveStatus === "rejected") {
        await RuntimeNotifier.info({
            headline: "Storage Unavailable",
            message: `The demo project could not be saved to local storage (${String(saveError)}). It will open, but your changes will be lost when you close the tab.`
        })
    }
    service.projectProfileService.setValue(Option.wrap(profile))
}

export const DemoProjectsList = ({lifecycle, service}: Construct) => (
    <div className={className} onConnect={element => lifecycle.own(installScrollbars(element))}>
        <Await
            factory={() => fetch(listUrl)
                .then(response => response.json())
                .then(json => json as TracksList)
                .then(list => list.tracks)}
            loading={() => <div>{ThreeDots()}</div>}
            failure={({retry, reason}) => (
                <div style={{margin: "8px 0 0 4px", justifySelf: "center"}}>
                    <span>{reason}</span> <span onclick={retry}
                                                style={{color: Colors.orange.toString(), cursor: "pointer"}}>
                    Click to retry.</span>
                </div>
            )}
            success={(tracks) => tracks.map(json => (
                <DemoProject json={json} load={() => loadDemoProject(service, json)}/>
            ))}/>
    </div>
)
