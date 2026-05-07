import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGame } from "@game/hooks/useGame";
import { audioManager } from "@game/utils/audioManager";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.spyOn(audioManager, "unlock").mockImplementation(() => {});
  vi.spyOn(audioManager, "play").mockImplementation(() => {});
  vi.spyOn(audioManager, "playJump").mockReturnValue(500);
  vi.spyOn(audioManager, "stopBgm").mockImplementation(() => {});
});

describe("useGame smoke test", () => {
  it("should initialize with setup phase", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.phase).toBe("setup");
    expect(result.current.match).toBeNull();
  });

  it("should have startMatch function", () => {
    const { result } = renderHook(() => useGame());
    expect(typeof result.current.startMatch).toBe("function");
  });

  it("should expose a legal opening move after selecting a front-row unit", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const flagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
    );
    expect(flagCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(flagCandidate!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.skipReveal();
    });

    const frontUnit = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 2 && piece.col === 1 && piece.alive,
    );
    expect(frontUnit).toBeTruthy();

    act(() => {
      result.current.onPieceClick(frontUnit!);
    });

    expect(result.current.selectedPieceId).toBe(frontUnit!.id);
    expect(Array.from(result.current.validMoveSet)).toEqual(["3-1"]);
  });

  it("should use custom configured turn durations", async () => {
    const { result } = renderHook(() => useGame({
      turnDurations: {
        easy: 41,
        medium: 17,
        hard: 9,
      },
    }));

    act(() => {
      result.current.setSelectedDifficulty("easy");
    });

    await act(async () => {
      await result.current.startMatch();
    });

    expect(result.current.match?.turnDurationSeconds).toBe(41);
  });

  it("should assign turn time by difficulty selection", async () => {
    const { result } = renderHook(() => useGame());

    act(() => {
      result.current.setSelectedDifficulty("easy");
    });

    await act(async () => {
      await result.current.startMatch();
    });

    expect(result.current.match?.turnDurationSeconds).toBe(30);

    act(() => {
      result.current.resetToSetup();
      result.current.setSelectedDifficulty("medium");
    });

    await act(async () => {
      await result.current.startMatch();
    });

    expect(result.current.match?.turnDurationSeconds).toBe(15);

    act(() => {
      result.current.resetToSetup();
      result.current.setSelectedDifficulty("hard");
    });

    await act(async () => {
      await result.current.startMatch();
    });

    expect(result.current.match?.turnDurationSeconds).toBe(10);
  });

  it("should ignore a blocked back-row unit that has no legal move", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const flagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
    );
    expect(flagCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(flagCandidate!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.skipReveal();
    });

    const blockedUnit = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 2 && piece.alive,
    );
    expect(blockedUnit).toBeTruthy();

    act(() => {
      result.current.onPieceClick(blockedUnit!);
    });

    expect(result.current.selectablePieceIds.has(blockedUnit!.id)).toBe(false);
    expect(result.current.selectedPieceId).toBeNull();
  });

  it("should shuffle the player squad only during the opening reveal", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const beforePositions = new Map(
      (result.current.match?.board ?? [])
        .filter((piece) => piece.owner === "player")
        .map((piece) => [piece.id, `${piece.row}-${piece.col}`]),
    );

    await act(async () => {
      await result.current.shufflePlayerPieces();
    });

    const afterPositions = new Map(
      (result.current.match?.board ?? [])
        .filter((piece) => piece.owner === "player")
        .map((piece) => [piece.id, `${piece.row}-${piece.col}`]),
    );

    expect(result.current.match?.phase).toBe("reveal");
    expect(result.current.match?.message).toBe("Your squad positions were shuffled.");
    expect(Array.from(afterPositions.values()).every((position) => /^1-|^2-/.test(position))).toBe(true);
    expect(Array.from(afterPositions.entries()).some(([id, position]) => beforePositions.get(id) !== position)).toBe(true);
  });

  it("should let the player choose a flag during the opening reveal", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const flagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 3,
    );
    expect(flagCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(flagCandidate!);
      await Promise.resolve();
    });

    const chosenPiece = result.current.match?.board.find((piece) => piece.id === flagCandidate!.id);
    expect(chosenPiece?.role).toBe("flag");
    expect(result.current.match?.message).toContain("Flag placed");
  });

  it("should lose the match when the reveal timer expires before placing a flag", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T18:00:00.000Z"));

    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
    });

    expect(result.current.phase).toBe("finished");
    expect(result.current.match?.result?.winner).toBe("ai");
    expect(result.current.match?.result?.reason).toContain("Time ran out");
  });

  it("should lose the match when the player turn timer expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T18:00:00.000Z"));

    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const flagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
    );
    expect(flagCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(flagCandidate!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.skipReveal();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
    });

    expect(result.current.phase).toBe("finished");
    expect(result.current.match?.result?.winner).toBe("ai");
    expect(result.current.match?.result?.reason).toContain("Time ran out");
  });

  it("should request and apply the AI move when the turn passes to AI", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const flagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
    );
    expect(flagCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(flagCandidate!);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.skipReveal();
    });

    const frontUnit = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 2 && piece.col === 1 && piece.alive,
    );
    expect(frontUnit).toBeTruthy();

    act(() => {
      result.current.onPieceClick(frontUnit!);
    });

    await act(async () => {
      result.current.onCellClick(3, 1);
      await Promise.resolve();
    });

    expect(result.current.phase).toBe("ai_turn");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(result.current.phase).toBe("player_turn");
    expect(
      result.current.match?.board.some(
        (piece) => piece.owner === "ai" && piece.alive && piece.row === 4,
      ),
    ).toBe(true);
  });
});
