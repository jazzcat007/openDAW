import {describe, expect, it} from "vitest"
import {fileURLToPath} from "url"
import * as path from "node:path"
import * as fs from "node:fs"
import {Observer, Option, panic, Subscription, Terminable, UUID} from "@opendaw/lib-std"
import {AudioData} from "@opendaw/lib-dsp"
import {Peaks} from "@opendaw/lib-fusion"
import {Xml} from "@opendaw/lib-xml"
import {FileReferenceSchema} from "@opendaw/lib-dawproject"
import {
    DeviceBoxUtils,
    ProjectSkeleton,
    SampleLoader,
    SampleLoaderManager,
    SampleLoaderState
} from "@opendaw/studio-adapters"
import {UnknownAudioEffectDeviceBox, UnknownMidiEffectDeviceBox} from "@opendaw/studio-boxes"
import {DawProjectExporter} from "./DawProjectExporter"
import {DawProjectImport} from "./DawProjectImporter"
import {DawProject} from "./DawProject"

describe("DawProject openDAW-to-openDAW device roundtrip", () => {
    it("recreates native devices instead of falling back to Unknown FX", async () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const projectPath = "../../../../../test-files/all-devices.od"
        const buffer = fs.readFileSync(path.join(__dirname, projectPath))
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        const skeleton = ProjectSkeleton.decode(arrayBuffer)

        const originalDeviceCount = skeleton.boxGraph.boxes()
            .filter(DeviceBoxUtils.isDeviceBox).length
        expect(originalDeviceCount).toBeGreaterThan(0)

        const sampleManager = new class implements SampleLoaderManager {
            record(_loader: SampleLoader & { uuid: UUID.Bytes }): void {throw new Error("Method not implemented.")}
            getOrCreate(format: UUID.Bytes): SampleLoader {
                return new class implements SampleLoader {
                    data: Option<AudioData> = Option.None
                    peaks: Option<Peaks> = Option.None
                    uuid: UUID.Bytes = format
                    state: SampleLoaderState = {type: "progress", progress: 0.0}
                    meta: Option<any> = Option.None
                    invalidate(): void {throw new Error("Method not implemented.")}
                    subscribe(_observer: Observer<SampleLoaderState>): Subscription {return Terminable.Empty}
                }
            }
            remove(_uuid: UUID.Bytes): void {return panic("Method not implemented.")}
            invalidate(_uuid: UUID.Bytes): void {return panic("Method not implemented.")}
            register(_uuid: UUID.Bytes): Terminable {return Terminable.Empty}
        }

        const resourceBuffers = new Map<string, ArrayBufferLike>()
        const schema = DawProjectExporter.write(skeleton, sampleManager, {
            write: (writePath: string, writeBuffer: ArrayBufferLike): FileReferenceSchema => {
                resourceBuffers.set(writePath, writeBuffer)
                return Xml.element({path: writePath, external: false}, FileReferenceSchema)
            }
        })

        const resources: DawProject.ResourceProvider = {
            fromPath: (resourcePath: string) => ({
                uuid: UUID.generate(),
                path: resourcePath,
                name: resourcePath,
                buffer: (resourceBuffers.get(resourcePath) ?? panic(`Resource not found: ${resourcePath}`)) as ArrayBuffer
            }),
            fromUUID: () => panic("Not used in this test")
        }

        const {skeleton: reimported} = await DawProjectImport.read(schema, resources)
        const reimportedBoxes = reimported.boxGraph.boxes()

        const unknownDevices = reimportedBoxes
            .filter(box => box instanceof UnknownAudioEffectDeviceBox || box instanceof UnknownMidiEffectDeviceBox)
        expect(unknownDevices).toHaveLength(0)

        const reimportedDeviceCount = reimportedBoxes.filter(DeviceBoxUtils.isDeviceBox).length
        expect(reimportedDeviceCount).toBe(originalDeviceCount)

        reimportedBoxes
            .filter(DeviceBoxUtils.isDeviceBox)
            .forEach(box => expect(box.host.targetVertex.nonEmpty(), `${box.name} host pointer is unresolved`).toBe(true))
    })
})
