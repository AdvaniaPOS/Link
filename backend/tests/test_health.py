"""Smoke tests for basic API surface."""

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_asset_returns_404(client: TestClient) -> None:
    # Random UUID that does not exist in the test DB.
    response = client.get("/api/p/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_admin_endpoints_require_auth(client: TestClient) -> None:
    response = client.get("/api/admin/firms")
    assert response.status_code in (401, 403, 404)
