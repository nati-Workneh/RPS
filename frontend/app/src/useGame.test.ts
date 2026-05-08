import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGame } from "@game/hooks/useGame";
import { audioManager } from "@game/utils/audioManager";

async function choosePlayerSpecialPieces(result: { current: ReturnType<typeof useGame> }) {
  const flagCandidate = result.current.match?.board.find(
    (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
  );
  expect(flagCandidate).toBeTruthy();

  await act(async () => {
    result.current.onPieceClick(flagCandidate!);
    await Promise.resolve();
    await Promise.resolve();
  });

  const decoyCandidate = result.current.match?.board.find(
    (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 2,
  );
  expect(decoyCandidate).toBeTruthy();

  await act(async () => {
    result.current.onPieceClick(decoyCandidate!);
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

    await choosePlayerSpecialPieces(result);

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

    await choosePlayerSpecialPieces(result);

    await act(async () => {
      await result.current.skipReveal();
    });

    const blockedUnit = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 3 && piece.alive,
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

  it("should let the player choose a flag and a decoy during the opening reveal", async () => {
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

    const decoyCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 4,
    );
    expect(decoyCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(decoyCandidate!);
      await Promise.resolve();
    });

    const chosenDecoy = result.current.match?.board.find((piece) => piece.id === decoyCandidate!.id);
    expect(chosenDecoy?.role).toBe("decoy");
    expect(result.current.match?.message).toContain("Decoy placed");
  });

  it("should let the player drag the flag and decoy carriers to new reveal positions", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const flagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
    );
    const decoyCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 2,
    );
    const firstSwapTarget = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 2 && piece.col === 7,
    );
    const secondSwapTarget = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 2 && piece.col === 6,
    );

    expect(flagCandidate).toBeTruthy();
    expect(decoyCandidate).toBeTruthy();
    expect(firstSwapTarget).toBeTruthy();
    expect(secondSwapTarget).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(flagCandidate!);
      await Promise.resolve();
    });

    await act(async () => {
      result.current.onPieceClick(decoyCandidate!);
      await Promise.resolve();
    });

    const chosenFlag = result.current.match?.board.find((piece) => piece.id === flagCandidate!.id);
    expect(chosenFlag?.role).toBe("flag");

    act(() => {
      result.current.onRevealDragStart(chosenFlag!);
    });

    expect(result.current.draggingPieceId).toBe(chosenFlag!.id);

    await act(async () => {
      result.current.onRevealDrop(2, 7);
      await Promise.resolve();
      await Promise.resolve();
    });

    const movedFlag = result.current.match?.board.find((piece) => piece.id === flagCandidate!.id);
    const swappedFlagTarget = result.current.match?.board.find((piece) => piece.id === firstSwapTarget!.id);

    expect(movedFlag?.row).toBe(2);
    expect(movedFlag?.col).toBe(7);
    expect(swappedFlagTarget?.row).toBe(1);
    expect(swappedFlagTarget?.col).toBe(1);
    expect(result.current.draggingPieceId).toBeNull();

    const chosenDecoy = result.current.match?.board.find((piece) => piece.id === decoyCandidate!.id);
    expect(chosenDecoy?.role).toBe("decoy");

    act(() => {
      result.current.onRevealDragStart(chosenDecoy!);
    });

    await act(async () => {
      result.current.onRevealDrop(2, 6);
      await Promise.resolve();
      await Promise.resolve();
    });

    const movedDecoy = result.current.match?.board.find((piece) => piece.id === decoyCandidate!.id);
    const swappedDecoyTarget = result.current.match?.board.find((piece) => piece.id === secondSwapTarget!.id);

    expect(movedDecoy?.row).toBe(2);
    expect(movedDecoy?.col).toBe(6);
    expect(swappedDecoyTarget?.row).toBe(1);
    expect(swappedDecoyTarget?.col).toBe(2);
    expect(result.current.match?.message).toContain("Decoy Totem moved");
  });

  it("should only allow reveal dragging after both special pieces were chosen", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    const initialFlagCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 1,
    );
    expect(initialFlagCandidate).toBeTruthy();

    act(() => {
      result.current.onRevealDragStart(initialFlagCandidate!);
    });

    expect(result.current.draggingPieceId).toBeNull();

    await act(async () => {
      result.current.onPieceClick(initialFlagCandidate!);
      await Promise.resolve();
    });

    const placedFlag = result.current.match?.board.find((piece) => piece.id === initialFlagCandidate!.id);
    expect(placedFlag?.role).toBe("flag");

    act(() => {
      result.current.onRevealDragStart(placedFlag!);
    });

    expect(result.current.draggingPieceId).toBeNull();

    const decoyCandidate = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.row === 1 && piece.col === 2,
    );
    expect(decoyCandidate).toBeTruthy();

    await act(async () => {
      result.current.onPieceClick(decoyCandidate!);
      await Promise.resolve();
    });

    const normalSoldier = result.current.match?.board.find(
      (piece) =>
        piece.owner === "player" &&
        piece.alive &&
        piece.role !== "flag" &&
        piece.role !== "decoy",
    );
    expect(normalSoldier).toBeTruthy();

    act(() => {
      result.current.onRevealDragStart(normalSoldier!);
    });

    expect(result.current.draggingPieceId).toBeNull();
  });

  it("should lose the match when the reveal timer expires before placing the flag and decoy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T18:00:00.000Z"));

    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21000);
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

    await choosePlayerSpecialPieces(result);

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

    await choosePlayerSpecialPieces(result);

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

  it("should prevent the player decoy from being selected for movement", async () => {
    const { result } = renderHook(() => useGame());

    await act(async () => {
      await result.current.startMatch();
    });

    await choosePlayerSpecialPieces(result);

    await act(async () => {
      await result.current.skipReveal();
    });

    const decoyPiece = result.current.match?.board.find(
      (piece) => piece.owner === "player" && piece.role === "decoy" && piece.alive,
    );
    expect(decoyPiece).toBeTruthy();

    act(() => {
      result.current.onPieceClick(decoyPiece!);
    });

    expect(result.current.selectablePieceIds.has(decoyPiece!.id)).toBe(false);
    expect(result.current.selectedPieceId).toBeNull();
  });
});
