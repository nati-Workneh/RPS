import type { Difficulty, MatchView } from "@shared/types";

export interface AuthUser {
  id: string;
  displayName: string | null;
  email: string | null;
  picture: string | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface FriendRoomView {
  roomId: string;
  status: "waiting" | "playing" | "finished";
  difficulty: Difficulty;
  turnDurationSeconds: number;
  currentUserRole: "host" | "guest";
  host: AuthUser;
  guest: AuthUser | null;
  playerProfile: AuthUser;
  opponentProfile: AuthUser | null;
  match: MatchView | null;
}

async function requestJson<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.detail ?? payload.message ?? message;
    } catch {
      // Ignore JSON parse issues and keep the fallback error message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function loginWithGoogle(credential: string): Promise<AuthSession> {
  return requestJson<AuthSession>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export function fetchCurrentUser(token: string): Promise<AuthUser> {
  return requestJson<AuthUser>("/api/auth/me", { method: "GET" }, token);
}

export function createFriendRoom(
  token: string,
  difficulty: Difficulty,
  turnDurationSeconds: number,
): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    "/api/friend/rooms",
    {
      method: "POST",
      body: JSON.stringify({ difficulty, turnDurationSeconds }),
    },
    token,
  );
}

export function joinFriendRoom(token: string, roomId: string): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    `/api/friend/rooms/${roomId}/join`,
    { method: "POST" },
    token,
  );
}

export function getFriendRoom(token: string, roomId: string): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(`/api/friend/rooms/${roomId}`, { method: "GET" }, token);
}

export function shuffleFriendPieces(token: string, roomId: string): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    `/api/friend/rooms/${roomId}/shuffle`,
    { method: "POST" },
    token,
  );
}

export function chooseFriendFlag(token: string, roomId: string, pieceId: string): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    `/api/friend/rooms/${roomId}/flag`,
    {
      method: "POST",
      body: JSON.stringify({ pieceId }),
    },
    token,
  );
}

export function chooseFriendDecoy(token: string, roomId: string, pieceId: string): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    `/api/friend/rooms/${roomId}/decoy`,
    {
      method: "POST",
      body: JSON.stringify({ pieceId }),
    },
    token,
  );
}

export function swapFriendRevealPiece(
  token: string,
  roomId: string,
  pieceId: string,
  targetRow: number,
  targetCol: number,
): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    `/api/friend/rooms/${roomId}/reveal/swap`,
    {
      method: "POST",
      body: JSON.stringify({ pieceId, targetRow, targetCol }),
    },
    token,
  );
}

export function moveFriendPiece(
  token: string,
  roomId: string,
  pieceId: string,
  targetRow: number,
  targetCol: number,
): Promise<FriendRoomView> {
  return requestJson<FriendRoomView>(
    `/api/friend/rooms/${roomId}/move`,
    {
      method: "POST",
      body: JSON.stringify({ pieceId, targetRow, targetCol }),
    },
    token,
  );
}
