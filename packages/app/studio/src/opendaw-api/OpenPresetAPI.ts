import {
    asDefined, isDefined, Lazy, panic, Procedure, unitValue, UUID
} from "@opendaw/lib-std"
import {network, Promises} from "@opendaw/lib-runtime"
import {OpenDAWHeaders} from "./OpenDAWHeaders"
import {PresetMeta} from "@opendaw/studio-core"

export class OpenPresetAPI {
    static readonly FileRoot = "/factory/presets"

    @Lazy
    static get(): OpenPresetAPI {return new OpenPresetAPI()}

    private constructor() {}

    @Lazy
    async list(): Promise<ReadonlyArray<PresetMeta>> {
        const url = `${OpenPresetAPI.FileRoot}/index.json?t=${Date.now()}`
        const result = await Promises.tryCatch(Promises.retry(() =>
            network.defaultFetch(url, OpenDAWHeaders).then(response => response.json())))
        if (result.status === "rejected") {
            console.warn("OpenPresetAPI.list fetch failed", url, result.error)
            return []
        }
        if (!Array.isArray(result.value)) {
            console.warn("OpenPresetAPI.list unexpected payload", result.value)
            return []
        }
        console.info(`OpenPresetAPI.list loaded ${result.value.length} cloud preset(s)`)
        return result.value as ReadonlyArray<PresetMeta>
    }

    async load(uuid: UUID.Bytes,
               progress?: Procedure<unitValue>,
               signal?: AbortSignal): Promise<ArrayBuffer> {
        const url = `${OpenPresetAPI.FileRoot}/${UUID.toString(uuid)}.odp`
        // Cancellable fetches skip the auto-retry: a user-cancelled download
        // must not silently retry after the dialog has already closed.
        const response = isDefined(signal)
            ? await network.limitFetch(url, {...OpenDAWHeaders, signal})
            : await Promises.retry(() => network.limitFetch(url, OpenDAWHeaders))
        if (!response.ok) {
            return panic(`Failed to fetch preset ${UUID.toString(uuid)}: ${response.status} ${response.statusText}`)
        }
        if (!isDefined(progress)) {return response.arrayBuffer()}
        const total = parseInt(response.headers.get("Content-Length") ?? "0")
        let loaded = 0
        return new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = asDefined(response.body, "No body in response").getReader()
            const chunks: Array<Uint8Array> = []
            const onAbort = () => reader.cancel().catch(() => {})
            if (isDefined(signal)) {signal.addEventListener("abort", onAbort, {once: true})}
            const cleanup = () => {
                if (isDefined(signal)) {signal.removeEventListener("abort", onAbort)}
            }
            const nextChunk = ({done, value}: ReadableStreamReadResult<Uint8Array>) => {
                if (done) {
                    cleanup()
                    resolve(new Blob(chunks as Array<BlobPart>).arrayBuffer())
                } else {
                    chunks.push(value)
                    loaded += value.length
                    progress(total > 0.0 ? loaded / total : 0.5)
                    reader.read().then(nextChunk, reason => {cleanup(); reject(reason)})
                }
            }
            reader.read().then(nextChunk, reason => {cleanup(); reject(reason)})
        })
    }

    async upload(arrayBuffer: ArrayBuffer, meta: PresetMeta): Promise<void> {
        void arrayBuffer
        void meta
        return panic("Preset uploads to opendaw.studio are disabled in this self-contained build.")
    }
}
