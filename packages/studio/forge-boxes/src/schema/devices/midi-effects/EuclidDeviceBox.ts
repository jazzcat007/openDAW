import {BoxSchema} from "@opendaw/lib-box-forge"
import {Pointers} from "@opendaw/studio-enums"
import {ParameterPointerRules} from "../../std/Defaults"
import {DeviceFactory} from "../../std/DeviceFactory"

export const EuclidDeviceBox: BoxSchema<Pointers> = DeviceFactory.createMidiEffect("EuclidDeviceBox", {
    10: {
        type: "int32", name: "steps", pointerRules: ParameterPointerRules,
        value: 16, constraints: {min: 1, max: 64}, unit: ""
    },
    11: {
        type: "int32", name: "pulses", pointerRules: ParameterPointerRules,
        value: 4, constraints: {min: 0, max: 64}, unit: ""
    },
    12: {
        type: "int32", name: "rotation", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: -64, max: 64}, unit: ""
    },
    13: {
        type: "int32", name: "rate-index", pointerRules: ParameterPointerRules,
        value: 9, constraints: {length: 17}, unit: ""
    },
    14: {
        type: "float32", name: "gate", pointerRules: ParameterPointerRules,
        value: 0.75, constraints: {min: 0.0, max: 2.0, scaling: "linear"}, unit: ""
    },
    15: {
        type: "int32", name: "pitch", pointerRules: ParameterPointerRules,
        value: 60, constraints: {min: 0, max: 127}, unit: ""
    },
    16: {
        type: "float32", name: "velocity", pointerRules: ParameterPointerRules,
        value: 0.8, constraints: "unipolar", unit: "%"
    }
})
