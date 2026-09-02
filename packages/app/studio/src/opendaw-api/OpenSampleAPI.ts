import {
    asDefined,
    isDefined,
    Lazy,
    panic,
    Procedure,
    TimeSpan,
    unitValue,
    UUID
} from "@opendaw/lib-std"
import {IntervalRetryOption, network, Promises} from "@opendaw/lib-runtime"
import {Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {SampleAPI} from "@opendaw/studio-core"
import {OpenDAWHeaders} from "./OpenDAWHeaders"
import {SampleIndex} from "./SampleIndex"
import {AudioData, WavFile} from "@opendaw/lib-dsp"

// Standard openDAW samples (considered to be non-removable)
export class OpenSampleAPI implements SampleAPI {
    static readonly FileRoot = "/factory/samples"
    static readonly IndexFile = `${OpenSampleAPI.FileRoot}/index.json`

    @Lazy
    static get(): OpenSampleAPI {return new OpenSampleAPI()}

    // A publish must reach users on their next load, and nothing about that may depend on how a browser
    // interprets caching: the query makes every load a distinct URL, `no-cache` covers the rest.
    readonly #headers: RequestInit = {...OpenDAWHeaders, cache: "no-cache"}
    // The published index is the catalogue. A failure rejects rather than degrading to something emptier,
    // so the browser shows its retry instead of an empty list, and `memoizeAsync` drops the rejection.
    readonly #memoized: () => Promise<SampleIndex> = Promises.memoizeAsync(() =>
        Promises.retry(() => network.limitFetch(`${OpenSampleAPI.IndexFile}?v=${Date.now()}`, this.#headers),
            new IntervalRetryOption(3, TimeSpan.seconds(1)))
            .then(response => response.ok ? response.json() : panic(`${response.status} ${response.statusText}`))
            .then(json => SampleIndex.schema.parse(json)))

    private constructor() {}

    async tree(): Promise<SampleIndex> {return this.#memoized()}

    async all(): Promise<ReadonlyArray<Sample>> {return SampleIndex.flatten(await this.#memoized())}

    async get(uuid: UUID.Bytes): Promise<Sample> {
        const uuidAsString = UUID.toString(uuid)
        const known = (await this.all()).find(sample => sample.uuid === uuidAsString)
        if (isDefined(known)) {return known}
        return panic(`Sample not found in local factory: ${uuidAsString}`)
    }

    async load(uuid: UUID.Bytes, progress: Procedure<unitValue>): Promise<[AudioData, Sample]> {
        console.debug(`load ${UUID.toString(uuid)}`)
        return this.get(uuid)
            .then(({uuid, name, bpm}) => Promises.retry(() => network
                .limitFetch(`${OpenSampleAPI.FileRoot}/${uuid}`, OpenDAWHeaders))
                .then(response => {
                    if (!response.ok) {
                        return panic(`Failed to fetch sample ${uuid}: ${response.status} ${response.statusText}`)
                    }
                    const total = parseInt(response.headers.get("Content-Length") ?? "0")
                    let loaded = 0
                    return new Promise<ArrayBuffer>((resolve, reject) => {
                        const reader = asDefined(response.body, "No body in response").getReader()
                        const chunks: Array<Uint8Array> = []
                        const nextChunk = ({done, value}: ReadableStreamReadResult<Uint8Array>) => {
                            if (done) {
                                resolve(new Blob(chunks as Array<BlobPart>).arrayBuffer())
                            } else {
                                chunks.push(value)
                                loaded += value.length
                                progress(loaded / total)
                                reader.read().then(nextChunk, reject)
                            }
                        }
                        reader.read().then(nextChunk, reject)
                    })
                })
                .then(arrayBuffer => {
                    const audioData = WavFile.decodeFloats(arrayBuffer)
                    return [audioData, {
                        uuid,
                        bpm,
                        name,
                        duration: audioData.numberOfFrames / audioData.sampleRate,
                        sample_rate: audioData.sampleRate,
                        origin: "openDAW"
                    }] as [AudioData, Sample]
                }))
    }

    async upload(arrayBuffer: ArrayBuffer, metaData: SampleMetaData): Promise<void> {
        void arrayBuffer
        void metaData
        return panic("Sample uploads to opendaw.studio are disabled in this self-contained build.")
    }

    allowsUpload(): boolean {return false}
}
