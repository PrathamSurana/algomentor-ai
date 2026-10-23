from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: Literal["python", "cpp", "java"]
    code: str = Field(min_length=20, max_length=20000)
    problem_context: str | None = Field(default=None, max_length=4000)
    contest_id: int | None = Field(default=None, ge=1)
    problem_index: str | None = Field(default=None, pattern=r"^[A-Za-z][A-Za-z0-9]{0,9}$")

    @field_validator("code")
    @classmethod
    def nonblank_code(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Code must not be blank")
        return value

    @model_validator(mode="after")
    def check_problem_pair(self):
        if (self.contest_id is None) != (self.problem_index is None):
            raise ValueError("contest_id and problem_index must be supplied together")
        return self


class ComplexityEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    estimate: str = Field(min_length=1, max_length=160)
    reasoning: str = Field(min_length=1, max_length=1200)


class ReviewFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    approach_summary: str = Field(min_length=1, max_length=2000)
    time_complexity: ComplexityEstimate
    space_complexity: ComplexityEstimate
    potential_edge_cases: list[str] = Field(max_length=8)
    suggested_improvements: list[str] = Field(max_length=8)
    uncertainty_notes: list[str] = Field(max_length=8)

    @model_validator(mode="after")
    def check_list_items(self):
        for items in (
            self.potential_edge_cases,
            self.suggested_improvements,
            self.uncertainty_notes,
        ):
            if any(not item.strip() or len(item) > 800 for item in items):
                raise ValueError("Feedback list entries must be 1–800 characters")
        return self


class ReviewSummary(BaseModel):
    id: UUID
    language: Literal["python", "cpp", "java"]
    problem_title: str | None
    created_at: datetime
    approach_summary: str


class ReviewDetail(BaseModel):
    id: UUID
    language: Literal["python", "cpp", "java"]
    code: str
    problem_context: str | None
    contest_id: int | None
    problem_index: str | None
    problem_title: str | None
    feedback: ReviewFeedback
    provider: str
    model: str
    created_at: datetime


class ReviewHistory(BaseModel):
    reviews: list[ReviewSummary]
