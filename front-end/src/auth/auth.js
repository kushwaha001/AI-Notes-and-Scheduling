// v2 authentication (Keycloak / OIDC).
//
// The backend tells us at runtime whether auth is enabled (GET /auth/config).
//   • disabled -> we don't load Keycloak at all; the app runs single-user (v1).
//   • enabled  -> we initialise keycloak-js with login-required (PKCE), register
//                 a token provider with the API layer (auto-refreshing the
//                 access token), and expose the user + logout.
//
// keycloak-js is bundled at build time, so this works fully offline once the
// Keycloak server itself is reachable on the LAN.

import Keycloak from "keycloak-js";
import { getAuthConfig, setTokenProvider } from "../services/api";

let _kc = null;

// Env overrides let you point at Keycloak without a backend round-trip if
// desired; otherwise we use whatever /auth/config reports.
const ENV = {
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
};

export async function initAuth() {
  let cfg;
  try {
    cfg = await getAuthConfig();
  } catch {
    // Backend unreachable — fall back to no-auth so the UI still renders.
    return { enabled: false, user: null };
  }

  if (!cfg.auth_enabled) {
    return { enabled: false, user: null };
  }

  _kc = new Keycloak({
    url: ENV.url || cfg.url,
    realm: ENV.realm || cfg.realm,
    clientId: ENV.clientId || cfg.client_id,
  });

  const authenticated = await _kc.init({
    onLoad: "login-required",
    pkceMethod: "S256",
    checkLoginIframe: false,
  });

  if (!authenticated) {
    // init triggers a redirect to the login page; this branch is rarely hit.
    return { enabled: true, user: null };
  }

  // Always hand the API layer a fresh token (refresh if <30s of life left).
  setTokenProvider(async () => {
    try {
      await _kc.updateToken(30);
    } catch {
      _kc.login();
    }
    return _kc.token;
  });

  const t = _kc.tokenParsed || {};
  return {
    enabled: true,
    user: {
      username: t.preferred_username || t.email || "user",
      name: t.name || t.preferred_username || "user",
      email: t.email || null,
    },
  };
}

export function logout() {
  if (_kc) _kc.logout({ redirectUri: window.location.origin });
}
