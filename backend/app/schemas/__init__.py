from app.schemas.auth import (
    ChangePasswordRequest,
    CompleteFirstLoginRequest,
    LoginRequest,
    TokenPair,
)
from app.schemas.common import Paginated
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.schemas.dashboard import (
    DashboardStats,
    ScheduleRow,
    ScheduleTravelOut,
    StatusCounts,
    TravelLegOut,
)
from app.schemas.handyman import (
    HandymanCreate,
    HandymanDocumentOut,
    HandymanOut,
    HandymanUpdate,
)
from app.schemas.payroll import HandymanPayrollOut, PayrollTaskOut, WeeklyPayrollOut
from app.schemas.task import (
    AssignRequest,
    SetStatusRequest,
    TaskCreate,
    TaskOut,
    TaskStatusHistoryOut,
    TaskUpdate,
)
from app.schemas.user import PasswordResetRequest, UserCreate, UserOut, UserUpdate

__all__ = [
    "AssignRequest",
    "ChangePasswordRequest",
    "CompleteFirstLoginRequest",
    "CustomerCreate",
    "CustomerOut",
    "CustomerUpdate",
    "DashboardStats",
    "HandymanCreate",
    "HandymanDocumentOut",
    "HandymanOut",
    "HandymanUpdate",
    "HandymanPayrollOut",
    "LoginRequest",
    "Paginated",
    "PasswordResetRequest",
    "PayrollTaskOut",
    "ScheduleRow",
    "ScheduleTravelOut",
    "SetStatusRequest",
    "StatusCounts",
    "TaskCreate",
    "TaskOut",
    "TaskStatusHistoryOut",
    "TaskUpdate",
    "TokenPair",
    "TravelLegOut",
    "UserOut",
    "UserCreate",
    "UserUpdate",
    "WeeklyPayrollOut",
]
