import css from "./OpenBundlePage.sass?inline"
import {createElement, PageContext, PageFactory} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "@opendaw/lib-dom"
import {RuntimeNotifier} from "@opendaw/lib-std"

const className = Html.adoptStyleSheet(css, "OpenBundlePage")

export const OpenBundlePage: PageFactory<StudioService> = ({service, path}: PageContext<StudioService>) => {
    const message: HTMLElement = <h5/>
    return (
        <div className={className} onInit={async (_element) => {
            void service
            void path
            message.textContent = "Remote bundle downloads are disabled in this self-contained build."
            return RuntimeNotifier.info({headline: "Bundle Unavailable", message: message.textContent})
        }}>{message}</div>
    )
}
