from decimal import ROUND_HALF_UP, Decimal

from app.models.enums import MaterialsPaidBy

CENT = Decimal("0.01")
HUNDRED = Decimal("100")
ZERO = Decimal("0.00")


def money(value: Decimal | None) -> Decimal:
    return (value or ZERO).quantize(CENT, rounding=ROUND_HALF_UP)


def customer_total(labor_price: Decimal | None, materials_cost: Decimal | None) -> Decimal:
    return money(money(labor_price) + money(materials_cost))


def labor_earnings(
    labor_price: Decimal | None,
    payout_percent: Decimal | None,
) -> Decimal | None:
    if payout_percent is None:
        return None
    return money(money(labor_price) * payout_percent / HUNDRED)


def materials_reimbursement(
    materials_cost: Decimal | None,
    paid_by: MaterialsPaidBy,
) -> Decimal:
    return money(materials_cost) if paid_by is MaterialsPaidBy.handyman else ZERO


def total_handyman_payout(
    labor_price: Decimal | None,
    materials_cost: Decimal | None,
    paid_by: MaterialsPaidBy,
    payout_percent: Decimal | None,
) -> Decimal | None:
    earnings = labor_earnings(labor_price, payout_percent)
    if earnings is None:
        return None
    return money(
        earnings + materials_reimbursement(materials_cost, paid_by)
    )
