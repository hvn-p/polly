"""Test-session setup: no test reaches beyond loopback."""

from typing import TYPE_CHECKING

import pytest

from tests.network_guard import install, take_refused_connections

if TYPE_CHECKING:
    from collections.abc import Iterator

_session = pytest.MonkeyPatch()


def pytest_configure() -> None:
    """Install the network guard before any test module is imported."""
    install(_session)


def pytest_unconfigure() -> None:
    """Give the sockets back their own connect."""
    _session.undo()


@pytest.fixture(autouse=True)
def _no_outbound_network() -> Iterator[None]:
    """Fail the test that tried to reach beyond loopback, even if its code swallowed the error."""
    yield
    destinations = take_refused_connections()
    if destinations:
        pytest.fail(f"OUTBOUND_NETWORK_REFUSED: the test tried to reach {', '.join(destinations)}")
