"""Authenticated Codeforces account linking and synchronization."""

from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.codeforces import HANDLE_PATTERN, CodeforcesClient, CodeforcesError, get_codeforces_client
from app.codeforces_service import sync_handle
from app.database import get_session
from app.models import CodeforcesRatingChange, CodeforcesUser, LinkedPlatformAccount
from app.platform_service import get_link, link_account

router = APIRouter(prefix="/platforms", tags=["platforms"])


class LinkRequest(BaseModel):
    username: str = Field(min_length=1, max_length=24, pattern=HANDLE_PATTERN.pattern)


class AccountSyncRequest(LinkRequest):
    mode: Literal["refresh", "continue"] = "refresh"


class LinkedAccountResponse(BaseModel):
    platform: Literal["codeforces"]
    username: str
    synced_at: datetime | None
    sync_status: str
    sync_error: str | None


class AccountsResponse(BaseModel):
    accounts: list[LinkedAccountResponse]


class AccountSyncResponse(BaseModel):
    handle: str
    new_submissions: int
    total_submissions: int
    has_more: bool
    synced_at: datetime
    rating_history_status: Literal["ready", "error"]


class RatingSyncResponse(BaseModel):
    contest_count: int


def _database_error(exc: SQLAlchemyError) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"code": "database_unavailable", "message": "Database is unavailable"},
    )


def _store_ratings(session: Session, client: CodeforcesClient, link: LinkedPlatformAccount) -> int:
    rows = client.call("user.rating", {"handle": link.username})
    if not isinstance(rows, list):
        raise CodeforcesError("codeforces_bad_response", "Unexpected rating history")
    for item in rows:
        if not isinstance(item, dict) or not all(
            type(item.get(field)) is int
            for field in ("contestId", "ratingUpdateTimeSeconds", "oldRating", "newRating")
        ):
            continue
        session.merge(
            CodeforcesRatingChange(
                handle_key=link.username_key,
                contest_id=item["contestId"],
                contest_name=str(item.get("contestName") or item["contestId"])[:300],
                rated_at=datetime.fromtimestamp(item["ratingUpdateTimeSeconds"], timezone.utc),
                old_rating=item["oldRating"],
                new_rating=item["newRating"],
                rank=item.get("rank") if type(item.get("rank")) is int else None,
            )
        )
    session.commit()
    return len(rows)


@router.get("/accounts", response_model=AccountsResponse)
def accounts(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    try:
        link = get_link(session, user_id, "codeforces")
        return {"accounts": [link] if link else []}
    except SQLAlchemyError as exc:
        raise _database_error(exc) from exc


@router.post("/codeforces/link", response_model=LinkedAccountResponse)
def link_codeforces(
    request: LinkRequest,
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> LinkedPlatformAccount:
    try:
        profile = session.get(CodeforcesUser, request.username.lower())
        if profile is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "not_synced", "message": "Sync this Codeforces handle first"},
            )
        link = link_account(session, user_id, "codeforces", profile.handle)
        link.synced_at = profile.synced_at
        link.sync_status = "ready" if profile.synced_at else "pending"
        session.commit()
        return link
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc


@router.post("/codeforces/sync", response_model=AccountSyncResponse)
def sync_codeforces_account(
    request: AccountSyncRequest,
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    client: Annotated[CodeforcesClient, Depends(get_codeforces_client)],
) -> dict:
    try:
        result = sync_handle(session, client, request.username, request.mode)
        link = link_account(session, user_id, "codeforces", result["handle"])
        link.synced_at = result["synced_at"]
        link.sync_status = "ready"
        link.sync_error = None
        session.commit()
    except CodeforcesError as exc:
        session.rollback()
        link = get_link(session, user_id, "codeforces")
        if link and link.username_key == request.username.lower():
            link.sync_status = "error"
            link.sync_error = exc.message[:300]
            session.commit()
        raise HTTPException(
            status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}
        ) from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc
    try:
        _store_ratings(session, client, link)
        result["rating_history_status"] = "ready"
    except (CodeforcesError, SQLAlchemyError):
        session.rollback()
        link = get_link(session, user_id, "codeforces")
        if link:
            link.sync_status = "partial"
            link.sync_error = "Submissions saved; rating history refresh failed"
            session.commit()
        result["rating_history_status"] = "error"
    return result


@router.post("/codeforces/ratings/sync", response_model=RatingSyncResponse)
def sync_codeforces_ratings(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    client: Annotated[CodeforcesClient, Depends(get_codeforces_client)],
) -> dict:
    link = get_link(session, user_id, "codeforces")
    if link is None:
        raise HTTPException(
            status_code=404, detail={"code": "not_linked", "message": "Link Codeforces first"}
        )
    try:
        return {"contest_count": _store_ratings(session, client, link)}
    except CodeforcesError as exc:
        session.rollback()
        raise HTTPException(
            status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}
        ) from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc


@router.delete("/codeforces", status_code=204)
def unlink_codeforces(
    user_id: Annotated[UUID, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    try:
        session.execute(
            delete(LinkedPlatformAccount).where(
                LinkedPlatformAccount.user_id == user_id,
                LinkedPlatformAccount.platform == "codeforces",
            )
        )
        session.commit()
    except SQLAlchemyError as exc:
        session.rollback()
        raise _database_error(exc) from exc
