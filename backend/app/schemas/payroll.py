import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models.enums import MaterialsPaidBy


class PayrollTaskOut(BaseModel):
    task_id: uuid.UUID
    task_number: str
    completed_at: datetime
    completed_date: date
    customer_name: str
    labor_price: Decimal
    materials_cost: Decimal
    materials_paid_by: MaterialsPaidBy
    payout_percent: Decimal | None
    labor_earnings: Decimal | None
    materials_reimbursement: Decimal | None
    total_payout: Decimal | None


class HandymanPayrollOut(BaseModel):
    handyman_id: uuid.UUID
    handyman_name: str
    completed_jobs: int
    calculated_jobs: int
    payout_not_set: int
    labor_revenue: Decimal
    labor_earnings: Decimal
    materials_reimbursement: Decimal
    total_payout: Decimal
    tasks: list[PayrollTaskOut]


class WeeklyPayrollOut(BaseModel):
    timezone: str
    week_start: date
    week_end: date
    handymen: list[HandymanPayrollOut]
