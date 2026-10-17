"""Storage directory selection for local development and Vercel Functions."""
from __future__ import annotations

import os
from pathlib import Path


def storage_directory() -> Path:
    configured = os.getenv("APP_STORAGE_DIR")
    if configured:
        location = Path(configured)
    elif os.getenv("VERCEL"):
        # Function files are read-only; /tmp is writable but ephemeral per instance.
        location = Path("/tmp/smart-food-delivery")
    else:
        location = Path(__file__).resolve().parent
    location.mkdir(parents=True, exist_ok=True)
    return location
