import {AudioUnitType, Colors} from "@opendaw/studio-enums"
import {TrackType} from "../timeline/TrackType"
import {Color} from "@opendaw/lib-std"

export namespace ColorCodes {
    export const forAudioType = (type?: AudioUnitType): Color => {
        switch (type) {
            case AudioUnitType.Output:
                return Colors.blue
            case AudioUnitType.Aux:
                return Colors.purple
            case AudioUnitType.Bus:
                return Colors.orange
            case AudioUnitType.Instrument:
                return Colors.green
            default:
                return Colors.dark
        }
    }

    export const forTrackType = (type?: TrackType): number => {
        switch (type) {
            case TrackType.Audio:
                return 187
            case TrackType.Notes:
                return 309
            case TrackType.Value:
                return 158
            default:
                return 252
        }
    }
}
