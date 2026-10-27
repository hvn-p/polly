"""The worker: runs the placeholder analysis enqueued by the API, as a portable DBOS workflow."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, cast

from dbos import DBOS, DBOSConfig, WorkflowSerializationFormat

from pron_worker.analyzer import Analyzer, analyzer_for

# DBOS reads the workflow's annotations when it runs it: these imports are
# needed at runtime.
from pron_worker.contracts.placeholder_analysis import (
    PlaceholderAnalysisInput,
    PlaceholderAnalysisResult,
    PlaceholderAnalysisTask,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

_CONTRACT = Path(__file__).parents[2] / "contracts" / "placeholder-analysis.schema.json"


def _task() -> PlaceholderAnalysisTask:
    properties = json.loads(_CONTRACT.read_text())["$defs"]["PlaceholderAnalysisTask"]["properties"]
    return cast("PlaceholderAnalysisTask", {name: value["const"] for name, value in properties.items()})


TASK = _task()


@dataclass(frozen=True)
class Settings:
    """What the worker reads from the worktree's configuration."""

    database_url: str
    mode: str


def settings_from(env: Mapping[str, str]) -> Settings:
    """Read the settings; the database is reached through DATABASE_URL only."""
    return Settings(database_url=env["DATABASE_URL"], mode=env.get("POLLY_WORKER_MODE", "fake"))


def run_placeholder_analysis(
    analyzer: Analyzer, task_input: PlaceholderAnalysisInput
) -> PlaceholderAnalysisResult:
    """Analyze the recording the task names."""
    return analyzer.analyze(task_input["recordingId"])


def launch(settings: Settings) -> None:
    """Register the workflow on the task's queue and start processing it."""
    config: DBOSConfig = {
        "name": "polly",
        "system_database_url": settings.database_url,
        "application_version": TASK["applicationVersion"],
    }
    DBOS(config=config)
    analyzer = analyzer_for(settings.mode)

    @DBOS.workflow(name=TASK["workflowName"], serialization_type=WorkflowSerializationFormat.PORTABLE)
    def placeholder_analysis(task_input: PlaceholderAnalysisInput) -> PlaceholderAnalysisResult:
        return run_placeholder_analysis(analyzer, task_input)

    DBOS.launch()
    # A queue persists its configuration in the system database: after launch.
    DBOS.register_queue(TASK["queueName"])
