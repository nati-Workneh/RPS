import { useEffect, useRef, useState } from "react";
import { Difficulty } from "@shared/types";
import { FallingLeavesBackground } from "./FallingLeavesBackground";
import { VideoBackground } from "./VideoBackground";
import { audioManager } from "../utils/audioManager";

const GAME_BACKGROUND_OVERLAY = "linear-gradient(rgba(12, 16, 10, 0.56), rgba(12, 16, 10, 0.86))";

const LOGO_IMAGE = "/game_logo_squad_rps.png";
const START_BUTTON_IMAGE = "/ui_start_button.png";
const HOW_TO_PLAY_BUTTON_IMAGE = "/ui_how_to_play_button.png";
const HOW_TO_PLAY_VIDEO = "/viduo_Squad_RPS.mp4";
const SETTINGS_BUTTON_IMAGE = "/ui_settings_button.png";
const LEADERBOARD_BUTTON_IMAGE = "/ui_leaderboard_button.png";
const DIFFICULTY_TITLE_IMAGE = "/ui_title_choose_difficulty.png";

const DIFFICULTY_CARD_IMAGES: Record<Difficulty, string> = {
  easy: "/ui_difficulty_easy.png",
  medium: "/ui_difficulty_medium.png",
  hard: "/ui_difficulty_hard.png",
};

const DIFFICULTY_GLOW: Record<Difficulty, string> = {
  easy: "rgba(127, 255, 64, 0.42)",
  medium: "rgba(255, 186, 60, 0.4)",
  hard: "rgba(255, 93, 93, 0.42)",
};

const ORDERED_DIFFICULTIES: Difficulty[] = ["medium", "easy", "hard"];

const RULES = [
  "Rock beats Scissors | Paper beats Rock | Scissors beats Paper",
  "Find and defeat the enemy Flag-bearer to win",
  "Decoy absorbs every attack, but the attacker can still lose",
  "Memorize weapons during the 10-second reveal phase",
] as const;

interface StartScreenProps {
  difficulties: { id: Difficulty; label: string; detail: string }[];
  selected: Difficulty;
  onSelect: (d: Difficulty) => void;
  onStart: () => void;
  onOpenSettings: () => void;
  loading: boolean;
}

function showFallbackText(target: EventTarget | null, selector: string) {
  const image = target as HTMLImageElement | null;
  image?.style && (image.style.display = "none");

  const fallback = image?.parentElement?.querySelector(selector) as HTMLElement | null;
  if (fallback) {
    fallback.style.opacity = "1";
    fallback.style.transform = "translateY(0)";
  }
}

