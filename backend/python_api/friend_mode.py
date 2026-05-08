from __future__ import annotations

import random
import time
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token

from config import GOOGLE_CLIENT_ID
from schemas import (
    Difficulty,
    FriendMoveRequest,
    FriendPieceRequest,
    FriendRevealSwapRequest,
    FriendRoomCreateRequest,
    GoogleLoginRequest,
    Weapon,
)

router = APIRouter()

BOARD_COLS = 7
BOARD_ROWS = 6
HOST_ROWS = [1, 2]
GUEST_ROWS = [5, 6]
UNITS_PER_SQUAD = BOARD_COLS * len(HOST_ROWS)

ActualOwner = Literal["host", "guest"]
VisibleOwner = Literal["player", "ai"]
MatchPhase = Literal["reveal", "turn", "finished"]
Role = Literal["soldier", "flag", "decoy"]

TURN_DURATION_SECONDS_BY_DIFFICULTY: dict[Difficulty, int] = {
    "easy": 30,
    "medium": 15,
    "hard": 10,
}

WEAPONS: list[Weapon] = ["rock", "paper", "scissors"]
WEAPON_ICON = {"rock": "🪨", "paper": "📄", "scissors": "✂️"}
ROLE_ICON = {"flag": "🚩", "decoy": "🎭", "soldier": "•"}

USERS: dict[str, dict[str, str | None]] = {}
SESSIONS: dict[str, str] = {}
FRIEND_ROOMS: dict[str, dict[str, Any]] = {}

GOOGLE_REQUEST = GoogleRequest()


def turn_duration_for_difficulty(difficulty: Difficulty) -> int:
    return TURN_DURATION_SECONDS_BY_DIFFICULTY[difficulty]


def other_owner(owner: ActualOwner) -> ActualOwner:
    return "guest" if owner == "host" else "host"


def start_rows_for(owner: ActualOwner) -> list[int]:
    return HOST_ROWS if owner == "host" else GUEST_ROWS


def start_positions_for(owner: ActualOwner) -> list[tuple[int, int]]:
    return [(row, col) for row in start_rows_for(owner) for col in range(1, BOARD_COLS + 1)]


def owner_first_name(display_name: str | None, fallback: str) -> str:
    if not display_name:
        return fallback
    first = display_name.strip().split()[0]
    return first[:14] or fallback


def build_piece(owner: ActualOwner, label: str, weapon: Weapon, row: int, col: int) -> dict[str, Any]:
    return {
        "id": f"{owner}-{uuid.uuid4().hex[:8]}",
        "owner": owner,
        "name": label,
        "weapon": weapon,
        "role": "soldier",
        "row": row,
        "col": col,
        "alive": True,
    }


def balanced_weapons() -> list[Weapon]:
    weapons = [WEAPONS[index % len(WEAPONS)] for index in range(UNITS_PER_SQUAD)]
    random.shuffle(weapons)
    return weapons


def build_owner_pieces(owner: ActualOwner, display_name: str | None) -> list[dict[str, Any]]:
    first_name = owner_first_name(display_name, "Player")
    weapons = balanced_weapons()
    pieces: list[dict[str, Any]] = []
    for index, (row, col) in enumerate(start_positions_for(owner)):
        pieces.append(build_piece(owner, f"{first_name} {index + 1}", weapons[index], row, col))
    return pieces


def create_friend_match(room: dict[str, Any]) -> dict[str, Any]:
    host_name = (USERS[room["host_user_id"]].get("display_name") or "Host")
    guest_name = (USERS[room["guest_user_id"]].get("display_name") or "Guest")
    return {
        "id": uuid.uuid4().hex[:10],
        "difficulty": room["difficulty"],
        "turn_duration_seconds": room["turn_duration_seconds"],
        "phase": "reveal",
        "current_turn": "host",
        "started_at": time.time(),
        "reveal_ends_at": 0,
        "turn_ends_at": None,
        "pieces": build_owner_pieces("host", str(host_name)) + build_owner_pieces("guest", str(guest_name)),
        "owner_names": {
            "host": str(host_name),
            "guest": str(guest_name),
        },
        "stats": {
            "duels_won": {"host": 0, "guest": 0},
            "tie_sequences": 0,
            "decoy_absorbed": {"host": 0, "guest": 0},
        },
        "last_duel": None,
        "result": None,
    }


