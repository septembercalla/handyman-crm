from sqlalchemy import BigInteger, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TaskNumberCounter(Base):
    __tablename__ = "task_number_counter"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(BigInteger, nullable=False)
