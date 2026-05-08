import type { CSSProperties } from "react";
import { Phase, DuelSummary, MatchStats, Difficulty, MatchView, Weapon } from "@shared/types";
import {
  REVEAL_DURATION_SECONDS,
  UNITS_PER_SQUAD,
  getTurnDurationForDifficulty,
} from "@shared/constants";

interface SidebarProps {
  phase:        Phase;
  revealTimer:  number;
  turnTimer:    number;
  stats:        MatchStats;
  match:        MatchView;
  difficulty:   Difficulty;
  loading:      boolean;
  onShufflePositions: () => Promise<void>;
  onResetGame:  () => Promise<void>;
  onBackToMenu: () => void;
  onOpenSettings: () => void;
}

const DIFF_COLOR: Record<Difficulty, string> = {
  easy:   "#44DD66",
  medium: "#FFAA22",
  hard:   "#FF4444",
};

const WEAPON_EMOJI: Record<Weapon, string> = {
  rock: "🪨", paper: "📄", scissors: "✂️",
};

const PHASE_LABEL: Record<string, { text: string; color: string }> = {
  reveal:      { text: "MEMORIZE",    color: "#FFAA22" },
  player_turn: { text: "YOUR TURN",  color: "#44DD66" },
  ai_turn:     { text: "AI MOVING",  color: "#00A3FF" },
  repick:      { text: "TIE — REPICK", color: "#FFAA22" },
  finished:    { text: "GAME OVER",  color: "#A0A0A0" },
};

const GLASS: CSSProperties = {
  background:   "#1F231B",
  border:       "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: "10px",
};

