import psycopg2
from psycopg2.extras import RealDictCursor
from api.config import DB_CONFIG

def get_db():
    """Return a new psycopg2 connection. Caller must close it.

    The session timezone is pinned to UTC so NOW()/CURRENT_* and every stored
    TIMESTAMP are UTC regardless of the host machine's clock. The frontend then
    converts these to IST (UTC+5:30) for display, so the app is correct even on
    a server whose OS/Postgres timezone isn't India."""
    return psycopg2.connect(
        **DB_CONFIG,
        cursor_factory=RealDictCursor,
        options="-c timezone=UTC",
    )
