from fastapi import FastAPI

from api import documents
from api import events
from api import tasks

app = FastAPI()

app.include_router(documents.router)
app.include_router(events.router)
app.include_router(tasks.router)