def user_view(user: dict[str, str | None]) -> dict[str, str | None]:
    return {
        "id": str(user["id"]),
        "displayName": user.get("display_name"),
        "email": user.get("email"),
        "picture": user.get("picture"),
    }


def verify_google_identity(credential: str) -> dict[str, str | None]:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on the backend. Set GOOGLE_CLIENT_ID first.",
        )

    try:
        payload = id_token.verify_oauth2_token(credential, GOOGLE_REQUEST, GOOGLE_CLIENT_ID)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google credential.") from exc

    issuer = payload.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=401, detail="Invalid Google token issuer.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing Google user id.")

    return {
        "id": str(user_id),
        "display_name": payload.get("name"),
        "email": payload.get("email"),
        "picture": payload.get("picture"),
    }


def create_session_token(user_id: str) -> str:
    token = f"session_{user_id}_{uuid.uuid4().hex}"
    SESSIONS[token] = user_id
    return token


def require_user(authorization: str | None = Header(default=None)) -> dict[str, str | None]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    token = authorization.split(" ", 1)[1].strip()
    user_id = SESSIONS.get(token)
    if not user_id or user_id not in USERS:
        raise HTTPException(status_code=401, detail="Invalid session.")
    return USERS[user_id]


def room_or_404(room_id: str) -> dict[str, Any]:
    room = FRIEND_ROOMS.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Friend room not found.")
    return room


def role_for_user(room: dict[str, Any], user_id: str) -> ActualOwner:
    if room["host_user_id"] == user_id:
        return "host"
    if room.get("guest_user_id") == user_id:
        return "guest"
    raise HTTPException(status_code=403, detail="You are not part of this friend room.")


def maybe_mark_room_status(room: dict[str, Any]) -> None:
    if not room.get("guest_user_id"):
        room["status"] = "waiting"
        return

    match = room.get("match")
    if match and match["phase"] == "finished":
        room["status"] = "finished"
    else:
        room["status"] = "playing"


def selected_role_piece(match_state: dict[str, Any], owner: ActualOwner, role: Role) -> dict[str, Any] | None:
    return next(
        (
            piece
            for piece in match_state["pieces"]
            if piece["owner"] == owner and piece["alive"] and piece["role"] == role
        ),
        None,
    )


def owner_ready(match_state: dict[str, Any], owner: ActualOwner) -> bool:
    return (
        selected_role_piece(match_state, owner, "flag") is not None
        and selected_role_piece(match_state, owner, "decoy") is not None
    )


def set_turn_deadline(match_state: dict[str, Any]) -> None:
    match_state["turn_ends_at"] = time.time() + match_state["turn_duration_seconds"]


def end_match(match_state: dict[str, Any], winner: ActualOwner, reason: str) -> None:
    match_state["phase"] = "finished"
    match_state["current_turn"] = winner
    match_state["turn_ends_at"] = None
    match_state["result"] = {"winner": winner, "reason": reason}


def maybe_advance_reveal(match_state: dict[str, Any]) -> None:
    if match_state["phase"] != "reveal":
        return
    if not owner_ready(match_state, "host") or not owner_ready(match_state, "guest"):
        return

    match_state["phase"] = "turn"
    match_state["current_turn"] = "host"
    set_turn_deadline(match_state)


def resolve_turn_timeout(match_state: dict[str, Any]) -> bool:
    if match_state["phase"] != "turn" or not match_state.get("turn_ends_at"):
        return False
    if time.time() < match_state["turn_ends_at"]:
        return False

    timed_out_owner: ActualOwner = match_state["current_turn"]
    winner = other_owner(timed_out_owner)
    loser_name = match_state["owner_names"][timed_out_owner]
    end_match(match_state, winner, f"{loser_name} ran out of time.")
    return True


def find_piece_at(match_state: dict[str, Any], row: int, col: int) -> dict[str, Any] | None:
    return next(
        (
            piece
            for piece in match_state["pieces"]
            if piece["alive"] and piece["row"] == row and piece["col"] == col
        ),
        None,
    )


def actual_to_view_coords(viewer: ActualOwner, row: int, col: int) -> tuple[int, int]:
    if viewer == "host":
        return row, col
    return BOARD_ROWS + 1 - row, BOARD_COLS + 1 - col


def view_to_actual_coords(viewer: ActualOwner, row: int, col: int) -> tuple[int, int]:
    if viewer == "host":
        return row, col
    return BOARD_ROWS + 1 - row, BOARD_COLS + 1 - col


