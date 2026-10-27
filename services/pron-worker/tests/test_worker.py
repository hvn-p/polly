"""Tests of the worker's analysis path, without a database."""

import pytest

from pron_worker.analyzer import FakeAnalyzer, ModelUnavailableError, UnavailableModelAnalyzer, analyzer_for
from pron_worker.worker import TASK, run_placeholder_analysis, settings_from


def test_the_fake_analyzer_returns_its_predefined_result_and_loads_no_model() -> None:
    """C29: a predefined result, and no model loaded."""
    result = FakeAnalyzer().analyze("recording-1")
    assert result == {"recordingId": "recording-1", "score": 0.75, "analyzer": "fake", "modelLoaded": False}


def test_the_placeholder_analysis_runs_the_analyzer_on_its_input() -> None:
    """C46: the workflow returns what the analyzer produced for its input."""
    result = run_placeholder_analysis(FakeAnalyzer(), {"recordingId": "recording-2"})
    assert result["recordingId"] == "recording-2"
    assert result["modelLoaded"] is False


def test_the_mode_picks_the_analyzer() -> None:
    """Fake by default; the real model is not part of this feature yet."""
    assert isinstance(analyzer_for("fake"), FakeAnalyzer)
    assert isinstance(analyzer_for("real"), UnavailableModelAnalyzer)
    with pytest.raises(ValueError, match="POLLY_WORKER_MODE"):
        analyzer_for("other")


def test_the_real_mode_says_its_model_is_not_available() -> None:
    """The real worker holds its place until the real analysis arrives."""
    with pytest.raises(ModelUnavailableError):
        UnavailableModelAnalyzer().analyze("recording-3")


def test_the_task_comes_from_the_generated_contract() -> None:
    """Queue, workflow and application version are the API's, read from the contract."""
    assert TASK == {
        "queueName": "pron-analysis",
        "workflowName": "placeholder_analysis",
        "applicationVersion": "polly-skeleton-1",
    }


def test_settings_come_from_the_worktree_configuration() -> None:
    """The worker reaches the database through DATABASE_URL only."""
    settings = settings_from(
        {"DATABASE_URL": "postgresql://a:b@127.0.0.1:1/polly_a", "POLLY_WORKER_MODE": "fake"}
    )
    assert settings.database_url == "postgresql://a:b@127.0.0.1:1/polly_a"
    assert settings.mode == "fake"
    assert settings_from({"DATABASE_URL": "postgresql://x"}).mode == "fake"
    with pytest.raises(KeyError, match="DATABASE_URL"):
        settings_from({})
