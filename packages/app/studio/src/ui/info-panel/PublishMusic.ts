import {ProjectProfile} from "@opendaw/studio-core"
import {panic, Procedure, Progress} from "@opendaw/lib-std"

export namespace PublishMusic {
    export const publishMusic = async (profile: ProjectProfile, progress: Progress.Handler, log: Procedure<string>): Promise<string> => {
        void profile
        progress(1)
        log("Remote OpenDAW music publishing is disabled in this self-contained build.")
        return panic("Remote OpenDAW music publishing is disabled in this self-contained build.")
    }

    export const deleteMusic = async (token: string): Promise<void> => {
        void token
        return panic("Remote OpenDAW music publishing is disabled in this self-contained build.")
    }
}