def visible_piece(piece: dict[str, Any], viewer: ActualOwner, match_state: dict[str, Any]) -> dict[str, Any]:
    finished = match_state["phase"] == "finished"
    is_owner = piece["owner"] == viewer
    show_weapon = match_state["phase"] == "reveal" or is_owner or finished
    show_role = (
        (is_owner and match_state["phase"] != "reveal")
        or (is_owner and match_state["phase"] == "reveal" and piece["role"] in {"flag", "decoy"})
        or (finished and piece["role"] != "soldier")
    )
    owner: VisibleOwner = "player" if is_owner else "ai"
    row, col = actual_to_view_coords(viewer, piece["row"], piece["col"])

    return {
        "id": piece["id"],
        "owner": owner,
        "row": row,
        "col": col,
        "alive": piece["alive"],
        "label": piece["name"] if is_owner or finished else "Hidden Operative",
        "weapon": piece["weapon"] if show_weapon and piece["alive"] else None,
        "weaponIcon": WEAPON_ICON[piece["weapon"]] if show_weapon and piece["alive"] else None,
        "role": piece["role"] if show_role and piece["alive"] else None,
        "roleIcon": ROLE_ICON[piece["role"]] if show_role and piece["alive"] else None,
        "silhouette": not show_weapon and piece["alive"],
    }


def stats_view(match_state: dict[str, Any], viewer: ActualOwner) -> dict[str, int]:
    opponent = other_owner(viewer)
    duration = int(time.time() - match_state["started_at"])
    return {
        "durationSeconds": duration,
        "playerDuelsWon": match_state["stats"]["duels_won"][viewer],
        "playerDuelsLost": match_state["stats"]["duels_won"][opponent],
        "tieSequences": match_state["stats"]["tie_sequences"],
        "decoyAbsorbed": match_state["stats"]["decoy_absorbed"][viewer],
    }


def build_view_message(match_state: dict[str, Any], viewer: ActualOwner) -> str:
    if match_state["phase"] == "finished":
        return match_state["result"]["reason"] if match_state.get("result") else "Match finished."

    if match_state["phase"] == "reveal":
        has_flag = selected_role_piece(match_state, viewer, "flag") is not None
        has_decoy = selected_role_piece(match_state, viewer, "decoy") is not None
        if not has_flag:
            return "Choose your flag first."
        if not has_decoy:
            return "Choose your decoy totem next."
        if not owner_ready(match_state, other_owner(viewer)):
            return "Waiting for your friend to place their flag and decoy."
        return "Both squads are ready."

    return (
        "Your turn. Select one of your front units and move to a highlighted square."
        if match_state["current_turn"] == viewer
        else "Your friend is choosing a move."
    )


def build_match_view(match_state: dict[str, Any], viewer: ActualOwner) -> dict[str, Any]:
    if match_state["phase"] == "reveal":
        phase = "reveal"
        current_turn: VisibleOwner | Literal["none"] = "player"
    elif match_state["phase"] == "finished":
        phase = "finished"
        current_turn = "none"
    else:
        phase = "player_turn" if match_state["current_turn"] == viewer else "ai_turn"
        current_turn = "player" if match_state["current_turn"] == viewer else "ai"

    result = None
    if match_state.get("result"):
        result = {
            "winner": "player" if match_state["result"]["winner"] == viewer else "ai",
            "reason": match_state["result"]["reason"],
        }

    return {
        "matchId": match_state["id"],
        "phase": phase,
        "currentTurn": current_turn,
        "difficulty": match_state["difficulty"],
        "turnDurationSeconds": match_state["turn_duration_seconds"],
        "message": build_view_message(match_state, viewer),
        "board": [visible_piece(piece, viewer, match_state) for piece in match_state["pieces"]],
        "stats": stats_view(match_state, viewer),
        "revealEndsAt": match_state["reveal_ends_at"],
        "turnEndsAt": match_state.get("turn_ends_at"),
        "duel": match_state.get("last_duel"),
        "result": result,
    }


