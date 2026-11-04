"""The compute service's HTTP interface, as its contract publishes it."""

import json
from http import HTTPStatus
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from polly_compute.app import app
from polly_compute.openapi import document

if TYPE_CHECKING:
    import pytest

client = TestClient(app)


def test_the_placeholder_analysis_returns_its_score_without_loading_a_model() -> None:
    """The analysis answers its predefined score until the real model arrives."""
    response = client.post("/analyses", json={"recordingId": "rec-1"})
    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"recordingId": "rec-1", "score": 0.5, "modelLoaded": False}


def test_a_request_outside_the_contract_is_refused() -> None:
    """An empty recording id is not a recording."""
    response = client.post("/analyses", json={"recordingId": ""})
    assert response.status_code == HTTPStatus.UNPROCESSABLE_CONTENT


def test_the_service_reports_the_fingerprint_of_its_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    """The fingerprint its image was built from, so a worker knows which version it calls."""
    monkeypatch.setenv("POLLY_COMPUTE_FINGERPRINT", "0123456789ab")
    assert client.get("/version").json() == {"fingerprint": "0123456789ab"}


def test_a_service_run_from_its_sources_reports_no_fingerprint(monkeypatch: pytest.MonkeyPatch) -> None:
    """Outside an image, nothing names its version."""
    monkeypatch.delenv("POLLY_COMPUTE_FINGERPRINT", raising=False)
    assert client.get("/version").json() == {"fingerprint": "unversioned"}


def test_the_published_document_names_each_operation() -> None:
    """The client generated from the document calls each operation by its id."""
    operations = [
        operation["operationId"]
        for methods in json.loads(document())["paths"].values()
        for operation in methods.values()
    ]
    assert operations == ["analyze", "version"]
