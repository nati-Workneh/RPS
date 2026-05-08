from __future__ import annotations

import os

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
TIMEOUT_SECONDS = float(os.getenv("ANTHROPIC_TIMEOUT_SECONDS", "8"))
REVEAL_SECONDS = 20
AI_TIMEOUT_SECONDS = 3
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