def build_room_view(room: dict[str, Any], viewer_user_id: str) -> dict[str, Any]:
    viewer_role = role_for_user(room, viewer_user_id)
    maybe_mark_room_status(room)
    opponent_user_id = room["guest_user_id"] if viewer_role == "host" else room["host_user_id"]
    opponent = USERS.get(opponent_user_id) if opponent_user_id else None
    return {
        "roomId": room["id"],
        "status": room["status"],
        "difficulty": room["difficulty"],
        "turnDurationSeconds": room["turn_duration_seconds"],
        "currentUserRole": viewer_role,
        "host": user_view(USERS[room["host_user_id"]]),
        "guest": user_view(USERS[room["guest_user_id"]]) if room.get("guest_user_id") else None,
        "playerProfile": user_view(USERS[viewer_user_id]),
        "opponentProfile": user_view(opponent) if opponent else None,
        "match": build_match_view(room["match"], viewer_role) if room.get("match") else None,
    }


def owner_piece_for_view(room: dict[str, Any], viewer: ActualOwner, piece_id: str) -> dict[str, Any]:
    piece = next(
        (
            item
            for item in room["match"]["pieces"]
            if item["id"] == piece_id and item["alive"] and item["owner"] == viewer
        ),
        None,
    )
    if not piece:
        raise HTTPException(status_code=400, detail="Invalid player piece.")
    return piece


def shuffle_owner_positions(match_state: dict[str, Any], owner: ActualOwner) -> None:
    positions = start_positions_for(owner)
    random.shuffle(positions)
    pieces = [piece for piece in match_state["pieces"] if piece["alive"] and piece["owner"] == owner]
    for piece, (row, col) in zip(pieces, positions, strict=True):
        piece["row"] = row
        piece["col"] = col


def is_adjacent(piece: dict[str, Any], target_row: int, target_col: int) -> bool:
    dr = abs(piece["row"] - target_row)
    dc = abs(piece["col"] - target_col)
    return (dr == 1 and dc == 0) or (dr == 0 and dc == 1)


def duel_result(attacker_weapon: Weapon, defender_weapon: Weapon) -> Literal["attacker", "defender", "tie"]:
    if attacker_weapon == defender_weapon:
        return "tie"
    wins = {("rock", "scissors"), ("paper", "rock"), ("scissors", "paper")}
    return "attacker" if (attacker_weapon, defender_weapon) in wins else "defender"


def apply_duel_outcome(
    match_state: dict[str, Any],
    attacker: dict[str, Any],
    defender: dict[str, Any],
    winner: Literal["attacker", "defender"],
    attacker_weapon: Weapon,
    defender_weapon: Weapon,
    tie_count: int,
) -> None:
    decoy_victory = attacker["role"] == "decoy" or defender["role"] == "decoy"
    duel: dict[str, Any] = {
        "attackerId": attacker["id"],
        "attackerName": attacker["name"],
        "attackerWeapon": attacker_weapon,
        "defenderId": defender["id"],
        "defenderName": defender["name"],
        "defenderWeapon": defender_weapon,
        "winner": winner,
        "tie": False,
        "decoyAbsorbed": decoy_victory,
    }

    if tie_count > 0:
        match_state["stats"]["tie_sequences"] += tie_count

    if decoy_victory:
        victor = attacker["owner"] if attacker["role"] == "decoy" else defender["owner"]
        match_state["stats"]["decoy_absorbed"][victor] += 1

    if winner == "attacker":
        defender["alive"] = False
        duel["eliminatedId"] = defender["id"]
        duel["revealedRole"] = defender["role"]
        match_state["stats"]["duels_won"][attacker["owner"]] += 1
        if defender["role"] == "flag":
            end_match(match_state, attacker["owner"], f"{match_state['owner_names'][attacker['owner']]} captured the enemy flag.")
    else:
        attacker["alive"] = False
        duel["eliminatedId"] = attacker["id"]
        duel["revealedRole"] = attacker["role"]
        match_state["stats"]["duels_won"][defender["owner"]] += 1
        if attacker["role"] == "flag":
            end_match(match_state, defender["owner"], f"{match_state['owner_names'][defender['owner']]} captured the enemy flag.")

    match_state["last_duel"] = duel


def resolve_attack(match_state: dict[str, Any], attacker: dict[str, Any], defender: dict[str, Any]) -> None:
    attacker_weapon = attacker["weapon"]
    defender_weapon = defender["weapon"]
    tie_count = 0

    if attacker["role"] == "decoy":
        winner: Literal["attacker", "defender"] = "attacker"
    elif defender["role"] == "decoy":
        winner = "defender"
    else:
        outcome = duel_result(attacker_weapon, defender_weapon)
        while outcome == "tie":
            tie_count += 1
            attacker_weapon = random.choice(WEAPONS)
            defender_weapon = random.choice(WEAPONS)
            outcome = duel_result(attacker_weapon, defender_weapon)
        winner = outcome

    apply_duel_outcome(match_state, attacker, defender, winner, attacker_weapon, defender_weapon, tie_count)


