import type { Difficulty, DuelSummary, MatchView, Owner, Phase, Piece, Role, Weapon } from "@shared/types";
import { BOARD_COLS, BOARD_ROWS, REVEAL_DURATION_SECONDS, UNITS_PER_SQUAD } from "@shared/constants";

// ── Internal types ─────────────────────────────────────────────────

interface InternalPiece {
  id: string;
  owner: Owner;
  name: string;
  weapon: Weapon;
  role: Role;
  row: number;
  col: number;
  alive: boolean;
}

interface PendingRepick {
  attackerId: string;
  targetId: string;
  initiatedBy: Owner;
  attackerWeapon: Weapon;
  defenderWeapon: Weapon;
  moveTo?: { row: number; col: number };
}

interface InternalMatchState {
  id: string;
  difficulty: Difficulty;
  turnDurationSeconds: number;
  phase: Phase;
  currentTurn: Owner | "none";
  startedAt: number;
  revealEndsAt: number;
  message: string;
  pieces: InternalPiece[];
  turnEndsAt: number | null;
  stats: {
    playerDuelsWon: number;
    playerDuelsLost: number;
    tieSequences: number;
    decoyAbsorbed: number;
  };
  knownPlayerWeapons: Record<string, Weapon>;
  knownAiWeapons: Record<string, Weapon>;
  lastDuel: DuelSummary | null;
  pendingRepick: PendingRepick | null;
  result: { winner: Owner; reason: string } | null;
}

// ── State store ────────────────────────────────────────────────────

const MATCHES = new Map<string, InternalMatchState>();

// ── Constants ──────────────────────────────────────────────────────

const WEAPONS: Weapon[] = ["rock", "paper", "scissors"];
const WEAPON_ICON: Record<Weapon, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
const ROLE_ICON: Record<Role, string> = { flag: "🚩", decoy: "🎭", soldier: "•" };
const DUEL_TURN_BUFFER_SECONDS = 2;
const PLAYER_START_ROWS = [1, 2];
const AI_START_ROWS = [BOARD_ROWS, BOARD_ROWS - 1];

const PLAYER_NAMES = [
  "Captain Quartz", "Paper Lantern", "Scissor Jack",
  "Ribbon Riot",    "Pebble Nova",   "Ink Talon",
  "Chisel Bloom",   "Origami Volt",  "Velvet Fang",
  "Static Ace",     "Ember Knot",    "Granite Pulse",
  "Riddle Crest",   "Jade Slash",
];

const AI_NAMES = [
  "Oracle Flint", "Fable Sheet", "Razor Moth",
  "Cipher Ribbon", "Gravel Echo", "Signal Veil",
  "Chrome Snip",  "Banner Ghost", "Prism Grit",
  "Comet Shear",  "Vector Shale", "Echo Crest",
  "Neon Snare",   "Halo Shard",
];

// ── Utilities ──────────────────────────────────────────────────────

function randId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nowSec(): number {
  return Date.now() / 1000;
}

// ── Board helpers ──────────────────────────────────────────────────