export function StartScreen({ difficulties, selected, onSelect, onStart, onOpenSettings, loading }: StartScreenProps) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [menuScale, setMenuScale] = useState(1);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);

  const orderedDifficulties = ORDERED_DIFFICULTIES
    .map((id) => difficulties.find((difficulty) => difficulty.id === id))
    .filter((difficulty): difficulty is StartScreenProps["difficulties"][number] => Boolean(difficulty));

  useEffect(() => {
    const measureLayout = () => {
      const layout = layoutRef.current;
      if (!layout) return;

      const availableHeight = Math.max(680, window.innerHeight - 10);
      const naturalHeight = Math.max(layout.scrollHeight, 1);
      const nextScale = Math.min(1, availableHeight / naturalHeight);

      setMenuScale((current) => (Math.abs(current - nextScale) < 0.01 ? current : nextScale));
    };

    const frameId = window.requestAnimationFrame(measureLayout);
    window.addEventListener("resize", measureLayout);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measureLayout);
    };
  }, [selected, loading, orderedDifficulties.length]);

  useEffect(() => {
    if (!howToPlayOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    audioManager.setTemporaryMusicMuted(true);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHowToPlayOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      audioManager.setTemporaryMusicMuted(false);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [howToPlayOpen]);

  return (
    <div
      style={{
        height: "100vh",
        position: "relative",
        backgroundColor: "var(--color-board-bg)",
        overflow: "hidden",
      }}
    >
      <VideoBackground overlay={GAME_BACKGROUND_OVERLAY} fit="contain" />
      <FallingLeavesBackground />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 12%, rgba(255, 228, 170, 0.16), transparent 26%)",
          pointerEvents: "none",
        }}
      />

      <div
        ref={layoutRef}
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100%",
          width: "min(1320px, calc(100% - 18px))",
          margin: "0 auto",
          padding: "clamp(2px, 0.22vh, 5px) clamp(14px, 1.8vw, 24px) clamp(2px, 0.22vh, 5px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          gap: "clamp(0px, 0.12vh, 3px)",
          transform: `translateY(-64px) scale(${menuScale})`,
          transformOrigin: "top center",
          willChange: "transform",
          filter: howToPlayOpen ? "blur(14px)" : "none",
          transformStyle: "preserve-3d",
          transition: "filter 180ms ease",
          pointerEvents: howToPlayOpen ? "none" : "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0px",
          }}
        >
          <img
            src={LOGO_IMAGE}
            alt="Squad RPS"
            style={{
              display: "block",
              width: "clamp(280px, 31vw, 470px)",
              objectFit: "contain",
              filter: "drop-shadow(0 18px 38px rgba(0,0,0,0.35))",
              transform: "translateY(72px)",
            }}
            onError={(e) => {
              const image = e.target as HTMLImageElement;
              image.style.display = "none";
              const fallback = image.parentElement?.querySelector("[data-logo-fallback]") as HTMLElement | null;
              if (fallback) {
                fallback.style.opacity = "1";
              }
            }}
          />

          <div
            data-logo-fallback="true"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(2.2rem, 7vw, 4rem)",
              letterSpacing: "0.06em",
              color: "#F3F6FF",
              textShadow: "0 8px 20px rgba(0,0,0,0.35)",
              opacity: 0,
              transform: "translateY(72px)",
              transition: "opacity 0.18s ease, transform 0.18s ease",
            }}
          >
            SQUAD RPS
          </div>

          <div
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "clamp(0.78rem, 0.88vw, 0.92rem)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.84)",
              textShadow: "0 2px 8px rgba(0,0,0,0.34)",
              textAlign: "center",
              marginTop: "-10px",
              marginBottom: "-8px",
            }}
          >
            Rock | Paper | Scissors | Flag | Decoy
          </div>

          <section
            style={{
              width: "min(820px, 100%)",
              padding: "6px 10px",
              borderRadius: "16px",
              background: "linear-gradient(180deg, rgba(12,16,12,0.56), rgba(8,10,8,0.42))",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.24)",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              textAlign: "center",
              marginTop: "-4px",
              marginBottom: "-14px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(0.96rem, 1.08vw, 1.14rem)",
                color: "#F4D377",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              How To Play
            </div>

            {RULES.map((rule) => (
              <div
                key={rule}
                style={{
                  padding: "3px 8px",
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "clamp(0.78rem, 0.92vw, 0.9rem)",
                  lineHeight: "1.28",
                  color: "var(--color-text-muted)",
                }}
              >
                {rule}
              </div>
            ))}
          </section>

          <section
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0px",
              marginTop: "-14px",
            }}
          >
            <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
              <img
                src={DIFFICULTY_TITLE_IMAGE}
                alt="Choose difficulty"
                style={{
                  display: "block",
                  width: "clamp(240px, 25vw, 340px)",
                  objectFit: "contain",
                  filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.28))",
                  marginTop: "-26px",
                  marginBottom: "-42px",
                }}
                onError={(e) => {
                  showFallbackText(e.target, "[data-difficulty-title-fallback]");
                }}
              />

              <div
                data-difficulty-title-fallback="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.14rem",
                  letterSpacing: "0.12em",
                  color: "#F4D377",
                  opacity: 0,
                  transform: "translateY(6px)",
                  transition: "opacity 0.16s ease, transform 0.16s ease",
                }}
              >
                CHOOSE DIFFICULTY
              </div>
            </div>

            <div
              style={{
                width: "100%",
                maxWidth: "930px",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "0px",
                alignItems: "start",
                justifyItems: "center",
                marginTop: "-12px",
              }}
            >
              {orderedDifficulties.map((difficulty) => {
                const isSelected = selected === difficulty.id;
                const glow = DIFFICULTY_GLOW[difficulty.id];

                return (
                  <button
                    key={difficulty.id}
                    type="button"
                    onClick={() => onSelect(difficulty.id)}
                    aria-pressed={isSelected}
                    aria-label={difficulty.label}
                    style={{
                      position: "relative",
                      width: "100%",
                      maxWidth: "320px",
                      justifySelf: "center",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      overflow: "visible",
                      transform: isSelected ? "translateY(-3px) scale(1.02)" : "translateY(0) scale(1)",
                      transition: "transform 0.16s ease, filter 0.16s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (selected === difficulty.id) return;
                      e.currentTarget.style.transform = "translateY(-3px) scale(1.01)";
                    }}
                    onMouseLeave={(e) => {
                      if (selected === difficulty.id) return;
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <img
                      src={DIFFICULTY_CARD_IMAGES[difficulty.id]}
                      alt=""
                      aria-hidden="true"
                      style={{
                        display: "block",
                        width: "100%",
                        objectFit: "contain",
                        marginTop: "-58px",
                        marginBottom: "-24px",
                        marginLeft: "-12px",
                        marginRight: "-12px",
                        filter: isSelected ? `drop-shadow(0 14px 26px ${glow}) brightness(1.06)` : "drop-shadow(0 10px 18px rgba(0,0,0,0.2))",
                        transition: "filter 0.16s ease",
                      }}
                      onError={(e) => {
                        showFallbackText(e.target, `[data-difficulty-fallback="${difficulty.id}"]`);
                      }}
                    />

                    <div
                      data-difficulty-fallback={difficulty.id}
                      style={{
                        position: "absolute",
                        inset: 0,
                        padding: "18px 16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        color: "#FFFFFF",
                        opacity: 0,
                        transform: "translateY(6px)",
                        transition: "opacity 0.16s ease, transform 0.16s ease",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", letterSpacing: "0.08em" }}>
                        {difficulty.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-ui)",
                          fontSize: "0.72rem",
                          lineHeight: "1.45",
                          textAlign: "center",
                        }}
                      >
                        {difficulty.detail}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                width: "100%",
                maxWidth: "930px",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                alignItems: "start",
                marginTop: "-16px",
              }}
            >
              <button
                type="button"
                onClick={onStart}
                disabled={loading}
                aria-label={loading ? "Preparing match" : "Start game"}
                style={{
                  position: "relative",
                  gridColumn: "2",
                  justifySelf: "center",
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.72 : 1,
                  overflow: "visible",
                  transition: "transform 0.14s ease, opacity 0.14s ease",
                }}
                onMouseEnter={(e) => {
                  if (loading) return;
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  if (loading) return;
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <img
                  src={START_BUTTON_IMAGE}
                  alt=""
                  aria-hidden="true"
                  style={{
                    display: "block",
                    width: "clamp(235px, 19vw, 300px)",
                    objectFit: "contain",
                    marginTop: "-30px",
                    marginBottom: "-34px",
                    filter: loading ? "grayscale(0.15) brightness(0.92)" : "drop-shadow(0 0 16px rgba(205, 255, 92, 0.24))",
                  }}
                  onError={(e) => {
                    showFallbackText(e.target, "[data-start-fallback]");
                  }}
                />

                <span
                  data-start-fallback="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-heading)",
                    fontSize: loading ? "0.96rem" : "1.1rem",
                    letterSpacing: "0.14em",
                    color: "rgba(255,255,255,0.95)",
                    opacity: loading ? 1 : 0,
                    transform: "translateY(6px)",
                    textShadow: "0 2px 10px rgba(0,0,0,0.4)",
                    pointerEvents: "none",
                    transition: "opacity 0.16s ease, transform 0.16s ease",
                  }}
                >
                  {loading ? "PREPARING..." : "START"}
                </span>
              </button>
            </div>
          </section>
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: "6px",
            flexWrap: "wrap",
            marginTop: "-18px",
            paddingTop: "0",
          }}
        >
          <button
            type="button"
            aria-label="How to play"
            onClick={() => setHowToPlayOpen(true)}
            style={{
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "transform 0.14s ease, filter 0.14s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.filter = "drop-shadow(0 10px 18px rgba(0,0,0,0.28))";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.filter = "none";
            }}
          >
            <img
              src={HOW_TO_PLAY_BUTTON_IMAGE}
              alt="How to play"
              style={{
                display: "block",
                width: "clamp(136px, 11.4vw, 182px)",
                objectFit: "contain",
              }}
            />
          </button>

          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              aria-label="Settings"
              onClick={onOpenSettings}
              style={{
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "transform 0.14s ease, filter 0.14s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.filter = "drop-shadow(0 10px 18px rgba(0,0,0,0.28))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.filter = "none";
              }}
            >
              <img
                src={SETTINGS_BUTTON_IMAGE}
                alt="Settings"
                style={{
                  display: "block",
                  width: "clamp(136px, 11.4vw, 182px)",
                  objectFit: "contain",
                }}
              />
            </button>

            <button
              type="button"
              aria-label="Leaderboard"
              title="Leaderboard UI"
              style={{
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: "default",
                transition: "transform 0.14s ease, filter 0.14s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.filter = "drop-shadow(0 10px 18px rgba(0,0,0,0.28))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.filter = "none";
              }}
            >
              <img
                src={LEADERBOARD_BUTTON_IMAGE}
                alt="Leaderboard"
                style={{
                  display: "block",
                  width: "clamp(140px, 11.8vw, 186px)",
                  objectFit: "contain",
                }}
              />
            </button>
          </div>
        </footer>
      </div>

      {howToPlayOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How to play video"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px",
            background: "rgba(3, 5, 4, 0.56)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(980px, calc(100vw - 28px))",
              maxHeight: "calc(100vh - 28px)",
              borderRadius: "22px",
              overflow: "hidden",
              background: "rgba(5, 8, 6, 0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.48)",
            }}
          >
            <button
              type="button"
              aria-label="Close how to play video"
              onClick={() => setHowToPlayOpen(false)}
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                zIndex: 1,
                width: "38px",
                height: "38px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.36)",
                color: "#F7F9F3",
                fontSize: "1.2rem",
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <video
              src={HOW_TO_PLAY_VIDEO}
              controls
              autoPlay
              playsInline
              preload="metadata"
              style={{
                display: "block",
                width: "100%",
                maxHeight: "calc(100vh - 28px)",
                background: "#000000",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
