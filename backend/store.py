from typing import Any


class SessionStore:
    """Simple in-memory session store. No persistence; restarts clear all state."""

    def __init__(self) -> None:
        self._store: dict[str, Any] = {}

    def get(self, key: str) -> Any:
        return self._store.get(key)

    def set(self, key: str, value: Any) -> None:
        self._store[key] = value

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def exists(self, key: str) -> bool:
        return key in self._store


# Module-level singleton shared across the application.
store = SessionStore()
