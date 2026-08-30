from app.schemas.auth import LoginRequest, TokenPair
from app.schemas.common import Paginated
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.schemas.dashboard import DashboardStats, ScheduleRow, StatusCounts
from app.schemas.handyman import HandymanCreate, HandymanOut, HandymanUpdate
from app.schemas.task import (
    AssignRequest,
    SetStatusRequest,
    TaskCreate,
    TaskOut,
    TaskStatusHistoryOut,
    TaskUpdate,
)
from app.schemas.user import UserOut

__all__ = [
    "AssignRequest",
    "CustomerCreate",
    "CustomerOut",
    "CustomerUpdate",
    "DashboardStats",
    "HandymanCreate",
    "HandymanOut",
    "HandymanUpdate",
    "LoginRequest",
    "Paginated",
    "ScheduleRow",
    "SetStatusRequest",
    "StatusCounts",
    "TaskCreate",
    "TaskOut",
    "TaskStatusHistoryOut",
    "TaskUpdate",
    "TokenPair",
    "UserOut",
]
