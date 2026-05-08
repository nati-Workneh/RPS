import backend.python_api.friend_mode as friend_mode
from backend.python_api.app import app
from fastapi.testclient import TestClient

client = TestClient(app)


def login_user(monkeypatch, subject: str, name: str) -> tuple[dict, dict[str, str]]:
    def fake_verify(_credential: str):
        return {
            "id": subject,
            "display_name": name,
            "email": f"{subject}@example.com",
            "picture": None,
        }

    monkeypatch.setattr(friend_mode, "verify_google_identity", fake_verify)
    response = client.post("/api/auth/google", json={"credential": f"token-{subject}"})
    assert response.status_code == 200
    payload = response.json()
    return payload, {"Authorization": f"Bearer {payload['token']}"}


def pick_piece(board: list[dict], owner: str, row: int, col: int) -> dict:
    return next(piece for piece in board if piece["owner"] == owner and piece["row"] == row and piece["col"] == col)


def test_google_login_creates_session(monkeypatch):
    friend_mode.USERS.clear()
    friend_mode.SESSIONS.clear()
    friend_mode.FRIEND_ROOMS.clear()

    payload, headers = login_user(monkeypatch, "host-user", "Host User")

    assert payload["user"]["displayName"] == "Host User"

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["id"] == "host-user"


def test_friend_room_join_creates_shared_match_and_mirrors_guest_board(monkeypatch):
    friend_mode.USERS.clear()
    friend_mode.SESSIONS.clear()
    friend_mode.FRIEND_ROOMS.clear()

    _, host_headers = login_user(monkeypatch, "host-user", "Host User")
    _, guest_headers = login_user(monkeypatch, "guest-user", "Guest User")

    created = client.post(
        "/api/friend/rooms",
        json={"difficulty": "medium"},
        headers=host_headers,
    )
    assert created.status_code == 200
    room_id = created.json()["roomId"]

    joined = client.post(f"/api/friend/rooms/{room_id}/join", headers=guest_headers)
    assert joined.status_code == 200
    payload = joined.json()

    assert payload["status"] == "playing"
    assert payload["match"]["phase"] == "reveal"

    guest_pieces = [piece for piece in payload["match"]["board"] if piece["owner"] == "player"]
    assert sorted({piece["row"] for piece in guest_pieces}) == [1, 2]


def test_friend_match_advances_after_both_players_place_flag_and_decoy(monkeypatch):
    friend_mode.USERS.clear()
    friend_mode.SESSIONS.clear()
    friend_mode.FRIEND_ROOMS.clear()

    _, host_headers = login_user(monkeypatch, "host-user", "Host User")
    _, guest_headers = login_user(monkeypatch, "guest-user", "Guest User")

    room = client.post("/api/friend/rooms", json={"difficulty": "easy"}, headers=host_headers).json()
    room_id = room["roomId"]
    client.post(f"/api/friend/rooms/{room_id}/join", headers=guest_headers)

    host_view = client.get(f"/api/friend/rooms/{room_id}", headers=host_headers).json()
    guest_view = client.get(f"/api/friend/rooms/{room_id}", headers=guest_headers).json()

    host_flag = pick_piece(host_view["match"]["board"], "player", 1, 1)
    host_decoy = pick_piece(host_view["match"]["board"], "player", 1, 2)
    guest_flag = pick_piece(guest_view["match"]["board"], "player", 1, 1)
    guest_decoy = pick_piece(guest_view["match"]["board"], "player", 1, 2)

    assert client.post(f"/api/friend/rooms/{room_id}/flag", json={"pieceId": host_flag["id"]}, headers=host_headers).status_code == 200
    assert client.post(f"/api/friend/rooms/{room_id}/decoy", json={"pieceId": host_decoy["id"]}, headers=host_headers).status_code == 200
    assert client.post(f"/api/friend/rooms/{room_id}/flag", json={"pieceId": guest_flag["id"]}, headers=guest_headers).status_code == 200

    final_guest_pick = client.post(
        f"/api/friend/rooms/{room_id}/decoy",
        json={"pieceId": guest_decoy["id"]},
        headers=guest_headers,
    )
    assert final_guest_pick.status_code == 200

    host_after = client.get(f"/api/friend/rooms/{room_id}", headers=host_headers).json()
    guest_after = client.get(f"/api/friend/rooms/{room_id}", headers=guest_headers).json()

    assert host_after["match"]["phase"] == "player_turn"
    assert guest_after["match"]["phase"] == "ai_turn"
    assert host_after["match"]["turnEndsAt"] is not None


def test_friend_move_updates_both_players_views(monkeypatch):
    friend_mode.USERS.clear()
    friend_mode.SESSIONS.clear()
    friend_mode.FRIEND_ROOMS.clear()

    _, host_headers = login_user(monkeypatch, "host-user", "Host User")
    _, guest_headers = login_user(monkeypatch, "guest-user", "Guest User")

    room = client.post("/api/friend/rooms", json={"difficulty": "easy"}, headers=host_headers).json()
    room_id = room["roomId"]
    client.post(f"/api/friend/rooms/{room_id}/join", headers=guest_headers)

    host_view = client.get(f"/api/friend/rooms/{room_id}", headers=host_headers).json()
    guest_view = client.get(f"/api/friend/rooms/{room_id}", headers=guest_headers).json()

    host_flag = pick_piece(host_view["match"]["board"], "player", 1, 1)
    host_decoy = pick_piece(host_view["match"]["board"], "player", 1, 2)
    guest_flag = pick_piece(guest_view["match"]["board"], "player", 1, 1)
    guest_decoy = pick_piece(guest_view["match"]["board"], "player", 1, 2)

    client.post(f"/api/friend/rooms/{room_id}/flag", json={"pieceId": host_flag["id"]}, headers=host_headers)
    client.post(f"/api/friend/rooms/{room_id}/decoy", json={"pieceId": host_decoy["id"]}, headers=host_headers)
    client.post(f"/api/friend/rooms/{room_id}/flag", json={"pieceId": guest_flag["id"]}, headers=guest_headers)
    client.post(f"/api/friend/rooms/{room_id}/decoy", json={"pieceId": guest_decoy["id"]}, headers=guest_headers)

    ready_host = client.get(f"/api/friend/rooms/{room_id}", headers=host_headers).json()
    moving_piece = pick_piece(ready_host["match"]["board"], "player", 2, 1)

    moved = client.post(
        f"/api/friend/rooms/{room_id}/move",
        json={"pieceId": moving_piece["id"], "targetRow": 3, "targetCol": 1},
        headers=host_headers,
    )
    assert moved.status_code == 200

    host_after = client.get(f"/api/friend/rooms/{room_id}", headers=host_headers).json()
    guest_after = client.get(f"/api/friend/rooms/{room_id}", headers=guest_headers).json()

    moved_host_piece = next(piece for piece in host_after["match"]["board"] if piece["id"] == moving_piece["id"])
    moved_guest_piece = next(piece for piece in guest_after["match"]["board"] if piece["id"] == moving_piece["id"])

    assert host_after["match"]["phase"] == "ai_turn"
    assert guest_after["match"]["phase"] == "player_turn"
    assert moved_host_piece["row"] == 3
    assert moved_guest_piece["row"] == 4
