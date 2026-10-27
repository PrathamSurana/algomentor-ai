from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CodeforcesUser(Base):
    __tablename__ = "codeforces_users"

    handle_key: Mapped[str] = mapped_column(String(24), primary_key=True)
    handle: Mapped[str] = mapped_column(String(24), nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer)
    rank: Mapped[str | None] = mapped_column(String(40))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_from: Mapped[int | None] = mapped_column(Integer)


class Problem(Base):
    __tablename__ = "codeforces_problems"

    contest_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    problem_index: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer)
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    solved_count: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Submission(Base):
    __tablename__ = "codeforces_submissions"

    submission_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    handle_key: Mapped[str] = mapped_column(
        String(24), ForeignKey("codeforces_users.handle_key"), primary_key=True
    )
    contest_id: Mapped[int | None] = mapped_column(Integer)
    problem_index: Mapped[str] = mapped_column(String(10), nullable=False)
    verdict: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rating_at_import: Mapped[int | None] = mapped_column(Integer)
    tags_at_import: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)


class RoadmapProgress(Base):
    __tablename__ = "roadmap_progress"

    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    milestone_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CodeReview(Base):
    __tablename__ = "code_reviews"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    problem_context: Mapped[str | None] = mapped_column(Text)
    contest_id: Mapped[int | None] = mapped_column(Integer)
    problem_index: Mapped[str | None] = mapped_column(String(10))
    problem_title: Mapped[str | None] = mapped_column(String(300))
    feedback: Mapped[dict] = mapped_column(JSON, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class LinkedPlatformAccount(Base):
    __tablename__ = "linked_platform_accounts"

    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    platform: Mapped[str] = mapped_column(String(20), primary_key=True)
    username: Mapped[str] = mapped_column(String(40), nullable=False)
    username_key: Mapped[str] = mapped_column(String(40), nullable=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    sync_error: Mapped[str | None] = mapped_column(String(300))


class CodeforcesRatingChange(Base):
    __tablename__ = "codeforces_rating_changes"

    handle_key: Mapped[str] = mapped_column(String(24), primary_key=True)
    contest_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contest_name: Mapped[str] = mapped_column(String(300), nullable=False)
    rated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    old_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    new_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer)


class RoadmapChallenge(Base):
    __tablename__ = "roadmap_challenges"

    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    topic_key: Mapped[str] = mapped_column(String(50), primary_key=True)
    tier: Mapped[str] = mapped_column(String(20), primary_key=True)
    contest_id: Mapped[int] = mapped_column(Integer, nullable=False)
    problem_index: Mapped[str] = mapped_column(String(10), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
