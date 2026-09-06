from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ReviewStatus = Literal["not_requested", "requested", "received", "no_review", "skipped"]
ReviewPlatform = Literal["google", "thumbtack", "facebook", "other"]


class ReviewFields(BaseModel):
    review_status: ReviewStatus = "not_requested"
    review_requested_at: datetime | None = None
    review_received_at: datetime | None = None
    review_rating: int | None = None
    review_platform: ReviewPlatform | None = None


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["requested", "received", "no_review", "skipped"]
    rating: int | None = Field(default=None, ge=1, le=5, strict=True)
    platform: ReviewPlatform | None = None

    @model_validator(mode="after")
    def validate_review(self):
        if self.status == "received" and (self.rating is None or self.platform is None):
            raise ValueError("A received review requires rating and platform")
        if self.status != "received" and (self.rating is not None or self.platform is not None):
            raise ValueError("Rating and platform only apply to a received review")
        return self
