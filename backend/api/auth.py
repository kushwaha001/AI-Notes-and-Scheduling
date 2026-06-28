"""
v2 authentication — Keycloak / OIDC.

Validates Keycloak-issued RS256 access tokens against the realm's published
public keys (JWKS) and resolves them to a *local* user row, JIT-provisioning the
identity on first login. Use the `current_user` dependency in routes:

    from api.auth import current_user, CurrentUser

    @router.get("/events")
    def list_events(user: CurrentUser = Depends(current_user)):
        ...  user["id"]  is the owner to scope queries by

When AUTH_ENABLED is false (config), the dependency short-circuits to the seeded
"default" user (id 1) so the app runs single-user with no Keycloak — same as v1.
This is important for dev and for any air-gapped box where Keycloak is not up
(NFR-9: features degrade, the app never hard-breaks).
"""

import logging
from typing import Optional, TypedDict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.config import (
    AUTH_ENABLED, KEYCLOAK_ISSUER, KEYCLOAK_JWKS_URL,
    KEYCLOAK_CLIENT_ID, KEYCLOAK_VERIFY_AUD,
)
from api.db import get_db

log = logging.getLogger(__name__)

DEFAULT_USER_ID = 1   # seeded 'default' user — owns all legacy single-user data


class CurrentUser(TypedDict):
    id: int
    username: str
    email: Optional[str]
    role: str
    sub: Optional[str]
    roles: list


# Don't auto-error on a missing header — we want to allow the AUTH_ENABLED=false
# path through and to return our own 401 message otherwise.
_bearer = HTTPBearer(auto_error=False)

# PyJWKClient fetches + caches the realm signing keys; created lazily so the app
# still imports/starts even if Keycloak is unreachable at boot.
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        from jwt import PyJWKClient
        _jwks_client = PyJWKClient(KEYCLOAK_JWKS_URL)
    return _jwks_client


def _decode_token(token: str) -> dict:
    """Verify signature/issuer/expiry and return the token claims, or raise 401."""
    import jwt
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=KEYCLOAK_ISSUER,
            audience=KEYCLOAK_CLIENT_ID if KEYCLOAK_VERIFY_AUD else None,
            options={
                "verify_aud": KEYCLOAK_VERIFY_AUD,
                "require": ["exp", "iat", "sub"],
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.info("Token rejected: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _roles_from_claims(claims: dict) -> list:
    """Flatten Keycloak realm + client roles into a simple list."""
    roles = list((claims.get("realm_access") or {}).get("roles", []) or [])
    client = (claims.get("resource_access") or {}).get(KEYCLOAK_CLIENT_ID) or {}
    roles += list(client.get("roles", []) or [])
    return roles


def _provision_user(claims: dict) -> CurrentUser:
    """Map a verified Keycloak identity to a local users row (create/update)."""
    sub = claims.get("sub")
    username = (claims.get("preferred_username")
               or claims.get("email") or sub or "unknown")
    email = claims.get("email")
    display = claims.get("name") or username
    roles = _roles_from_claims(claims)
    role = "admin" if ("admin" in roles or "udaan-admin" in roles) else "user"

    conn = get_db()
    cur = conn.cursor()
    try:
        # Upsert on keycloak_sub; username may collide so we don't key on it.
        cur.execute(
            """
            INSERT INTO users (username, keycloak_sub, email, display_name, role, last_login)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (keycloak_sub) DO UPDATE
               SET email        = EXCLUDED.email,
                   display_name = EXCLUDED.display_name,
                   role         = EXCLUDED.role,
                   last_login   = NOW()
            RETURNING id, username, email, role, keycloak_sub
            """,
            (username, sub, email, display, role),
        )
        row = cur.fetchone()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "role": row["role"],
        "sub": row["keycloak_sub"],
        "roles": roles,
    }


def _default_user() -> CurrentUser:
    return {
        "id": DEFAULT_USER_ID,
        "username": "default",
        "email": None,
        "role": "admin",
        "sub": None,
        "roles": ["admin"],
    }


def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> CurrentUser:
    """FastAPI dependency → the authenticated local user (owner for scoping)."""
    if not AUTH_ENABLED:
        return _default_user()
    if creds is None or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = _decode_token(creds.credentials)
    return _provision_user(claims)


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """Dependency for admin-only routes (system/audit/backup)."""
    if user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin privileges required")
    return user
