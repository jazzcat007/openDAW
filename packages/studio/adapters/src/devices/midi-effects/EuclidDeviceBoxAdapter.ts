import {EuclidDeviceBox} from "@opendaw/studio-boxes"
import {Pointers} from "@opendaw/studio-enums"
import {Address, BooleanField, Int32Field, PointerField, StringField} from "@opendaw/lib-box"
import {Fraction} from "@opendaw/lib-dsp"
import {StringMapping, UUID, ValueMapping} from "@opendaw/lib-std"
import {DeviceHost, Devices, MidiEffectDeviceAdapter} from "../../DeviceAdapter"
import {BoxAdaptersContext} from "../../BoxAdaptersContext"
import {DeviceManualUrls} from "../../DeviceManualUrls"
import {ParameterAdapterSet} from "../../ParameterAdapterSet"
import {AudioUnitBoxAdapter} from "../../audio-unit/AudioUnitBoxAdapter"

export class EuclidDeviceBoxAdapter implements MidiEffectDeviceAdapter {
    static RateFractions = Fraction.builder()
        .add([1, 1]).add([1, 2]).add([1, 3]).add([1, 4])
        .add([3, 16]).add([1, 6]).add([1, 8]).add([3, 32])
        .add([1, 12]).add([1, 16]).add([3, 64]).add([1, 24])
        .add([1, 32]).add([1, 48]).add([1, 64])
        .add([1, 96]).add([1, 128])
        .asDescendingArray()

    static RateStringMapping = StringMapping.indices("", this.RateFractions.map(([n, d]) => `${n}/${d}`))

    readonly type = "midi-effect"
    readonly accepts = "midi"
    readonly manualUrl = DeviceManualUrls.Euclid

    readonly #context: BoxAdaptersContext
    readonly #box: EuclidDeviceBox
    readonly #parametric: ParameterAdapterSet
    readonly namedParameter

    constructor(context: BoxAdaptersContext, box: EuclidDeviceBox) {
        this.#context = context
        this.#box = box
        this.#parametric = new ParameterAdapterSet(this.#context)
        this.namedParameter = this.#wrapParameters(box)
    }

    get box(): EuclidDeviceBox {return this.#box}
    get uuid(): UUID.Bytes {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get indexField(): Int32Field {return this.#box.index}
    get labelField(): StringField {return this.#box.label}
    get enabledField(): BooleanField {return this.#box.enabled}
    get minimizedField(): BooleanField {return this.#box.minimized}
    get host(): PointerField<Pointers.MIDIEffectHost> {return this.#box.host}

    deviceHost(): DeviceHost {
        return this.#context.boxAdapters
            .adapterFor(this.#box.host.targetVertex.unwrap("no device-host").box, Devices.isHost)
    }

    audioUnitBoxAdapter(): AudioUnitBoxAdapter {return this.deviceHost().audioUnitBoxAdapter()}

    terminate(): void {this.#parametric.terminate()}

    #wrapParameters(box: EuclidDeviceBox) {
        return {
            steps: this.#parametric.createParameter(
                box.steps,
                ValueMapping.linearInteger(1, 64),
                StringMapping.numeric({fractionDigits: 0}), "Steps"),
            pulses: this.#parametric.createParameter(
                box.pulses,
                ValueMapping.linearInteger(0, 64),
                StringMapping.numeric({fractionDigits: 0}), "Pulses"),
            rotation: this.#parametric.createParameter(
                box.rotation,
                ValueMapping.linearInteger(-64, 64),
                StringMapping.numeric({fractionDigits: 0}), "Rotate"),
            rate: this.#parametric.createParameter(
                box.rateIndex,
                ValueMapping.linearInteger(0, EuclidDeviceBoxAdapter.RateFractions.length - 1),
                EuclidDeviceBoxAdapter.RateStringMapping, "Rate"),
            gate: this.#parametric.createParameter(
                box.gate,
                ValueMapping.linear(0.0, 2.0),
                StringMapping.percent({fractionDigits: 0}), "Gate"),
            pitch: this.#parametric.createParameter(
                box.pitch,
                ValueMapping.linearInteger(0, 127),
                StringMapping.numeric({fractionDigits: 0}), "Pitch"),
            velocity: this.#parametric.createParameter(
                box.velocity,
                ValueMapping.unipolar(),
                StringMapping.percent({fractionDigits: 0}), "Velocity")
        } as const
    }
}