def execute_move(match_state: dict[str, Any], piece: dict[str, Any], target_row: int, target_col: int) -> None:
    occupant = find_piece_at(match_state, target_row, target_col)
    if occupant and occupant["owner"] == piece["owner"]:
        raise HTTPException(status_code=400, detail="Cannot move onto a friendly piece.")

    if occupant:
        resolve_attack(match_state, piece, occupant)
        if piece["alive"] and not occupant["alive"]:
            piece["row"] = target_row
            piece["col"] = target_col
    else:
        piece["row"] = target_row
        piece["col"] = target_col
        match_state["last_duel"] = None

    if match_state["phase"] != "finished":
        match_state["phase"] = "turn"
        match_state["current_turn"] = other_owner(piece["owner"])
        set_turn_deadline(match_state)


@router.post("/api/auth/google")
def google_login(payload: GoogleLoginRequest) -> dict[str, Any]:
    user = verify_google_identity(payload.credential)
    USERS[str(user["id"])] = user
    token = create_session_token(str(user["id"]))
    return {
        "token": token,
        "user": user_view(user),
    }


@router.post("/api/friend/rooms")
def create_friend_room(
    payload: FriendRoomCreateRequest,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room_id = uuid.uuid4().hex[:8]
    room = {
        "id": room_id,
        "host_user_id": str(current_user["id"]),
        "guest_user_id": None,
        "difficulty": payload.difficulty,
        "turn_duration_seconds": payload.turn_duration_seconds or turn_duration_for_difficulty(payload.difficulty),
        "created_at": time.time(),
        "status": "waiting",
        "match": None,
    }
    FRIEND_ROOMS[room_id] = room
    return build_room_view(room, str(current_user["id"]))


@router.post("/api/friend/rooms/{room_id}/join")
def join_friend_room(
    room_id: str,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room = room_or_404(room_id)
    user_id = str(current_user["id"])

    if room["host_user_id"] == user_id:
        return build_room_view(room, user_id)

    guest_user_id = room.get("guest_user_id")
    if guest_user_id and guest_user_id != user_id:
        raise HTTPException(status_code=409, detail="This friend room already has two players.")

    room["guest_user_id"] = user_id
    if room.get("match") is None:
        room["match"] = create_friend_match(room)
    maybe_mark_room_status(room)
    return build_room_view(room, user_id)


@router.get("/api/auth/me")
def get_current_user_endpoint(
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    return user_view(current_user)


@router.get("/api/friend/rooms/{room_id}")
def get_friend_room(
    room_id: str,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room = room_or_404(room_id)
    user_id = str(current_user["id"])
    role_for_user(room, user_id)
    if room.get("match"):
        maybe_advance_reveal(room["match"])
        resolve_turn_timeout(room["match"])
        maybe_mark_room_status(room)
    return build_room_view(room, user_id)


def match_for_room_player(room_id: str, current_user: dict[str, str | None]) -> tuple[dict[str, Any], dict[str, Any], ActualOwner]:
    room = room_or_404(room_id)
    user_id = str(current_user["id"])
    owner = role_for_user(room, user_id)
    match_state = room.get("match")
    if not match_state:
        raise HTTPException(status_code=409, detail="Waiting for your friend to join the room.")
    maybe_advance_reveal(match_state)
    resolve_turn_timeout(match_state)
    maybe_mark_room_status(room)
    return room, match_state, owner


@router.post("/api/friend/rooms/{room_id}/shuffle")
def shuffle_friend_positions(
    room_id: str,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room, match_state, owner = match_for_room_player(room_id, current_user)
    if match_state["phase"] != "reveal":
        raise HTTPException(status_code=400, detail="You can only shuffle during the reveal phase.")
    if selected_role_piece(match_state, owner, "flag") or selected_role_piece(match_state, owner, "decoy"):
        raise HTTPException(status_code=400, detail="Shuffle is only available before choosing your special pieces.")

    shuffle_owner_positions(match_state, owner)
    return build_room_view(room, str(current_user["id"]))


@router.post("/api/friend/rooms/{room_id}/flag")
def choose_friend_flag(
    room_id: str,
    payload: FriendPieceRequest,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room, match_state, owner = match_for_room_player(room_id, current_user)
    if match_state["phase"] != "reveal":
        raise HTTPException(status_code=400, detail="You can only choose your flag during the reveal phase.")

    piece = owner_piece_for_view(room, owner, payload.piece_id)
    if piece["role"] == "decoy":
        raise HTTPException(status_code=400, detail="Choose a different piece for your flag.")

    current_flag = selected_role_piece(match_state, owner, "flag")
    if current_flag:
        current_flag["role"] = "soldier"
    piece["role"] = "flag"

    maybe_advance_reveal(match_state)
    return build_room_view(room, str(current_user["id"]))


@router.post("/api/friend/rooms/{room_id}/decoy")
def choose_friend_decoy(
    room_id: str,
    payload: FriendPieceRequest,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room, match_state, owner = match_for_room_player(room_id, current_user)
    if match_state["phase"] != "reveal":
        raise HTTPException(status_code=400, detail="You can only choose your decoy during the reveal phase.")

    piece = owner_piece_for_view(room, owner, payload.piece_id)
    if piece["role"] == "flag":
        raise HTTPException(status_code=400, detail="Choose a different piece for your decoy.")

    current_decoy = selected_role_piece(match_state, owner, "decoy")
    if current_decoy:
        current_decoy["role"] = "soldier"
    piece["role"] = "decoy"

    maybe_advance_reveal(match_state)
    return build_room_view(room, str(current_user["id"]))


@router.post("/api/friend/rooms/{room_id}/reveal/swap")
def swap_friend_reveal_piece(
    room_id: str,
    payload: FriendRevealSwapRequest,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room, match_state, owner = match_for_room_player(room_id, current_user)
    if match_state["phase"] != "reveal":
        raise HTTPException(status_code=400, detail="You can only rearrange special pieces during the reveal phase.")
    if not owner_ready(match_state, owner):
        raise HTTPException(status_code=400, detail="Choose both your flag and decoy before dragging them.")

    source_piece = owner_piece_for_view(room, owner, payload.piece_id)
    if source_piece["role"] not in {"flag", "decoy"}:
        raise HTTPException(status_code=400, detail="Only your flag and decoy can be dragged.")

    target_row, target_col = view_to_actual_coords(owner, payload.target_row, payload.target_col)
    if target_row not in start_rows_for(owner) or not (1 <= target_col <= BOARD_COLS):
        raise HTTPException(status_code=400, detail="You can only place special pieces on your own side.")

    target_piece = find_piece_at(match_state, target_row, target_col)
    if not target_piece or target_piece["owner"] != owner:
        raise HTTPException(status_code=400, detail="Pick one of your own squares to swap into.")

    source_piece["row"], target_piece["row"] = target_piece["row"], source_piece["row"]
    source_piece["col"], target_piece["col"] = target_piece["col"], source_piece["col"]

    maybe_advance_reveal(match_state)
    return build_room_view(room, str(current_user["id"]))


@router.post("/api/friend/rooms/{room_id}/move")
def move_friend_piece(
    room_id: str,
    payload: FriendMoveRequest,
    current_user: dict[str, str | None] = Depends(require_user),
) -> dict[str, Any]:
    room, match_state, owner = match_for_room_player(room_id, current_user)
    if match_state["phase"] != "turn":
        raise HTTPException(status_code=400, detail="The shared match is not in the movement phase yet.")
    if match_state["current_turn"] != owner:
        raise HTTPException(status_code=400, detail="It is not your turn.")

    piece = owner_piece_for_view(room, owner, payload.piece_id)
    if piece["role"] == "decoy":
        raise HTTPException(status_code=400, detail="Your Decoy Totem cannot move.")

    target_row, target_col = view_to_actual_coords(owner, payload.target_row, payload.target_col)
    if not (1 <= target_row <= BOARD_ROWS and 1 <= target_col <= BOARD_COLS):
        raise HTTPException(status_code=400, detail="Target is out of bounds.")
    if not is_adjacent(piece, target_row, target_col):
        raise HTTPException(status_code=400, detail="Target must be exactly one square away.")

    execute_move(match_state, piece, target_row, target_col)
    return build_room_view(room, str(current_user["id"]))
