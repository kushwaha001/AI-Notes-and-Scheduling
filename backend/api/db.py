import psycopg2
from psycopg2.extras import RealDictCursor
from api.config import DB_CONFIG

def get_db():
    """Return a new psycopg2 connection. Caller must close it."""
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)