export function Sidebar({
  phase, revealTimer, turnTimer, stats, match, difficulty, loading, onShufflePositions, onResetGame, onBackToMenu, onOpenSettings,
}: SidebarProps) {
  const aliveAi     = match.board.filter(p => p.owner === "ai"     && p.alive).length;
  const alivePlayer = match.board.filter(p => p.owner === "player" && p.alive).length;
  const hasPlayerFlag = match.board.some(
    (piece) => piece.owner === "player" && piece.alive && piece.role === "flag",
  );
  const hasPlayerDecoy = match.board.some(
    (piece) => piece.owner === "player" && piece.alive && piece.role === "decoy",
  );
  const totalAlive  = aliveAi + alivePlayer;
  // Fraction of total alive that belongs to the player (0–1), clamped to [0.05, 0.95]
  const playerFrac  = totalAlive > 0
    ? Math.min(0.95, Math.max(0.05, alivePlayer / totalAlive))
    : 0.5;

  const phaseInfo = PHASE_LABEL[phase] ?? { text: "...", color: "#A0A0A0" };
  const showTurnTimer = phase === "player_turn" || phase === "ai_turn" || phase === "repick";
  const turnDuration = match.turnDurationSeconds || getTurnDurationForDifficulty(difficulty);
  const displayTurnTimer = Math.min(turnTimer, turnDuration);

  return (
    <div
      data-testid="sidebar"
      style={{
        width:         "var(--sidebar-width)",
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           "6px",
        padding:       "8px 6px",
        overflowY:     "auto",
      }}
    >
      {/* Logo */}
      <img
        src="/game_logo_squad_rps.png"
        alt="Squad RPS"
        style={{ width: "82px", objectFit: "contain" }}
        onError={(e) => {
          const el = e.target as HTMLImageElement;
          el.style.display = "none";
          el.insertAdjacentHTML("afterend", `<div style="font-family:var(--font-heading);font-size:1.8rem;font-style:italic;color:var(--color-logo-text);line-height:1;text-align:center">SQUAD<br><span style="font-size:0.7rem;color:var(--color-text);letter-spacing:0.1em">RPS</span></div>`);
        }}
      />

      {/* Opponent profile card */}
      <div style={{ ...GLASS, width: "100%", padding: "7px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <img
            src="/character_blue_idle_nobg.png"
            alt="AI"
            style={{ width: "30px", height: "30px", objectFit: "contain" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily:    "var(--font-body)",
              fontSize:      "0.62rem",
              fontWeight:    700,
              color:         "var(--color-label-cpu)",
              letterSpacing: "0.5px",
            }}>
              AI SQUAD
            </div>
            {/* Difficulty badge */}
            <span style={{
              fontFamily:    "var(--font-body)",
              fontSize:      "0.5rem",
              fontWeight:    700,
              color:         DIFF_COLOR[difficulty],
              border:        `1px solid ${DIFF_COLOR[difficulty]}`,
              borderRadius:  "3px",
              padding:       "1px 5px",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}>
              {difficulty}
            </span>
          </div>
          {/* Settings / pause icon */}
          <button
            type="button"
            title="Settings"
            aria-label="Open settings"
            onClick={onOpenSettings}
            style={{
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              color:      "var(--color-text-muted)",
              fontSize:   "0.8rem",
              padding:    "2px",
              lineHeight: 1,
            }}
          >
            ⚙️
          </button>
        </div>

        {/* AI health bar */}
        <div style={{ marginTop: "5px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.5rem", color: "var(--color-text-muted)" }}>UNITS</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--color-label-cpu)" }}>
              {aliveAi}/{UNITS_PER_SQUAD}
            </span>
          </div>
          <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{
              height:       "100%",
              width:        `${(aliveAi / UNITS_PER_SQUAD) * 100}%`,
              background:   "var(--color-label-cpu)",
              borderRadius: "2px",
              transition:   "width 0.4s ease",
            }} />
          </div>
        </div>
      </div>

      {/* Phase indicator */}
      <div style={{
        fontFamily:    "var(--font-body)",
        fontSize:      "0.6rem",
        fontWeight:    700,
        color:         phaseInfo.color,
        letterSpacing: "0.9px",
        padding:       "3px 8px",
        background:    "rgba(0,0,0,0.4)",
        borderRadius:  "20px",
        border:        `1px solid ${phaseInfo.color}33`,
      }}>
        {phase === "reveal"
          ? `👁 ${revealTimer}s`
          : showTurnTimer
          ? `${phaseInfo.text} ${displayTurnTimer}s`
          : phaseInfo.text}
      </div>

      {/* Scoreboard */}
      <div style={{ ...GLASS, width: "100%", padding: "7px 8px" }}>
        <div style={{
          fontFamily:    "var(--font-body)",
          fontSize:      "0.5rem",
          color:         "var(--color-text-muted)",
          letterSpacing: "1.5px",
          textAlign:     "center",
          marginBottom:  "4px",
        }}>
          UNITS REMAINING
        </div>

        {/* AI vs YOU counters */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "var(--color-label-cpu)", lineHeight: 1 }}>
              {aliveAi}
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.45rem", color: "var(--color-text-muted)", marginTop: "1px" }}>AI</div>
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.64rem", color: "rgba(255,255,255,0.2)" }}>vs</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.2rem", fontWeight: 700, color: "var(--color-label-player)", lineHeight: 1 }}>
              {alivePlayer}
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.45rem", color: "var(--color-text-muted)", marginTop: "1px" }}>YOU</div>
          </div>
        </div>

        {/* Horizontal versus bar */}
        <div
          title={`AI ${aliveAi} — Player ${alivePlayer}`}
          style={{
            display:      "flex",
            height:       "5px",
            borderRadius: "3px",
            overflow:     "hidden",
            background:   "rgba(255,255,255,0.06)",
          }}
        >
          <div style={{
            width:      `${(1 - playerFrac) * 100}%`,
            background: "var(--color-label-cpu)",
            transition: "width 0.5s ease",
          }} />
          <div style={{ width: "2px", background: "rgba(255,255,255,0.15)" }} />
          <div style={{
            flex:       1,
            background: "var(--color-label-player)",
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* Stats table */}
      <div style={{ ...GLASS, width: "100%", padding: "7px 8px" }}>
        <div style={{
          fontFamily:    "var(--font-body)",
          fontSize:      "0.5rem",
          color:         "var(--color-text-muted)",
          letterSpacing: "1.5px",
          marginBottom:  "4px",
        }}>
          STATS
        </div>
        <StatRow icon="⚔️" label="Duels Won"    value={stats.playerDuelsWon}  color="#44DD66" />
        <StatRow icon="🛡️" label="Duels Lost"   value={stats.playerDuelsLost} color="#FF4444" />
        <StatRow icon="🎭" label="Decoy Wins"    value={stats.decoyAbsorbed}   color="#CF6FFF" />
        <StatRow icon="⚖️" label="Ties"          value={stats.tieSequences}    color="#FFAA22" />
      </div>

      {/* Phase timer ring */}
      {(phase === "reveal" || showTurnTimer) && (
        <CountdownTimer
          seconds={phase === "reveal" ? revealTimer : displayTurnTimer}
          duration={phase === "reveal" ? REVEAL_DURATION_SECONDS : turnDuration}
          testId={phase === "reveal" ? "reveal-timer" : "turn-timer"}
        />
      )}

      {phase === "reveal" && (
        <div style={{ ...GLASS, width: "100%", padding: "6px 8px" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.5rem", color: "var(--color-text-muted)", lineHeight: "1.38" }}>
            {!hasPlayerFlag
              ? "At the start, your cursor is the flag. Shuffle first if you want, then click one soldier to place it."
              : !hasPlayerDecoy
              ? "Now your cursor is the Decoy Totem. Click a different soldier to place it."
              : "Flag and Decoy Totem are locked in. You can now drag either one into place before you start."}
          </div>
        </div>
      )}

      {/* Current duel info */}
      {match.duel && (
        <div style={{ ...GLASS, width: "100%", padding: "6px 8px" }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.48rem", color: "var(--color-text-muted)", marginBottom: "2px", letterSpacing: "0.3px" }}>
            LAST DUEL
          </div>
          <DuelLogEntry duel={match.duel} />
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Player health bar */}
      <div style={{ ...GLASS, width: "100%", padding: "6px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
          <span style={{ fontFamily: "var(--font-body)", fontSize: "0.56rem", fontWeight: 700, color: "var(--color-label-player)" }}>YOUR SQUAD</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5rem", color: "var(--color-label-player)" }}>
            {alivePlayer}/{UNITS_PER_SQUAD}
          </span>
        </div>
        <div style={{ height: "3px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{
            height:       "100%",
            width:        `${(alivePlayer / UNITS_PER_SQUAD) * 100}%`,
            background:   "var(--color-label-player)",
            borderRadius: "2px",
            transition:   "width 0.4s ease",
          }} />
        </div>
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "5px" }}>
        {phase === "reveal" && !hasPlayerFlag && (
          <button
            type="button"
            onClick={() => void onShufflePositions()}
            disabled={loading}
            style={{
              width:         "100%",
              fontFamily:    "var(--font-body)",
              fontSize:      "0.64rem",
              fontWeight:    700,
              padding:       "7px 9px",
              background:    loading ? "rgba(255,255,255,0.08)" : "#D48B14",
              color:         "#1F1404",
              border:        "1px solid rgba(255,255,255,0.14)",
              borderRadius:  "9px",
              cursor:        loading ? "wait" : "pointer",
              letterSpacing: "0.4px",
              boxShadow:     loading ? "none" : "0 5px 12px rgba(0,0,0,0.22)",
              opacity:       loading ? 0.75 : 1,
              transition:    "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
              animation:     loading ? undefined : "shuffleAttention 1s ease-in-out infinite",
            }}
          >
            Shuffle Soldiers
          </button>
        )}

        <button
          type="button"
          onClick={() => void onResetGame()}
          disabled={loading}
          style={{
            width:         "100%",
            fontFamily:    "var(--font-body)",
            fontSize:      "0.64rem",
            fontWeight:    700,
            padding:       "7px 9px",
            background:    loading ? "rgba(255,255,255,0.08)" : "#AA2E25",
            color:         "#FFF5E8",
            border:        "1px solid rgba(255,255,255,0.14)",
            borderRadius:  "9px",
            cursor:        loading ? "wait" : "pointer",
            letterSpacing: "0.4px",
            boxShadow:     loading ? "none" : "0 5px 12px rgba(0,0,0,0.26)",
            opacity:       loading ? 0.75 : 1,
            transition:    "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
          }}
        >
          Reset Game
        </button>

        <button
          type="button"
          onClick={onBackToMenu}
          style={{
            width:         "100%",
            fontFamily:    "var(--font-body)",
            fontSize:      "0.62rem",
            fontWeight:    700,
            padding:       "7px 9px",
            background:    "rgba(255,255,255,0.08)",
            color:         "var(--color-text)",
            border:        "1px solid rgba(255,255,255,0.14)",
            borderRadius:  "9px",
            cursor:        "pointer",
            letterSpacing: "0.4px",
            boxShadow:     "0 4px 12px rgba(0,0,0,0.2)",
            transition:    "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
          }}
        >
          Back To Main Menu
        </button>
      </div>

      {/* RPS cheat sheet */}
      <div style={{
        fontFamily: "var(--font-ui)",
        fontSize:   "0.5rem",
        color:      "var(--color-text-muted)",
        textAlign:  "center",
        lineHeight: "1.6",
        padding:    "4px 6px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: "6px",
        width:      "100%",
      }}>
        🪨 beats ✂️ &nbsp;·&nbsp; 📄 beats 🪨 &nbsp;·&nbsp; ✂️ beats 📄
      </div>
    </div>
  );
}

function StatRow({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
        <span style={{ fontSize: "0.56rem" }}>{icon}</span>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: "0.52rem", color: "var(--color-text-muted)" }}>{label}</span>
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function DuelLogEntry({ duel }: { duel: DuelSummary }) {
  let result = "⚔️";
  if (duel.tie) result = "⚖️";
  else if (duel.decoyAbsorbed) result = "🎭";
  else if (duel.winner === "attacker") result = "🏆";
  else result = "🛡️";

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        "4px",
      fontSize:   "0.54rem",
      fontFamily: "var(--font-ui)",
      color:      "var(--color-text-muted)",
    }}>
      <span style={{ fontSize: "0.72rem" }}>{result}</span>
      <span style={{ color: "var(--color-label-player)" }}>{WEAPON_EMOJI[duel.attackerWeapon] ?? "?"}</span>
      <span>vs</span>
      <span style={{ color: "var(--color-label-cpu)" }}>{WEAPON_EMOJI[duel.defenderWeapon] ?? "?"}</span>
    </div>
  );
}

function CountdownTimer({ seconds, duration, testId }: { seconds: number; duration: number; testId: string }) {
  const pct  = duration > 0 ? Math.min(100, (seconds / duration) * 100) : 0;
  const r    = 33;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div data-testid={testId} style={{ position: "relative", width: "68px", height: "68px" }}>
      <svg width="68" height="68" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="34" cy="34" r={r} fill="var(--color-timer-bg)" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="34" cy="34" r={r}
          fill="none"
          stroke={seconds <= 3 ? "#FF4444" : "var(--color-timer-fill)"}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear" }}
        />
      </svg>
      <div style={{
        position:       "absolute",
        inset:          0,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize:   "1.08rem",
          fontWeight: "bold",
          color:      seconds <= 3 ? "#FF4444" : "var(--color-timer-fill)",
        }}>
          {seconds}
        </span>
        <span style={{ fontSize: "0.4rem", color: "var(--color-text-muted)" }}>SEC</span>
      </div>
    </div>
  );
}
