import css from "./UserProfilePage.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {StudioService} from "@/service/StudioService.ts"
import {PageFactory, PageContext} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {AdminApi} from "@/admin/AdminApi"
import {BackButton} from "@/ui/pages/BackButton"

const className = Html.adoptStyleSheet(css, "UserProfilePage")

export const UserProfilePage: PageFactory<StudioService> = async ({service}: PageContext<StudioService>) => {
    const me = await AdminApi.me()
    if (!me.authenticated) {
        return <div className={className}>
            <BackButton service={service}/>
            <h1>Profile</h1>
            <p>You must be signed in to view this page.</p>
        </div>
    }

    const errorLine: HTMLElement = <div className="error"/>
    const successLine: HTMLElement = <div className="success"/>

    const currentPasswordInput: HTMLInputElement = <input type="password" placeholder="Current password" required minlength="8"/> as HTMLInputElement
    const newPasswordInput: HTMLInputElement = <input type="password" placeholder="New password (min 8 chars)" required minlength="8"/> as HTMLInputElement
    const confirmPasswordInput: HTMLInputElement = <input type="password" placeholder="Confirm new password" required minlength="8"/> as HTMLInputElement

    const form: HTMLFormElement = <form onsubmit={async (event: Event) => {
        event.preventDefault()
        errorLine.textContent = ""
        successLine.textContent = ""
        
        if (newPasswordInput.value !== confirmPasswordInput.value) {
            errorLine.textContent = "New passwords do not match"
            return
        }

        try {
            await AdminApi.changePassword(currentPasswordInput.value, newPasswordInput.value)
            successLine.textContent = "Password changed. Sign in again to continue."
            currentPasswordInput.value = ""
            newPasswordInput.value = ""
            confirmPasswordInput.value = ""
        } catch (reason) {
            errorLine.textContent = reason instanceof Error ? reason.message : String(reason)
        }
    }}>
        <div className="field">
            <label>Username</label>
            <div className="readonly">{me.user?.username ?? ""}</div>
        </div>
        <div className="field">
            <label>Role</label>
            <div className="readonly">{me.user?.role ?? ""}</div>
        </div>
        <h3>Change Password</h3>
        <div className="field">
            <label>Current password</label>
            {currentPasswordInput}
        </div>
        <div className="field">
            <label>New password</label>
            {newPasswordInput}
        </div>
        <div className="field">
            <label>Confirm new password</label>
            {confirmPasswordInput}
        </div>
        <button type="submit">CHANGE PASSWORD</button>
        {errorLine}
        {successLine}
    </form>

    return (
        <div className={className}>
            <BackButton service={service}/>
            <h1>Profile</h1>
            <p>Signed in as <strong>{me.user?.username}</strong> ({me.user?.role})</p>
            {form}
        </div>
    )
}
