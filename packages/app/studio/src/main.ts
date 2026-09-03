import "./main.sass"
import workersUrl from "@opendaw/studio-core/workers-main.js?worker&url"
import workletsUrl from "@opendaw/studio-core/processors.js?url"
import wasmProcessorUrl from "@opendaw/studio-core-wasm/wasm-processor.js?url"
import wasmOfflineWorkerUrl from "@opendaw/studio-core-wasm/wasm-offline-worker.js?worker&url"
import {boot} from "@/boot"
import {initializeColors} from "@opendaw/studio-enums"
import {Browser} from "@opendaw/lib-dom"

const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character] ?? character)

const showStartupError = (reason: unknown): void => {
    console.error("openDAW startup failed", reason)
    document.querySelector("#preloader")?.remove()
    const message = escapeHtml(reason instanceof Error ? reason.message : String(reason))
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2em;font-family:Rubik,system-ui,sans-serif;color:hsl(187,100%,63%);background:hsl(258,42%,7%)">
        <div style="width:min(520px,90vw)">
            <h1 style="font-size:1.4em;margin:0 0 0.75em 0">Startup failed</h1>
            <p style="line-height:1.5;color:white">openDAW could not finish loading. Reload the page and try again.</p>
            <pre style="white-space:pre-wrap;color:hsl(345,90%,65%);font-size:0.85em">${message}</pre>
        </div>
    </div>`
}

if (Browser.isMobile()) {
    document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;padding:2em;text-align:center;font-family:system-ui;color:#ccc;background:#1a1a1a">
        <div><h1>openDAW</h1><p>openDAW requires a desktop browser.<br>Please visit on a computer.</p></div>
    </div>`
} else if (window.crossOriginIsolated) {
    const now = Date.now()
    initializeColors(document.documentElement)
    boot({
        workersUrl,
        workletsUrl,
        wasmProcessorUrl,
        wasmOfflineWorkerUrl
    }).then(() => console.debug(`Booted in ${Math.ceil(Date.now() - now)}ms`), showStartupError)
} else {
    document.querySelector("#preloader")?.remove()
    alert("crossOriginIsolated must be enabled")
}
