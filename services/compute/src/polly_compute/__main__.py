"""Serve the compute service: `python -m polly_compute`, on POLLY_COMPUTE_HOST:POLLY_COMPUTE_PORT."""

import os

import uvicorn

from polly_compute.app import app

uvicorn.run(
    app,
    host=os.environ.get("POLLY_COMPUTE_HOST", "127.0.0.1"),
    port=int(os.environ.get("POLLY_COMPUTE_PORT", "8000")),
)
