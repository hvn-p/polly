"""Write the service's OpenAPI document: `python -m polly_compute.openapi` (run by nr contracts)."""

import json
import sys

from polly_compute.app import app


def document() -> str:
    """Return the OpenAPI document of the service's operations."""
    return json.dumps(app.openapi(), indent=2) + "\n"


if __name__ == "__main__":
    sys.stdout.write(document())
