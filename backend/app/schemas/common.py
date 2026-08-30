from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    """The list envelope from SPEC §5: {items, total, page, page_size}."""

    items: list[T]
    total: int
    page: int
    page_size: int
