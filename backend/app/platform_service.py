"""Persistent user-scoped Codeforces links."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models import LinkedPlatformAccount


def get_link(session: Session, user_id: UUID, platform: str) -> LinkedPlatformAccount | None:
    return session.get(LinkedPlatformAccount, (user_id, platform))


def link_account(
    session: Session, user_id: UUID, platform: str, username: str
) -> LinkedPlatformAccount:
    link = get_link(session, user_id, platform)
    if link is None:
        link = LinkedPlatformAccount(
            user_id=user_id,
            platform=platform,
            username=username,
            username_key=username.lower(),
            sync_status="pending",
        )
        session.add(link)
    elif link.username_key != username.lower():
        link.username = username
        link.username_key = username.lower()
        link.synced_at = None
        link.sync_status = "pending"
        link.sync_error = None
    return link
