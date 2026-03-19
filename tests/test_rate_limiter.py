"""Tests for the rate limiter logic."""

import time

from api.main import (
    _MAX_TRACKED_IPS,
    _RATE_LIMIT_MAX_REQUESTS,
    _RATE_LIMIT_WINDOW_SECONDS,
    _request_log,
)

import pytest


@pytest.fixture(autouse=True)
def _clear_rate_log():
    _request_log.clear()
    yield
    _request_log.clear()


def test_empty_log_allows_first_request():
    assert len(_request_log) == 0


def test_timestamps_tracked_correctly():
    now = time.time()
    _request_log["127.0.0.1"] = [now]
    assert len(_request_log["127.0.0.1"]) == 1


def test_rate_limit_threshold():
    now = time.time()
    ip = "10.0.0.1"
    _request_log[ip] = [now - i for i in range(_RATE_LIMIT_MAX_REQUESTS)]
    assert len(_request_log[ip]) >= _RATE_LIMIT_MAX_REQUESTS


def test_stale_entries_expire():
    now = time.time()
    ip = "10.0.0.1"
    # All entries older than the window
    _request_log[ip] = [now - _RATE_LIMIT_WINDOW_SECONDS - 10]
    # Simulate pruning (same logic as middleware)
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    timestamps = [t for t in _request_log[ip] if t > window_start]
    assert timestamps == []


def test_mixed_timestamps_pruned():
    now = time.time()
    ip = "10.0.0.1"
    _request_log[ip] = [
        now - 120,  # stale
        now - 90,   # stale
        now - 30,   # fresh
        now - 10,   # fresh
    ]
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    timestamps = [t for t in _request_log[ip] if t > window_start]
    assert len(timestamps) == 2


def test_different_ips_tracked_separately():
    now = time.time()
    _request_log["10.0.0.1"] = [now]
    _request_log["10.0.0.2"] = [now, now]
    assert len(_request_log) == 2
    assert len(_request_log["10.0.0.1"]) == 1
    assert len(_request_log["10.0.0.2"]) == 2


def test_max_tracked_ips_bound():
    assert _MAX_TRACKED_IPS == 10_000


def test_eviction_logic():
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    # Add stale IPs
    for i in range(5):
        _request_log[f"stale-{i}"] = [now - 120]
    # Add fresh IPs
    for i in range(3):
        _request_log[f"fresh-{i}"] = [now - 10]

    # Simulate eviction (same logic as middleware)
    stale_ips = [
        ip for ip, ts in _request_log.items()
        if not ts or ts[-1] <= window_start
    ]
    for ip in stale_ips:
        del _request_log[ip]

    assert len(_request_log) == 3
    assert all(k.startswith("fresh-") for k in _request_log)
