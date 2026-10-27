"""The analyzer port and its adapters: a fake by default, the real model on demand."""

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from pron_worker.contracts.placeholder_analysis import PlaceholderAnalysisResult


class ModelUnavailableError(RuntimeError):
    """The real analysis model is not part of the worker yet."""


class Analyzer(Protocol):
    """Analyzes one recording."""

    def analyze(self, recording_id: str) -> PlaceholderAnalysisResult:
        """Return the analysis of the recording."""
        ...


class FakeAnalyzer:
    """Returns a predefined result through the real path, and loads no model."""

    def analyze(self, recording_id: str) -> PlaceholderAnalysisResult:
        """Return the predefined result for the recording."""
        return {"recordingId": recording_id, "score": 0.75, "analyzer": "fake", "modelLoaded": False}


class UnavailableModelAnalyzer:
    """Holds the real worker's place until the real analysis arrives with its own feature."""

    def analyze(self, recording_id: str) -> PlaceholderAnalysisResult:
        """Refuse: the real model is not available yet."""
        message = f"no analysis model in this worker yet; cannot analyze {recording_id}"
        raise ModelUnavailableError(message)


def analyzer_for(mode: str) -> Analyzer:
    """Return the analyzer of a worker mode, as POLLY_WORKER_MODE names it."""
    if mode == "fake":
        return FakeAnalyzer()
    if mode == "real":
        return UnavailableModelAnalyzer()
    message = f"POLLY_WORKER_MODE must be fake or real, not {mode}"
    raise ValueError(message)
