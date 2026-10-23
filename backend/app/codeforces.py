import re
import threading
import time
from functools import lru_cache
from typing import Any

import httpx

HANDLE_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,24}$")


class CodeforcesError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 502):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class CodeforcesClient:
    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        pace_seconds: float = 2.1,
        base_url: str = "https://codeforces.com/api",
    ):
        self.http = httpx.Client(base_url=base_url, transport=transport, timeout=30.0)
        self.pace_seconds = pace_seconds
        self._lock = threading.Lock()
        self._last_request = 0.0

    def _pace(self) -> None:
        with self._lock:
            elapsed = time.monotonic() - self._last_request
            if elapsed < self.pace_seconds:
                time.sleep(self.pace_seconds - elapsed)
            self._last_request = time.monotonic()

    def call(self, method: str, params: dict[str, Any]) -> Any:
        for attempt in range(3):
            self._pace()
            try:
                response = self.http.get(f"/{method}", params=params)
                if response.status_code in (429, 500, 502, 503, 504):
                    raise CodeforcesError(
                        "codeforces_unavailable", "Codeforces is temporarily unavailable", 503
                    )
                response.raise_for_status()
                payload = response.json()
            except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
                if attempt == 2:
                    raise CodeforcesError(
                        "codeforces_unavailable", "Could not reach the Codeforces API", 503
                    ) from exc
                time.sleep(2**attempt)
                continue
            except CodeforcesError:
                if attempt == 2:
                    raise
                time.sleep(2**attempt)
                continue

            if not isinstance(payload, dict) or payload.get("status") not in ("OK", "FAILED"):
                raise CodeforcesError("codeforces_bad_response", "Unexpected Codeforces response")
            if payload["status"] == "OK":
                return payload.get("result")
            comment = str(payload.get("comment", ""))
            if "Call limit exceeded" in comment:
                if attempt == 2:
                    raise CodeforcesError(
                        "codeforces_rate_limited", "Codeforces rate limit reached", 503
                    )
                time.sleep(2**attempt)
                continue
            if method == "user.info":
                raise CodeforcesError("invalid_handle", "Codeforces handle was not found", 404)
            raise CodeforcesError("codeforces_failed", "Codeforces could not complete the request")
        raise CodeforcesError(
            "codeforces_unavailable", "Codeforces is temporarily unavailable", 503
        )

    def profile(self, handle: str) -> dict[str, Any]:
        result = self.call("user.info", {"handles": handle})
        if not isinstance(result, list) or not result or not isinstance(result[0], dict):
            raise CodeforcesError(
                "codeforces_bad_response", "Unexpected Codeforces profile response"
            )
        return result[0]

    def submissions(self, handle: str, start: int, count: int) -> list[dict[str, Any]]:
        result = self.call("user.status", {"handle": handle, "from": start, "count": count})
        if not isinstance(result, list):
            raise CodeforcesError("codeforces_bad_response", "Unexpected Codeforces submissions")
        return result

    def problemset(self) -> dict[str, Any]:
        result = self.call("problemset.problems", {})
        if not isinstance(result, dict) or not isinstance(result.get("problems"), list):
            raise CodeforcesError("codeforces_bad_response", "Unexpected Codeforces problemset")
        return result


@lru_cache
def get_codeforces_client() -> CodeforcesClient:
    return CodeforcesClient()
