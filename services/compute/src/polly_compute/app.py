"""The compute service's HTTP interface: its operations, published as its OpenAPI."""

import os

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Message(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, extra="forbid")


class AnalysisRequest(_Message):
    """The recording to analyze."""

    recording_id: str = Field(min_length=1, max_length=64)


class Analysis(_Message):
    """The analysis of a recording."""

    recording_id: str = Field(min_length=1, max_length=64)
    score: float = Field(ge=0, le=1)
    model_loaded: bool


class Version(_Message):
    """The version of the service's code."""

    fingerprint: str = Field(min_length=1, max_length=64)


app = FastAPI(title="compute", version="0")


@app.post("/analyses", operation_id="analyze")
def analyze(request: AnalysisRequest) -> Analysis:
    """Analyze a recording: a predefined score until the real model arrives with its own feature."""
    return Analysis(recording_id=request.recording_id, score=0.5, model_loaded=False)


@app.get("/version", operation_id="version")
def version() -> Version:
    """Report the fingerprint of the sources the service's image was built from."""
    return Version(fingerprint=os.environ.get("POLLY_COMPUTE_FINGERPRINT", "unversioned"))
