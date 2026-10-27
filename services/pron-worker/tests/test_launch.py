"""The worker's DBOS wiring, on a throwaway SQLite system database."""

from typing import TYPE_CHECKING

import pytest
from dbos import DBOS, DBOSClient, EnqueueOptions, WorkflowHandle, WorkflowSerializationFormat

from pron_worker.worker import TASK, Settings, launch

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

    from pron_worker.contracts.placeholder_analysis import PlaceholderAnalysisResult


@pytest.fixture
def database_url(tmp_path: Path) -> Iterator[str]:
    """Launch the worker in fake mode on a fresh database, then tear DBOS down."""
    url = f"sqlite:///{tmp_path / 'dbos.sqlite'}"
    launch(Settings(database_url=url, mode="fake"))
    yield url
    DBOS.destroy()


def test_a_task_enqueued_by_name_runs_on_the_worker(database_url: str) -> None:
    """C29: enqueued by name, as the API does, the task returns the fake result."""
    client = DBOSClient(system_database_url=database_url)
    options: EnqueueOptions = {
        "queue_name": TASK["queueName"],
        "workflow_name": TASK["workflowName"],
        "app_version": TASK["applicationVersion"],
        "serialization_type": WorkflowSerializationFormat.PORTABLE,
    }
    handle: WorkflowHandle[PlaceholderAnalysisResult] = client.enqueue(
        options, {"recordingId": "recording-9"}
    )
    assert handle.get_result() == {
        "recordingId": "recording-9",
        "score": 0.75,
        "analyzer": "fake",
        "modelLoaded": False,
    }
    client.destroy()
