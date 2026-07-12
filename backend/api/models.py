from pydantic import BaseModel
from typing import Optional, List


class ManualEvent(BaseModel):
    title      : str
    event_date : str                        # DD MMM YYYY — NFR-5
    event_time : Optional[str] = ""
    event_end_time : Optional[str] = ""      # end of a time range, else blank
    venue      : Optional[str] = ""
    attendees  : Optional[str] = ""
    ref_number : Optional[str] = ""
    deadline   : Optional[str] = ""
    reply_by   : Optional[str] = ""
    priority   : Optional[str] = "Medium"  # Low / Medium / High / Critical
    category   : Optional[str] = "General" # Meeting / Reply / Review / Personal
    classification : Optional[str] = None
    reminders  : Optional[List[str]] = ["1day", "1hour", "15min"]
    # FR-20 recurrence (optional)
    recurrence : Optional[str] = None       # daily / weekly / monthly / yearly
    interval   : Optional[int] = 1
    end_date   : Optional[str] = None        # DD MMM YYYY or YYYY-MM-DD
    end_count  : Optional[int] = None        # number of occurrences


class ConfirmItem(BaseModel):
    job_id     : int
    item_index : int
    title      : str
    event_date : Optional[str] = ""
    event_time : Optional[str] = ""
    event_end_time : Optional[str] = ""
    venue      : Optional[str] = ""
    attendees  : Optional[str] = ""
    ref_number : Optional[str] = ""
    deadline   : Optional[str] = ""
    reply_by   : Optional[str] = ""
    due_date   : Optional[str] = ""
    reminders  : Optional[List[str]] = ["1day", "1hour", "15min"]
    item_type  : Optional[str] = "event"    # "event" or "task"
    priority   : Optional[str] = "Medium"
    category   : Optional[str] = "General"


class DismissItem(BaseModel):
    job_id     : int
    item_index : int


class SearchRequest(BaseModel):
    q         : str
    from_date : Optional[str] = None
    to_date   : Optional[str] = None
    status    : Optional[str] = None
    top_k     : Optional[int] = 10


class ManualTask(BaseModel):
    title    : str
    due_date : Optional[str] = ""
    start_time: Optional[str] = ""
    end_time : Optional[str] = ""
    priority : Optional[str] = "Medium"
    category : Optional[str] = "General"
    # Optional recurrence — spawns repeated task instances (no series table).
    recurrence : Optional[str] = None    # daily | weekly | monthly
    interval   : Optional[int] = 1
    count      : Optional[int] = None    # number of occurrences (including the first)


class EventUpdate(BaseModel):
    title      : Optional[str] = None
    event_date : Optional[str] = None
    event_time : Optional[str] = None
    event_end_time : Optional[str] = None
    venue      : Optional[str] = None
    attendees  : Optional[str] = None
    priority   : Optional[str] = None
    category   : Optional[str] = None
    reminders  : Optional[List[str]] = None


class TaskUpdate(BaseModel):
    title    : Optional[str] = None
    due_date : Optional[str] = None
    start_time: Optional[str] = None
    end_time : Optional[str] = None
    status   : Optional[str] = None
    priority : Optional[str] = None
    category : Optional[str] = None