function isAdjacent(piece: InternalPiece, row: number, col: number): boolean {
  const dr = Math.abs(piece.row - row);
  const dc = Math.abs(piece.col - col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

function findPieceAt(state: InternalMatchState, row: number, col: number): InternalPiece | undefined {
  return state.pieces.find(p => p.alive && p.row === row && p.col === col);
}

function getValidMoves(piece: InternalPiece, state: InternalMatchState): Array<{ row: number; col: number }> {
  return [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 }]
    .map(({ dr, dc }) => ({ row: piece.row + dr, col: piece.col + dc }))
    .filter(({ row, col }) => {
      if (row < 1 || row > BOARD_ROWS || col < 1 || col > BOARD_COLS) return false;
      const occ = findPieceAt(state, row, col);
      return !occ || occ.owner !== piece.owner;
    });
}

// ── Squad generation ───────────────────────────────────────────────

function balancedWeapons(): Weapon[] {
  return fisherYatesShuffle(
    Array.from({ length: UNITS_PER_SQUAD }, (_, i) => WEAPONS[i % WEAPONS.length]),
  );
}

function buildPiece(owner: Owner, name: string, weapon: Weapon, row: number, col: number): InternalPiece {
  return { id: `${owner}-${randId()}`, owner, name, weapon, role: "soldier", row, col, alive: true };
}

function generateSquads(): { player: InternalPiece[]; ai: InternalPiece[] } {
  const pw = balancedWeapons();
  const aw = balancedWeapons();
  const player: InternalPiece[] = [];
  const ai: InternalPiece[] = [];

  for (let i = 0; i < UNITS_PER_SQUAD; i++) {
    player.push(buildPiece("player", PLAYER_NAMES[i], pw[i], PLAYER_START_ROWS[Math.floor(i / BOARD_COLS)], (i % BOARD_COLS) + 1));
    ai.push(buildPiece("ai", AI_NAMES[i], aw[i], AI_START_ROWS[Math.floor(i / BOARD_COLS)], (i % BOARD_COLS) + 1));
  }

  return { player, ai };
}

function startPositionsFor(owner: Owner): Array<{ row: number; col: number }> {
  const rows = owner === "player" ? PLAYER_START_ROWS : AI_START_ROWS;
  return rows.flatMap(row => Array.from({ length: BOARD_COLS }, (_, i) => ({ row, col: i + 1 })));
}

// ── Turn / reveal helpers ──────────────────────────────────────────

function setTurnDeadline(state: InternalMatchState, seconds?: number): void {
  state.turnEndsAt = nowSec() + (seconds ?? state.turnDurationSeconds);
}

function selectedPlayerFlag(state: InternalMatchState): InternalPiece | undefined {
  return state.pieces.find(p => p.owner === "player" && p.alive && p.role === "flag");
}

function timedTurnOwner(state: InternalMatchState): Owner | null {
  if (state.phase === "player_turn" || state.phase === "repick") return "player";
  if (state.phase === "ai_turn") return "ai";
  return null;
}

function endMatch(state: InternalMatchState, winner: Owner, reason: string): void {
  state.phase = "finished";
  state.currentTurn = "none";
  state.turnEndsAt = null;
  state.result = { winner, reason };
  state.message = reason;
}

function resolveRevealTimeout(state: InternalMatchState): boolean {
  if (state.phase !== "reveal" || nowSec() < state.revealEndsAt || selectedPlayerFlag(state)) return false;
  endMatch(state, "ai", "Time ran out before you placed your flag.");
  return true;
}

function resolveTurnTimeout(state: InternalMatchState): boolean {
  const owner = timedTurnOwner(state);
  if (!owner || state.turnEndsAt === null || nowSec() < state.turnEndsAt) return false;
  if (owner === "player") endMatch(state, "ai", "Time ran out on your turn.");
  else endMatch(state, "player", "AI ran out of time.");
  return true;
}

// ── Role assignment ────────────────────────────────────────────────

function assignRoles(state: InternalMatchState): void {
  for (const owner of ["player", "ai"] as Owner[]) {
    const pieces = state.pieces.filter(p => p.owner === owner && p.alive);
    const chosenFlag = owner === "player" ? selectedPlayerFlag(state) : undefined;
    pieces.forEach(p => { p.role = "soldier"; });
    const flagPiece = (chosenFlag && pieces.includes(chosenFlag)) ? chosenFlag : randomChoice(pieces);
    const decoyPiece = randomChoice(pieces.filter(p => p.id !== flagPiece.id));
    flagPiece.role = "flag";
    decoyPiece.role = "decoy";
  }
}

// ── View helpers ───────────────────────────────────────────────────

function visiblePiece(piece: InternalPiece, phase: Phase, finished: boolean): Piece {
  const isOwner = piece.owner === "player";
  const showWeapon = phase === "reveal" || isOwner || finished;
  const showRole =
    (isOwner && phase !== "reveal") ||
    (isOwner && phase === "reveal" && piece.role === "flag") ||
    (finished && piece.role !== "soldier");

  return {
    id: piece.id,
    owner: piece.owner,
    row: piece.row,
    col: piece.col,
    alive: piece.alive,
    label: isOwner || finished ? piece.name : "Hidden Operative",
    weapon: showWeapon && piece.alive ? piece.weapon : null,
    weaponIcon: showWeapon && piece.alive ? WEAPON_ICON[piece.weapon] : null,
    role: showRole && piece.alive ? piece.role : null,
    roleIcon: showRole && piece.alive ? ROLE_ICON[piece.role] : null,
    silhouette: !showWeapon && piece.alive,
  };
}

function buildView(state: InternalMatchState): MatchView {
  const finished = state.phase === "finished";
  const view: MatchView = {
    matchId: state.id,
    phase: state.phase,
    currentTurn: state.currentTurn,
    difficulty: state.difficulty,
    turnDurationSeconds: state.turnDurationSeconds,
    message: state.message,
    board: state.pieces.map(p => visiblePiece(p, state.phase, finished)),
    stats: {
      durationSeconds: Math.floor(nowSec() - state.startedAt),
      playerDuelsWon: state.stats.playerDuelsWon,
      playerDuelsLost: state.stats.playerDuelsLost,
      tieSequences: state.stats.tieSequences,
      decoyAbsorbed: state.stats.decoyAbsorbed,
    },
    revealEndsAt: state.revealEndsAt,
    turnEndsAt: state.turnEndsAt,
    duel: state.lastDuel,
    result: state.result,
  };

  if (state.phase === "repick" && state.pendingRepick) {
    view.repick = { attackerId: state.pendingRepick.attackerId, targetId: state.pendingRepick.targetId };
  }

  return view;
}

function getState(matchId: string): InternalMatchState {
  const s = MATCHES.get(matchId);
  if (!s) throw new Error("Match not found.");
  return s;
}

// ── Combat resolution ──────────────────────────────────────────────

function duelOutcome(aw: Weapon, dw: Weapon): "attacker" | "defender" | "tie" {
  if (aw === dw) return "tie";
  const wins = new Set(["rock-scissors", "paper-rock", "scissors-paper"]);
  return wins.has(`${aw}-${dw}`) ? "attacker" : "defender";
}

function applyDuelOutcome(
  state: InternalMatchState,
  attacker: InternalPiece,
  defender: InternalPiece,
  winner: "attacker" | "defender",
  aw: Weapon,
  dw: Weapon,
  initiatedBy: Owner,
): void {
  const duel: DuelSummary = {
    attackerId: attacker.id, attackerName: attacker.name, attackerWeapon: aw,
    defenderId: defender.id, defenderName: defender.name, defenderWeapon: dw,
    winner, tie: false, decoyAbsorbed: false,
  };

  attacker.weapon = aw;
  defender.weapon = dw;
  state.knownPlayerWeapons[attacker.id] = aw;
  state.knownAiWeapons[defender.id] = dw;

  if (winner === "attacker") {
    if (defender.role === "decoy") {
      duel.decoyAbsorbed = true;
      state.stats.decoyAbsorbed++;
      state.message = `${defender.name} was the Decoy and absorbed the attack.`;
    } else {
      defender.alive = false;
      duel.eliminatedId = defender.id;
      duel.revealedRole = defender.role ?? undefined;
      if (attacker.owner === "player") state.stats.playerDuelsWon++;
      else state.stats.playerDuelsLost++;
      if (defender.role === "flag") {
        endMatch(state, attacker.owner, attacker.owner === "player" ? "Enemy flag captured." : "Your flag was defeated.");
      } else {
        state.message = `${attacker.name} won the duel.`;
      }
    }
  } else {
    attacker.alive = false;
    duel.eliminatedId = attacker.id;
    duel.revealedRole = attacker.role ?? undefined;
    if (attacker.owner === "player") state.stats.playerDuelsLost++;
    else state.stats.playerDuelsWon++;
    if (attacker.role === "flag") {
      endMatch(state, defender.owner, defender.owner === "ai" ? "Your flag was defeated." : "Enemy flag captured.");
    } else {
      state.message = `${defender.name} defended successfully.`;
    }
  }

  if (state.phase !== "finished") {
    state.phase = initiatedBy === "player" ? "ai_turn" : "player_turn";
    state.currentTurn = initiatedBy === "player" ? "ai" : "player";
    setTurnDeadline(state, state.turnDurationSeconds + DUEL_TURN_BUFFER_SECONDS);
  }
  state.lastDuel = duel;
}

function resolveAttack(
  state: InternalMatchState,
  attacker: InternalPiece,
  defender: InternalPiece,
  initiatedBy: Owner,
  attackerWeapon?: Weapon,
  defenderWeapon?: Weapon,
): void {
  const aw = attackerWeapon ?? attacker.weapon;
  const dw = defenderWeapon ?? defender.weapon;
  const outcome = duelOutcome(aw, dw);

  if (outcome === "tie") {
    state.phase = "repick";
    state.currentTurn = "player";
    state.stats.tieSequences++;
    state.message = "Tie. Pick a new weapon to continue the duel.";
    state.lastDuel = {
      attackerId: attacker.id, attackerName: attacker.name, attackerWeapon: aw,
      defenderId: defender.id, defenderName: defender.name, defenderWeapon: dw,
      winner: "tie", tie: true, decoyAbsorbed: false,
    };
    state.pendingRepick = { attackerId: attacker.id, targetId: defender.id, initiatedBy, attackerWeapon: aw, defenderWeapon: dw };
    setTurnDeadline(state);
    return;
  }

  state.pendingRepick = null;
  applyDuelOutcome(state, attacker, defender, outcome, aw, dw, initiatedBy);
}

// ── Movement ───────────────────────────────────────────────────────

function executeMove(
  state: InternalMatchState,
  piece: InternalPiece,
  targetRow: number,
  targetCol: number,
  initiatedBy: Owner,
): void {
  const occupant = findPieceAt(state, targetRow, targetCol);
  if (occupant?.owner === piece.owner) return;

  if (occupant) {
    resolveAttack(state, piece, occupant, initiatedBy);
    if (piece.alive && !occupant.alive) { piece.row = targetRow; piece.col = targetCol; }
    else if (state.phase === "repick" && state.pendingRepick) {
      state.pendingRepick.moveTo = { row: targetRow, col: targetCol };
    }
  } else {
    piece.row = targetRow;
    piece.col = targetCol;
    state.phase = initiatedBy === "player" ? "ai_turn" : "player_turn";
    state.currentTurn = initiatedBy === "player" ? "ai" : "player";
    setTurnDeadline(state);
    state.message = initiatedBy === "player" ? "AI is choosing..." : "Your turn. Select a piece to move.";
    state.lastDuel = null;
  }
}

// ── AI ─────────────────────────────────────────────────────────────

function chooseAiMove(state: InternalMatchState): { piece: InternalPiece | null; row: number; col: number } {
  const aiPieces = state.pieces.filter(p => p.owner === "ai" && p.alive);
  if (!aiPieces.length) return { piece: null, row: 0, col: 0 };

  const { difficulty, knownPlayerWeapons: known } = state;
  const attackMoves: Array<{ piece: InternalPiece; row: number; col: number; target: InternalPiece }> = [];
  const plainMoves: Array<{ piece: InternalPiece; row: number; col: number }> = [];

  for (const aiPiece of aiPieces) {
    for (const { row, col } of getValidMoves(aiPiece, state)) {
      const occ = findPieceAt(state, row, col);
      if (occ?.owner === "player") attackMoves.push({ piece: aiPiece, row, col, target: occ });
      else plainMoves.push({ piece: aiPiece, row, col });
    }
  }

  if (difficulty === "hard") {
    const flag = state.pieces.find(p => p.owner === "player" && p.alive && p.role === "flag");
    if (flag) {
      const hunt = attackMoves.find(m => m.target.id === flag.id);
      if (hunt) return hunt;
    }
  }

  if (difficulty === "medium" || difficulty === "hard") {
    for (const m of attackMoves) {
      const w = known[m.target.id];
      if (w && duelOutcome(m.piece.weapon, w) === "attacker") return m;
    }
  }

  if (attackMoves.length) return randomChoice(attackMoves);
  if (plainMoves.length) return randomChoice(plainMoves);
  return { piece: null, row: 0, col: 0 };
}

// ── Public API ─────────────────────────────────────────────────────

export function createMatch(difficulty: Difficulty, turnDurationSeconds: number): MatchView {
  const { player, ai } = generateSquads();
  const startedAt = nowSec();
  const state: InternalMatchState = {
    id: randId() + randId(),
    difficulty,
    turnDurationSeconds,
    phase: "reveal",
    currentTurn: "player",
    startedAt,
    revealEndsAt: startedAt + REVEAL_DURATION_SECONDS,
    message: "Memorize the enemy squad before the reveal timer ends.",
    pieces: [...player, ...ai],
    turnEndsAt: null,
    stats: { playerDuelsWon: 0, playerDuelsLost: 0, tieSequences: 0, decoyAbsorbed: 0 },
    knownPlayerWeapons: {},
    knownAiWeapons: {},
    lastDuel: null,
    pendingRepick: null,
    result: null,
  };
  MATCHES.set(state.id, state);
  return buildView(state);
}

export function completeReveal(matchId: string): MatchView {
  const state = getState(matchId);
  if (state.phase !== "reveal") return buildView(state);
  if (resolveRevealTimeout(state)) return buildView(state);
  if (!selectedPlayerFlag(state)) throw new Error("Choose your flag before starting the match.");
  assignRoles(state);
  state.phase = "player_turn";
  state.currentTurn = "player";
  setTurnDeadline(state);
  state.message = "Your turn. Select one of your front units and move to a highlighted square.";
  return buildView(state);
}

export function shufflePlayerPiecesEngine(matchId: string): MatchView {
  const state = getState(matchId);
  if (resolveRevealTimeout(state)) return buildView(state);
  if (state.phase !== "reveal") throw new Error("You can only shuffle during the reveal phase.");
  if (selectedPlayerFlag(state)) throw new Error("Shuffle is only available before choosing your flag.");
  const positions = fisherYatesShuffle(startPositionsFor("player"));
  const pieces = state.pieces.filter(p => p.owner === "player" && p.alive);
  pieces.forEach((p, i) => { p.row = positions[i].row; p.col = positions[i].col; });
  state.message = "Your squad positions were shuffled.";
  return buildView(state);
}

export function choosePlayerFlagEngine(matchId: string, pieceId: string): MatchView {
  const state = getState(matchId);
  if (resolveRevealTimeout(state)) return buildView(state);
  if (state.phase !== "reveal") throw new Error("You can only choose your flag during the reveal phase.");
  const piece = state.pieces.find(p => p.id === pieceId && p.owner === "player" && p.alive);
  if (!piece) throw new Error("Invalid player piece.");
  state.pieces.filter(p => p.owner === "player" && p.alive).forEach(p => { p.role = "soldier"; });
  piece.role = "flag";
  state.message = `Flag placed at row ${piece.row}, col ${piece.col}.`;
  return buildView(state);
}

export function playerMoveEngine(matchId: string, pieceId: string, targetRow: number, targetCol: number): MatchView {
  const state = getState(matchId);
  if (resolveTurnTimeout(state)) return buildView(state);
  if (state.phase !== "player_turn") throw new Error("It is not the player's turn.");
  const piece = state.pieces.find(p => p.id === pieceId && p.alive && p.owner === "player");
  if (!piece) throw new Error("Invalid piece.");
  if (!isAdjacent(piece, targetRow, targetCol)) throw new Error("Target must be exactly one square away.");
  if (targetRow < 1 || targetRow > BOARD_ROWS || targetCol < 1 || targetCol > BOARD_COLS)
    throw new Error("Target is out of bounds.");
  const occupant = findPieceAt(state, targetRow, targetCol);
  if (occupant?.owner === "player") throw new Error("Cannot move onto a friendly piece.");
  executeMove(state, piece, targetRow, targetCol, "player");
  return buildView(state);
}

export function tieRepickEngine(matchId: string, weapon: Weapon): MatchView {
  const state = getState(matchId);
  if (resolveTurnTimeout(state)) return buildView(state);
  if (state.phase !== "repick" || !state.pendingRepick) throw new Error("No tie repick is pending.");
  const pending = state.pendingRepick;
  const attacker = state.pieces.find(p => p.id === pending.attackerId)!;
  const defender = state.pieces.find(p => p.id === pending.targetId)!;

  if (pending.initiatedBy === "player") {
    resolveAttack(state, attacker, defender, "player", weapon, randomChoice(WEAPONS));
  } else {
    resolveAttack(state, attacker, defender, "ai", randomChoice(WEAPONS), weapon);
  }

  if (pending.moveTo && attacker.alive && !defender.alive) {
    attacker.row = pending.moveTo.row;
    attacker.col = pending.moveTo.col;
  }
  return buildView(state);
}

export function aiMoveEngine(matchId: string): MatchView {
  const state = getState(matchId);
  if (resolveTurnTimeout(state)) return buildView(state);
  if (state.phase !== "ai_turn") throw new Error("It is not the AI turn.");

  const { piece, row, col } = chooseAiMove(state);
  if (!piece) {
    state.phase = "player_turn";
    state.currentTurn = "player";
    setTurnDeadline(state);
    state.message = "Your turn. Select one of your front units and move to a highlighted square.";
    return buildView(state);
  }

  executeMove(state, piece, row, col, "ai");
  return buildView(state);
}

export function turnTimeoutEngine(matchId: string): MatchView {
  const state = getState(matchId);
  resolveRevealTimeout(state);
  resolveTurnTimeout(state);
  return buildView(state);
}
