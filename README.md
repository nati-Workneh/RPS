# Squad RPS — Team 10
<img width="1503" height="1047" alt="769bed93-54f3-4d1e-80ba-7b30deeea708" src="https://github.com/user-attachments/assets/e334c8cc-304b-44b6-9660-fb31885ea498" />


> A tactical browser-based Rock-Paper-Scissors squad battle. Outsmart the computer, find the hidden Flag-bearer, and beware the Decoy.

<!-- PROJECT SCREENSHOT -->
<!-- Replace the line below with your main screenshot -->
<!-- ![Squad RPS Gameplay](docs/images/gameplay.png) -->

---

## Overview

**Squad RPS** is a 1-vs-Computer strategy game built on a 7×6 grid. Each side deploys 14 characters — Rocks, Papers, and Scissors — with two hidden special roles per squad: a **Flag-bearer** (instant win/loss target) and a **Decoy** (immune to elimination). A brief weapon reveal phase gives you 10 seconds to memorize the enemy lineup before all weapons are hidden and the duels begin.

Classic RPS is a coin flip. Squad RPS adds observation, memory, and tactical decision-making while staying instantly understandable.

---

## Demo

<!-- Add a GIF or video link here -->
<!-- ![Demo GIF](docs/images/demo.gif) -->

---

## Gameplay

### The Board

```
Row 6 │ CPU  CPU  CPU  CPU  CPU  CPU  CPU  ← CPU back row
Row 5 │ CPU  CPU  CPU  CPU  CPU  CPU  CPU  ← CPU front row
Row 4 │  ·    ·    ·    ·    ·    ·    ·   ← Neutral zone
Row 3 │  ·    ·    ·    ·    ·    ·    ·   ← Neutral zone
Row 2 │  P1   P1   P1   P1   P1   P1   P1  ← Player front row
Row 1 │  P1   P1   P1   P1   P1   P1   P1  ← Player back row
         C1   C2   C3   C4   C5   C6   C7
```

- **14 characters per side** — 28 total on the board at match start
- **Neutral rows 3–4** — empty at start, the main battle zone

### Phases

| Phase | Description |
|---|---|
| **Weapon Reveal** (10s) | All weapons shown — memorize the enemy squad |
| **Role Assignment** | Weapons hidden; Flag + Decoy assigned secretly per side |
| **Duel Rounds** | Click your character → click enemy target → RPS resolution |

### Special Roles

| Role | Rule |
|---|---|
| 🚩 **Flag-bearer** | One per squad. If eliminated — that side **loses instantly** |
| 🎭 **Decoy** | One per squad. **Survives every attack**; the attacker can still die |

### Duel Resolution

1. Select one of your alive characters as attacker
2. Select an enemy character as target
3. Both weapons revealed for this duel only
4. Standard RPS decides the outcome — loser is eliminated, winner's weapon hidden again
5. **Tie:** both sides re-pick a new weapon and duel again
6. **Decoy hit:** duel resolves normally for the attacker; Decoy remains on the board
7. **Flag eliminated:** match ends immediately

### Win Conditions

- Defeat the enemy Flag-bearer → **instant win**
- Your Flag is defeated → **instant loss**
- Only the enemy Decoy remains → Decoy becomes killable

---

## Difficulty Levels

| Level | CPU Behavior |
|---|---|
| Easy | Random valid move every turn |
| Medium | Remembers revealed weapons; prefers winning matchups |
| Hard | Remembers weapons + actively hunts your Flag-bearer |

---

## Screenshots

<!-- Add your screenshots here -->
<!-- ![Game Board](docs/images/board.png) -->
<!-- ![Weapon Reveal Phase](docs/images/reveal.png) -->
<!-- ![Duel Screen](docs/images/duel.png) -->
<!-- ![Victory Screen](docs/images/victory.png) -->

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | CSS custom properties |
| Backend | Python 3.12 + FastAPI |
| Unit tests (frontend) | Vitest |
| Unit tests (backend) | pytest + FastAPI TestClient |
| E2E tests | Playwright |
| CPU opponent | Local deterministic logic — **zero AI/LLM API calls** |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.12+

### Installation & Run

```bash
# Terminal 1 — Backend
python -m uvicorn backend.python_api.app:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend
npm --prefix frontend/app install   # first time only
npm --prefix frontend/app run dev
# → http://localhost:5173
```

---

## Project Structure

```
frontend/
  app/                         ← Vite entry point
  modules/
    shared/src/                ← Types, constants, utils
    game/src/
      components/              ← GameScreen, GameBoard, BoardCell, UnitSprite, Sidebar
      hooks/                   ← useGame
backend/
  python_api/
    app.py                     ← FastAPI routes + game logic
    config.py                  ← Board constants
    schemas.py                 ← Pydantic request models
    tests/                     ← pytest
docs/
  PRD.md                       ← Product requirements
  ARCHITECTURE.md              ← Technical design
  sprints/                     ← Sprint history
```

---

## Available Scripts

```bash
# Frontend
npm --prefix frontend/app run dev          # dev server
npm --prefix frontend/app run build        # production build
npm --prefix frontend/app run test         # unit tests + coverage
npm --prefix frontend/app run test:watch   # watch mode
npm --prefix frontend/app run lint         # TypeScript check

# Backend
python -m pytest backend/python_api/tests/ -v

# E2E (both servers must be running)
npx playwright test
```

---

## Team

Built by **Team 10** at AIcademy Hackathon 2026.

---

## License

This project is open source and available under the [MIT License](LICENSE).
