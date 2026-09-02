// Minimal, framework-free login/setup/invite gate. Runs before the rest of boot() so no audio/engine
// work starts for an unauthenticated visitor. Plain DOM only, since the JSX/Surface stack is not
// initialized yet at this point in boot.

const CsrfHeader = {"X-OpenDAW-Csrf": "1"}

type AuthMeResponse = { authenticated: boolean, setupRequired?: boolean }
type InviteCheckResponse = { valid: boolean, role?: string }

const checkAuth = (): Promise<AuthMeResponse> => fetch("/api/auth/me")
    .then(response => response.ok ? response.json() : {authenticated: false})
    .catch(() => ({authenticated: false}))

const checkInvite = (token: string): Promise<InviteCheckResponse> =>
    fetch(`/api/auth/invite/${encodeURIComponent(token)}`)
        .then(response => response.ok ? response.json() : {valid: false})
        .catch(() => ({valid: false}))

type Mode = "login" | "setup" | { invite: string }

const renderGate = (mode: Mode, invalidInvite: boolean): void => {
    document.querySelector("#preloader")?.remove()
    const isInvite = typeof mode === "object"
    const isSetup = mode === "setup"
    const headline = isInvite || isSetup ? "Create Account" : "Sign In"
    const errorLine = document.createElement("div")
    errorLine.style.cssText = "color:hsl(345,90%,65%);min-height:1.2em;font-size:0.9em"
    if (invalidInvite) {errorLine.textContent = "This invite link is invalid or has expired."}
    const form = document.createElement("form")
    form.style.cssText = "display:flex;flex-direction:column;gap:0.75em;width:min(320px,90vw)"
    form.innerHTML = `
        <h1 style="font-size:1.4em;margin:0 0 0.25em 0">${headline}</h1>
        <input name="username" placeholder="Username" autocomplete="username" required
            style="padding:0.6em;background:transparent;border:1px solid currentColor;color:inherit;border-radius:4px">
        <input name="password" type="password" placeholder="Password" minlength="8" required
            autocomplete="${isInvite || isSetup ? "new-password" : "current-password"}"
            style="padding:0.6em;background:transparent;border:1px solid currentColor;color:inherit;border-radius:4px">
        <button type="submit"
            style="padding:0.6em;background:hsl(187,100%,63%);color:hsl(258,42%,7%);border:none;border-radius:4px;font-weight:600;cursor:pointer">
            ${headline}
        </button>`
    form.appendChild(errorLine)
    form.addEventListener("submit", async event => {
        event.preventDefault()
        errorLine.textContent = ""
        const data = new FormData(form)
        const username = data.get("username")
        const password = data.get("password")
        const [url, body] = isInvite
            ? ["/api/auth/register", {token: mode.invite, username, password}]
            : isSetup
                ? ["/api/auth/setup", {username, password}]
                : ["/api/auth/login", {username, password}]
        const response = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json", ...CsrfHeader},
            body: JSON.stringify(body)
        }).catch(() => null)
        if (response?.ok) {
            history.replaceState(null, "", location.pathname)
            location.reload()
            return
        }
        const json = await response?.json().catch(() => null)
        errorLine.textContent = json?.error ?? "Something went wrong. Please try again."
    })
    const container = document.createElement("div")
    container.style.cssText = "display:flex;align-items:center;justify-content:center;height:100vh;font-family:Rubik,sans-serif"
    container.appendChild(form)
    document.body.appendChild(container)
}

// Returns true once a valid session exists. Renders a login/setup/invite-registration form and
// returns false otherwise, so boot() can stop before doing any further work.
export const ensureAuthenticated = async (): Promise<boolean> => {
    const {authenticated, setupRequired} = await checkAuth()
    if (authenticated) {return true}
    const inviteToken = new URLSearchParams(location.search).get("invite")
    if (inviteToken !== null) {
        const {valid} = await checkInvite(inviteToken)
        if (valid) {
            renderGate({invite: inviteToken}, false)
            return false
        }
        renderGate(setupRequired === true ? "setup" : "login", true)
        return false
    }
    renderGate(setupRequired === true ? "setup" : "login", false)
    return false
}

