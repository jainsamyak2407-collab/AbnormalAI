import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

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


_TTL = 60 * 60 * 24 * 7  # 7 days


def _encode(value: Any) -> str:
    return json.dumps(value, default=str)


def _decode(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return raw
    # upstash_redis may auto-parse JSON — return as-is if already a dict/list
    return raw


class SessionStore:
    """
    Redis-backed session store (Upstash REST) with in-memory fallback.
    All values are JSON-encoded on write and decoded on read.
    """

    def __init__(self) -> None:
        self._fallback: dict[str, Any] = {}

    def get(self, key: str) -> Any:
        r = _get_redis()
        if r:
            try:
                return _decode(r.get(key))
            except Exception as exc:
                logger.warning("Store.get Redis error (%s); trying fallback.", exc)
        return self._fallback.get(key)

    def set(self, key: str, value: Any) -> None:
        r = _get_redis()
        if r:
            try:
                r.set(key, _encode(value), ex=_TTL)
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


store = SessionStore()
