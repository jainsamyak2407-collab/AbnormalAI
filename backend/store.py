import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Redis-backed store (Upstash REST API) with in-memory fallback
# ---------------------------------------------------------------------------

_redis = None

def _get_redis():
    global _redis
    if _redis is not None:
        return _redis
    url = os.getenv("UPSTASH_REDIS_REST_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if url and token:
        try:
            from upstash_redis import Redis
            _redis = Redis(url=url, token=token)
            logger.info("Store: connected to Upstash Redis.")
        except Exception as exc:
            logger.warning("Store: Upstash Redis init failed (%s); using in-memory fallback.", exc)
    else:
        logger.warning("Store: UPSTASH_REDIS_REST_URL/TOKEN not set; using in-memory fallback.")
    return _redis


# TTL: 7 days — briefs survive restarts and cold starts
_TTL = 60 * 60 * 24 * 7


class SessionStore:
    """
    Redis-backed session store with transparent in-memory fallback.
    Values are JSON-serialised so any JSON-compatible object can be stored.
    """

    def __init__(self) -> None:
        self._fallback: dict[str, Any] = {}

    def get(self, key: str) -> Any:
        r = _get_redis()
        if r:
            try:
                raw = r.get(key)
                if raw is None:
                    return None
                return json.loads(raw) if isinstance(raw, str) else raw
            except Exception as exc:
                logger.warning("Store.get Redis error (%s); trying fallback.", exc)
        return self._fallback.get(key)

    def set(self, key: str, value: Any) -> None:
        r = _get_redis()
        if r:
            try:
                r.set(key, json.dumps(value, default=str), ex=_TTL)
                return
            except Exception as exc:
                logger.warning("Store.set Redis error (%s); writing to fallback.", exc)
        self._fallback[key] = value

    def delete(self, key: str) -> None:
        r = _get_redis()
        if r:
            try:
                r.delete(key)
                return
            except Exception as exc:
                logger.warning("Store.delete Redis error (%s); deleting from fallback.", exc)
        self._fallback.pop(key, None)

    def exists(self, key: str) -> bool:
        r = _get_redis()
        if r:
            try:
                return bool(r.exists(key))
            except Exception as exc:
                logger.warning("Store.exists Redis error (%s); checking fallback.", exc)
        return key in self._fallback


# Module-level singleton shared across the application.
store = SessionStore()
