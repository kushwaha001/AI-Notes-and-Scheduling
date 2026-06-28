"""
v2 auth endpoints.

  GET /auth/config — public; tells the frontend whether auth is enabled and the
                     Keycloak realm/client to initialise the login adapter with.
  GET /auth/me     — the current authenticated user (or the default user when
                     auth is disabled).
"""

from fastapi import APIRouter, Depends

from api.auth import current_user, CurrentUser
from api.config import (
    AUTH_ENABLED, KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID,
)

router = APIRouter(tags=["Auth"])


@router.get("/auth/config")
def auth_config():
    """Public bootstrap config for the frontend login adapter."""
    return {
        "auth_enabled": AUTH_ENABLED,
        "url": KEYCLOAK_URL,
        "realm": KEYCLOAK_REALM,
        "client_id": KEYCLOAK_CLIENT_ID,
    }


@router.get("/auth/me")
def me(user: CurrentUser = Depends(current_user)):
    return {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "role": user["role"],
        "roles": user["roles"],
    }
