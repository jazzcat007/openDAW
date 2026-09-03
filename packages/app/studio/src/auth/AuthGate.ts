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

const GateStyles = `
  .metal-duck-gate {
    --cyan: #42e8ff;
    --pink: #ff2dbf;
    --orange: #ff9d24;
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    overflow: auto;
    padding: 32px 20px;
    color: #f6f3ff;
    background:
      radial-gradient(circle at 18% 18%, rgba(0, 224, 255, 0.17), transparent 30%),
      radial-gradient(circle at 82% 76%, rgba(255, 0, 174, 0.17), transparent 32%),
      linear-gradient(145deg, #05040d 0%, #110820 48%, #070510 100%);
    font-family: Rubik, system-ui, sans-serif;
  }
  .metal-duck-gate::before {
    content: "";
    position: fixed;
    inset: 48% -20% -35%;
    opacity: 0.2;
    transform: perspective(420px) rotateX(58deg);
    transform-origin: top;
    background-image:
      linear-gradient(rgba(66, 232, 255, 0.34) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 45, 191, 0.28) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
  }
  .metal-duck-gate__card {
    position: relative;
    width: min(430px, 92vw);
    padding: 30px;
    overflow: hidden;
    border: 1px solid rgba(66, 232, 255, 0.3);
    border-radius: 18px;
    background: linear-gradient(165deg, rgba(29, 20, 47, 0.96), rgba(8, 7, 18, 0.97));
    box-shadow:
      0 28px 90px rgba(0, 0, 0, 0.65),
      0 0 38px rgba(66, 232, 255, 0.09),
      inset 0 1px rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(18px);
  }
  .metal-duck-gate__card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: linear-gradient(90deg, var(--cyan), var(--pink), var(--orange));
    box-shadow: 0 0 18px rgba(255, 45, 191, 0.7);
  }
  .metal-duck-gate__logo {
    display: block;
    width: min(330px, 100%);
    height: auto;
    margin: -8px auto 8px;
    filter: drop-shadow(0 0 16px rgba(66, 232, 255, 0.16));
  }
  .metal-duck-gate__eyebrow {
    margin-bottom: 7px;
    color: var(--cyan);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .metal-duck-gate h1 {
    margin: 0;
    color: #fff;
    font-size: clamp(1.65rem, 6vw, 2.15rem);
    font-weight: 750;
    letter-spacing: -0.025em;
  }
  .metal-duck-gate__subtitle {
    margin: 7px 0 22px;
    color: rgba(235, 230, 246, 0.68);
    font-size: 0.94rem;
    line-height: 1.45;
  }
  .metal-duck-gate__form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .metal-duck-gate__field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .metal-duck-gate__field label {
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .metal-duck-gate__field input {
    width: 100%;
    padding: 13px 14px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    outline: none;
    color: inherit;
    background: rgba(0, 0, 0, 0.28);
    font: inherit;
    user-select: text;
    -webkit-user-select: text;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }
  .metal-duck-gate__field input::placeholder { color: rgba(255, 255, 255, 0.3); }
  .metal-duck-gate__field input:hover { border-color: rgba(255, 255, 255, 0.26); }
  .metal-duck-gate__field input:focus {
    border-color: var(--cyan);
    background: rgba(0, 0, 0, 0.38);
    box-shadow: 0 0 0 3px rgba(66, 232, 255, 0.12), 0 0 20px rgba(66, 232, 255, 0.08);
  }
  .metal-duck-gate__error {
    min-height: 1.25em;
    color: #ff7898;
    font-size: 0.86rem;
    line-height: 1.35;
    opacity: 0;
  }
  .metal-duck-gate__submit {
    position: relative;
    padding: 13px 16px;
    border: 0;
    border-radius: 10px;
    cursor: pointer;
    color: #080611;
    background: linear-gradient(100deg, var(--cyan), #78ffd7);
    box-shadow: 0 0 24px rgba(66, 232, 255, 0.2);
    font: inherit;
    font-weight: 800;
    letter-spacing: 0.015em;
    transition: transform 100ms ease, filter 160ms ease, box-shadow 160ms ease;
  }
  .metal-duck-gate__submit:hover {
    filter: brightness(1.07);
    box-shadow: 0 0 34px rgba(66, 232, 255, 0.32);
    transform: translateY(-1px);
  }
  .metal-duck-gate__submit:active { transform: translateY(1px); }
  .metal-duck-gate__submit:focus-visible { outline: 2px solid var(--pink); outline-offset: 3px; }
  .metal-duck-gate__submit:disabled { cursor: wait; filter: saturate(0.45); opacity: 0.72; transform: none; }
  .metal-duck-gate__footer {
    margin-top: 20px;
    color: rgba(255, 255, 255, 0.34);
    font-size: 0.68rem;
    letter-spacing: 0.11em;
    text-align: center;
    text-transform: uppercase;
  }
  @media (max-width: 520px) {
    .metal-duck-gate { align-items: start; padding: 18px 12px; }
    .metal-duck-gate__card { padding: 24px 20px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .metal-duck-gate *, .metal-duck-gate *::before { transition: none !important; }
  }
`

