"""The guard that keeps the worker's tests off the network (constitution principle XII)."""

import socket

import pytest

from tests.network_guard import OutboundNetworkRefusedError, take_refused_connections


def test_a_connection_to_a_public_address_is_refused_and_recorded() -> None:
    """A test reaching beyond loopback fails, naming the destination."""
    with (
        socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client,
        pytest.raises(OutboundNetworkRefusedError, match=r"OUTBOUND_NETWORK_REFUSED: 192\.0\.2\.1:80"),
    ):
        client.connect(("192.0.2.1", 80))
    assert take_refused_connections() == ["192.0.2.1:80"]


def test_a_refusal_the_code_swallows_is_still_recorded() -> None:
    """connect_ex returns an error code instead of raising: the refusal is recorded all the same."""
    with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as client:
        assert client.connect_ex(("2001:db8::1", 443, 0, 0)) != 0
    assert take_refused_connections() == ["2001:db8::1:443"]


def test_loopback_stays_reachable() -> None:
    """The services a test starts itself listen on loopback."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        server.listen()
        with socket.create_connection(server.getsockname()) as client:
            assert client.getpeername() == server.getsockname()
    assert take_refused_connections() == []
