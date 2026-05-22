package api

import (
	"html/template"
	"net/http"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// SupabaseConfigured reports whether the controlplane is wired to a
// Supabase project (project_ref + anon_key both set). Required because
// the tenant login page POSTs from the browser straight to the project's
// auth endpoint — without the anon key the request is rejected.
func (h *Handler) SupabaseConfigured() bool {
	return strings.TrimSpace(h.Cfg.SupabaseProjectRef) != "" &&
		strings.TrimSpace(h.Cfg.SupabaseAnonKey) != ""
}

// tenantLoginTpl is the HTML served at <tenant>.<baseDomain>/login when the
// tenant is Supabase-backed. Browser-side it does three things:
//
//  1. POST email+password to https://<projectRef>.supabase.co/auth/v1/token?grant_type=password
//  2. Take the access_token from the response and stash it as a cookie
//     `sb-<projectRef>-auth-token` scoped to the WHOLE base domain so it's
//     readable across all tenant subdomains (the gateway already looks for
//     this exact cookie name in readSupabaseAccessToken).
//  3. window.location.assign(next) — the gateway re-evaluates auth on the
//     reload, now with the cookie present, and proxies to the launcher.
//
// The "Receber link mágico por email" button POSTs to the same project's
// /auth/v1/otp endpoint instead; the user gets an email with a one-click
// magic link that lands them logged in (Supabase sets the cookie itself on
// the verify redirect).
//
// Why inline HTML in Go instead of a separate React app: this page has to
// boot WITHOUT any prior auth, on a subdomain that the saas-admin SPA
// isn't deployed to, and ship in the same controlplane binary. Vanilla
// fetch + a few lines of JS is the smallest thing that works.
var tenantLoginTpl = template.Must(template.New("tenantLogin").Parse(`<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — {{.TenantName}}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; display: grid; place-items: center;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at 30% 20%, rgba(125,75,255,0.25), transparent 40%),
                  radial-gradient(circle at 75% 80%, rgba(54,102,255,0.22), transparent 38%),
                  #0a0c18;
      color: #e6e7f0;
    }
    .card {
      width: min(420px, calc(100% - 32px));
      padding: 32px 28px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      background: rgba(15,17,28,0.85);
      backdrop-filter: blur(20px);
      box-shadow: 0 30px 80px rgba(0,0,0,0.4);
    }
    h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
    .sub { margin: 0 0 24px; color: #8e90a8; font-size: 13px; }
    label { display:block; font-size: 12px; color: #9ea0bd; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; }
    input[type=email], input[type=password] {
      width: 100%; padding: 11px 14px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.03); color: #fff;
      font: inherit;
    }
    input:focus { outline: 2px solid rgba(139,92,246,0.6); outline-offset: 1px; border-color: transparent; }
    button {
      width: 100%; padding: 12px 16px; border-radius: 10px; border: 0;
      font: 600 14px/1 inherit; cursor: pointer; margin-top: 16px;
      background: linear-gradient(135deg, #7c4dff, #5b6dff);
      color: white;
      transition: transform 0.05s, opacity 0.15s;
    }
    button:hover:not(:disabled) { transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: wait; }
    button.secondary { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #c9cae0; margin-top: 10px; }
    .msg { margin: 14px 0 0; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
    .msg.err { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.35); color: #fecaca; }
    .msg.ok  { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.32); color: #bbf7d0; }
    .footer { margin-top: 18px; text-align: center; color: #6b6e88; font-size: 11px; }
  </style>
</head>
<body>
  <main class="card">
    <h1>{{.TenantName}}</h1>
    <p class="sub">Entre com seu e-mail e senha, ou peça um link mágico.</p>

    <form id="loginForm">
      <label for="email">E-mail</label>
      <input id="email" type="email" autocomplete="email" required>
      <label for="password">Senha</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <button id="submitBtn" type="submit">Entrar</button>
      <button id="magicBtn" type="button" class="secondary">Enviar link mágico por e-mail</button>
    </form>

    <div id="msg" class="msg" style="display:none"></div>
    <div class="footer">Painel privado — acesso somente para usuários autorizados.</div>
  </main>

<script>
(function(){
  var PROJECT = {{.SupabaseProjectRef}};
  var ANON    = {{.SupabaseAnonKey}};
  var COOKIE_DOMAIN = {{.CookieDomain}};   // e.g. ".jotaduo.com"
  var NEXT    = {{.Next}};                 // path-only, default "/"
  var AUTH_URL = "https://" + PROJECT + ".supabase.co/auth/v1";

  var msgEl = document.getElementById("msg");
  function showMsg(kind, text){
    msgEl.className = "msg " + kind;
    msgEl.textContent = text;
    msgEl.style.display = "block";
  }
  function setBusy(busy){
    document.getElementById("submitBtn").disabled = busy;
    document.getElementById("magicBtn").disabled = busy;
  }

  // Set the cookie the controlplane looks for. NOT HttpOnly because we
  // need to write it from JS — Supabase's hosted UI does the same. The
  // gateway treats this as a bearer token (validated server-side every
  // request), so a leak via XSS would still be bounded by Supabase's
  // token TTL (default 1h, refresh handled by re-login or magic link).
  function setAuthCookie(accessToken, expiresInSec){
    var name = "sb-" + PROJECT + "-auth-token";
    var maxAge = expiresInSec || 3600;
    var attrs = "; Max-Age=" + maxAge + "; Path=/; SameSite=Lax; Secure";
    if (COOKIE_DOMAIN) attrs += "; Domain=" + COOKIE_DOMAIN;
    document.cookie = name + "=" + encodeURIComponent(accessToken) + attrs;
  }

  // Clear any stale picoclaw_magic cookie. If the user previously arrived
  // via a magic link, the cookie is per-host (no Domain attr on the original
  // Set-Cookie), so it would silently downgrade this real Supabase login to
  // a role=public magic visitor. The gateway also defends against this
  // server-side, but clearing here keeps the cookie jar tidy.
  function clearMagicCookie(){
    document.cookie = "picoclaw_magic=; Max-Age=0; Path=/; SameSite=Lax";
  }

  // Supabase magic-link callback. The OTP verify endpoint redirects to
  // <our redirect_to>#access_token=...&refresh_token=...&expires_in=...&type=magiclink
  // (implicit flow). The hash isn't sent to the server, so we have to
  // process it client-side: parse the access_token, write the cookie,
  // clean the URL, then redirect to NEXT. If something looks off (wrong
  // type, missing token), we just fall through to the regular login form.
  (function handleMagicCallback(){
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    var params = new URLSearchParams(hash.substring(1));
    // Supabase puts errors in the hash too (e.g. expired link → otp_expired).
    if (params.get("error")){
      showMsg("err", "Link mágico: " + (params.get("error_description") || params.get("error")));
      try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (_e) {}
      return;
    }
    var token = params.get("access_token");
    if (!token) return;
    var ttl = parseInt(params.get("expires_in"), 10) || 3600;
    clearMagicCookie();
    setAuthCookie(token, ttl);
    // Clean the hash so a back/forward navigation doesn't leak the token
    // into history. Then go to the intended destination.
    try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (_e) {}
    window.location.assign(NEXT);
  })();

  document.getElementById("loginForm").addEventListener("submit", async function(ev){
    ev.preventDefault();
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    if (!email || !password){ showMsg("err", "Preencha e-mail e senha."); return; }
    setBusy(true);
    try {
      var resp = await fetch(AUTH_URL + "/token?grant_type=password", {
        method: "POST",
        headers: { "apikey": ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      });
      var body = await resp.json();
      if (!resp.ok || !body.access_token){
        showMsg("err", body.error_description || body.msg || ("Falha no login (HTTP " + resp.status + ")"));
        return;
      }
      clearMagicCookie();
      setAuthCookie(body.access_token, body.expires_in || 3600);
      window.location.assign(NEXT);
    } catch (e) {
      showMsg("err", "Erro de rede: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  });

  document.getElementById("magicBtn").addEventListener("click", async function(){
    var email = document.getElementById("email").value.trim();
    if (!email){ showMsg("err", "Digite seu e-mail primeiro."); return; }
    setBusy(true);
    try {
      // Send the user BACK to this same /login page after they click the
      // email link. That way the hash-callback handler above can finish
      // the auth dance (write the cookie, then navigate to NEXT). Sending
      // them to "/" directly would lose the access_token because the
      // root has no handler for the implicit-flow hash params.
      var callbackURL = window.location.origin + "/login?next=" + encodeURIComponent(NEXT);
      var resp = await fetch(AUTH_URL + "/otp", {
        method: "POST",
        headers: { "apikey": ANON, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          create_user: false,
          options: { email_redirect_to: callbackURL },
        }),
      });
      if (resp.ok){
        showMsg("ok", "Link mágico enviado para " + email + ". Confere a caixa (e o spam).");
      } else {
        var body = await resp.json().catch(function(){ return {}; });
        showMsg("err", body.error_description || body.msg || ("Falha (HTTP " + resp.status + ")"));
      }
    } catch (e) {
      showMsg("err", "Erro de rede: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  });
})();
</script>
</body>
</html>`))

// serveTenantLogin renders the per-tenant Supabase login HTML. Inputs are
// all server-side validated (no user input goes into the template raw —
// strings are passed as data via {{.X}} and html/template auto-escapes).
func (h *Handler) serveTenantLogin(w http.ResponseWriter, r *http.Request, t *store.Tenant) {
	next := strings.TrimSpace(r.URL.Query().Get("next"))
	if next == "" || !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") {
		// Only allow same-origin path redirects. Anything weird → "/".
		next = "/"
	}
	cookieDomain := ""
	if base := strings.TrimSpace(h.Cfg.TenantBaseDomain); base != "" {
		// Set on .base so the cookie is visible on ALL tenant subdomains
		// (single sign-on across tenants for the same Supabase user).
		cookieDomain = "." + strings.TrimPrefix(base, ".")
	}
	name := t.DisplayName
	if name == "" {
		name = t.Subdomain
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = tenantLoginTpl.Execute(w, map[string]any{
		"TenantName":         name,
		"SupabaseProjectRef": h.Cfg.SupabaseProjectRef,
		"SupabaseAnonKey":    h.Cfg.SupabaseAnonKey,
		"CookieDomain":       cookieDomain,
		"Next":               next,
	})
}
