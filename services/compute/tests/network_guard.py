"""Refuses any outbound connection from a test (constitution principle XII).

Only loopback and Unix sockets are reachable. A refused connection raises
OUTBOUND_NETWORK_REFUSED, and also fails the test that opened it, even when
the code under test swallows the error.
"""

import errno
import ipaddress
import socket
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pytest

# What socket.connect accepts: a host and port tuple, or a Unix socket path.
type Address = tuple[object, ...] | str | bytes

_refused: list[str] = []
_connect = socket.socket.connect
_connect_ex = socket.socket.connect_ex


class OutboundNetworkRefusedError(OSError):
    """A test tried to reach beyond loopback."""


def take_refused_connections() -> list[str]:
    """Return the destinations refused since the last call, and forget them."""
    destinations = list(_refused)
    _refused.clear()
    return destinations


def _is_loopback(host: str) -> bool:
    if host == "localhost" or host.endswith(".localhost"):
        return True
    try:
        address = ipaddress.ip_address(host.split("%", maxsplit=1)[0])
    except ValueError:
        return False
    mapped = address.ipv4_mapped if isinstance(address, ipaddress.IPv6Address) else None
    return address.is_loopback or (mapped is not None and mapped.is_loopback)


def _refusal(sock: socket.socket, address: Address) -> OutboundNetworkRefusedError | None:
    if sock.family not in {socket.AF_INET, socket.AF_INET6} or not isinstance(address, tuple):
        return None
    host, port = str(address[0]), address[1]
    if _is_loopback(host):
        return None
    _refused.append(f"{host}:{port}")
    return OutboundNetworkRefusedError(f"OUTBOUND_NETWORK_REFUSED: {host}:{port}; tests reach loopback only")


def _refusing_connect(sock: socket.socket, address: Address) -> None:
    refusal = _refusal(sock, address)
    if refusal is not None:
        raise refusal
    _connect(sock, address)


def _refusing_connect_ex(sock: socket.socket, address: Address) -> int:
    if _refusal(sock, address) is not None:
        return errno.ECONNREFUSED
    return _connect_ex(sock, address)


def install(monkeypatch: pytest.MonkeyPatch) -> None:
    """Route every socket connection of the test session through the guard."""
    monkeypatch.setattr(socket.socket, "connect", _refusing_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", _refusing_connect_ex)