const renderGate = (mode: Mode, invalidInvite: boolean): void => {
    document.querySelector("#preloader")?.remove()
    const isInvite = typeof mode === "object"
    const isSetup = mode === "setup"
    const inviteToken = typeof mode === "object" ? mode.invite : null
    const headline = isInvite ? "Join the Flock" : isSetup ? "Build the Nest" : "Enter the Lair"
    const subhead = isInvite
      ? "Your invite checks out. Pick a handle and claim your perch."
      : isSetup
        ? "Create the first admin account and fire up the private studio."
        : "Crew only. Sign in to Metal-Duck Studio."
    const action = isInvite ? "Claim Your Perch" : isSetup ? "Fire Up the Studio" : "Enter the Studio"

    const styles = document.createElement("style")
    styles.textContent = GateStyles

    const overlay = document.createElement("div")
    overlay.className = "metal-duck-gate"

    const card = document.createElement("div")
    card.className = "metal-duck-gate__card"
    card.setAttribute("role", "dialog")
    card.setAttribute("aria-modal", "true")
    card.setAttribute("aria-labelledby", "metal-duck-auth-title")

    const logo = document.createElement("img")
    logo.className = "metal-duck-gate__logo"
    logo.src = "/images/metal-duck-studio-logo-600.webp"
    logo.alt = "Metal-Duck Studio"

    const eyebrow = document.createElement("div")
    eyebrow.className = "metal-duck-gate__eyebrow"
    eyebrow.textContent = isInvite ? "Invite verified // Access pending" : isSetup ? "First boot // Admin setup" : "Private rig // Authorized crew"

    const title = document.createElement("h1")
    title.id = "metal-duck-auth-title"
    title.textContent = headline

    const subtitle = document.createElement("div")
    subtitle.className = "metal-duck-gate__subtitle"
    subtitle.textContent = subhead

    const form = document.createElement("form")
    form.className = "metal-duck-gate__form"

    const mkInput = (name: string, type: "text" | "password", labelText: string, placeholder: string) => {
      const wrap = document.createElement("div")
      wrap.className = "metal-duck-gate__field"
      const label = document.createElement("label")
      label.htmlFor = `metal-duck-auth-${name}`
      label.textContent = labelText
      const input = document.createElement("input")
      input.id = label.htmlFor
      input.name = name
      input.type = type
      input.placeholder = placeholder
      input.required = true
      input.minLength = type === "password" ? 8 : 3
      input.autocomplete = type === "password"
        ? isInvite || isSetup ? "new-password" : "current-password"
        : "username"
      input.spellcheck = false
      wrap.append(label, input)
      return {wrap, input}
    }

    const username = mkInput("username", "text", "Studio handle", "Your handle")
    const password = mkInput("password", "password", "Passphrase", "8+ characters")
    form.append(username.wrap, password.wrap)

    const errorLine = document.createElement("div")
    errorLine.className = "metal-duck-gate__error"
    errorLine.setAttribute("role", "alert")
    errorLine.setAttribute("aria-live", "polite")
    if (invalidInvite) {
      errorLine.textContent = "That backstage pass is invalid or has expired."
      errorLine.style.opacity = "1"
    }

    const btn = document.createElement("button")
    btn.className = "metal-duck-gate__submit"
    btn.type = "submit"
    btn.textContent = action

    form.appendChild(errorLine)
    form.appendChild(btn)

    form.addEventListener("submit", async event => {
      event.preventDefault()
      errorLine.style.opacity = "0"
      errorLine.textContent = ""
      btn.disabled = true
      const orig = btn.textContent
      btn.textContent = "Tuning the lasers…"

      const data = new FormData(form)
      const usernameValue = String(data.get("username") || "")
      const passwordValue = String(data.get("password") || "")
      const [url, body] = isInvite
        ? ["/api/auth/register", {token: inviteToken, username: usernameValue, password: passwordValue}]
        : isSetup
          ? ["/api/auth/setup", {username: usernameValue, password: passwordValue}]
          : ["/api/auth/login", {username: usernameValue, password: passwordValue}]
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
      errorLine.textContent = json?.error ?? "The gate jammed. Give it another hit."
      errorLine.style.opacity = "1"
      btn.disabled = false
      btn.textContent = orig
    })

    const footer = document.createElement("div")
    footer.className = "metal-duck-gate__footer"
    footer.textContent = "Powered by openDAW // Guarded by Metal Duck"

    card.append(logo, eyebrow, title, subtitle, form, footer)
    overlay.appendChild(card)
    document.head.appendChild(styles)
    document.body.appendChild(overlay)
    username.input.focus()
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

