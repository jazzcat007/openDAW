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
    const subhead = isInvite
      ? "You’ve been invited to join this studio"
      : isSetup
        ? "Create the first admin account"
        : "Sign in to openDAW"

    const overlay = document.createElement("div")
    overlay.style.cssText = `
      position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(10,10,14,0.75); backdrop-filter:blur(8px);
      font-family:Rubik,sans-serif; color:#e8e8ee; z-index:9999;
    `

    const card = document.createElement("div")
    card.style.cssText = `
      width:min(380px,92vw); padding:28px 24px; border-radius:16px;
      background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
      border:1px solid rgba(255,255,255,0.08); box-shadow:0 20px 60px rgba(0,0,0,0.45);
      display:flex; flex-direction:column; gap:14px;
    `

    const title = document.createElement("h1")
    title.textContent = headline
    title.style.cssText = "margin:0; font-size:1.6em; font-weight:700; letter-spacing:0.2px"

    const subtitle = document.createElement("div")
    subtitle.textContent = subhead
    subtitle.style.cssText = "margin:0 0 6px 0; opacity:0.75; font-size:0.95em"

    const form = document.createElement("form")
    form.style.cssText = "display:flex; flex-direction:column; gap:12px"

    const mkInput = (name: string, type: string, placeholder: string) => {
      const wrap = document.createElement("div")
      wrap.style.cssText = "position:relative"
      const input = document.createElement("input")
      input.name = name
      input.type = type
      input.placeholder = placeholder
      input.required = true
      input.minLength = type === "password" ? 8 : 3
      input.autocomplete = isInvite || isSetup ? "new-password" : type === "password" ? "current-password" : "username"
      input.style.cssText = `
        width:100%; padding:12px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.14);
        background:rgba(0,0,0,0.25); color:inherit; font-size:1rem; outline:none; transition:border .2s, box-shadow .2s;
      `
      input.addEventListener("focus", () => {
        input.style.borderColor = "hsl(187,100%,63%)"
        input.style.boxShadow = "0 0 0 3px rgba(77,246,208,0.15)"
      })
      input.addEventListener("blur", () => {
        input.style.borderColor = "rgba(255,255,255,0.14)"
        input.style.boxShadow = "none"
      })
      wrap.appendChild(input)
      return wrap
    }

    form.appendChild(mkInput("username", "text", "Username"))
    form.appendChild(mkInput("password", "password", "Password"))

    const errorLine = document.createElement("div")
    errorLine.style.cssText = "color:hsl(345,90%,70%); min-height:1.2em; font-size:0.9em; opacity:0"
    if (invalidInvite) {
      errorLine.textContent = "This invite link is invalid or has expired."
      errorLine.style.opacity = "1"
    }

    const btn = document.createElement("button")
    btn.type = "submit"
    btn.textContent = headline
    btn.style.cssText = `
      padding:12px; border:none; border-radius:10px; font-weight:700; cursor:pointer;
      background:hsl(187,100%,63%); color:hsl(258,42%,7%);
      transition:transform .08s ease, filter .2s ease; font-size:1rem;
    `
    btn.addEventListener("mouseenter", () => btn.style.filter = "brightness(1.05)")
    btn.addEventListener("mouseleave", () => btn.style.filter = "none")
    btn.addEventListener("mousedown", () => btn.style.transform = "translateY(1px)")

    form.appendChild(errorLine)
    form.appendChild(btn)

    form.addEventListener("submit", async event => {
      event.preventDefault()
      errorLine.style.opacity = "0"
      errorLine.textContent = ""
      btn.disabled = true
      const orig = btn.textContent
      btn.textContent = "Please wait…"

      const data = new FormData(form)
      const username = String(data.get("username") || "")
      const password = String(data.get("password") || "")
      const [url, body] = isInvite
        ? ["/api/auth/register", {token: (mode as any).invite, username, password}]
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
      errorLine.style.opacity = "1"
      btn.disabled = false
      btn.textContent = orig
    })

    card.appendChild(title)
    card.appendChild(subtitle)
    card.appendChild(form)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
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

