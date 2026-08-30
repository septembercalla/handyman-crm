from pydantic import BaseModel

from app.schemas.handyman import HandymanOut
from app.schemas.task import TaskOut


class StatusCounts(BaseModel):
    new: int = 0
    assigned: int = 0
    in_progress: int = 0
    done: int = 0
    cancelled: int = 0


class DashboardStats(BaseModel):
    """GET /dashboard/stats — what the Home screen renders."""

    counts: StatusCounts
    done_today: int
    unassigned: int
    today: list[TaskOut]
    needs_assignment: list[TaskOut]


class ScheduleRow(BaseModel):
    """One row of GET /schedule: a handyman and their tasks for the day."""

    handyman: HandymanOut
    tasks: list[TaskOut]
