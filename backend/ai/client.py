import os

from anthropic import AsyncAnthropic

OPUS_MODEL = "claude-opus-4-6"
SONNET_MODEL = "claude-sonnet-4-6"


def get_async_client() -> AsyncAnthropic:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is not set.")
    return AsyncAnthropic(api_key=api_key)
