# Practice Games

A collection of small, self-contained games built for practice. Each game lives in its own folder with zero shared dependencies and no build step — just clone and run.

> [!NOTE]
> These are learning projects, not production software. There is no test suite, CI, or formal release process, and UI/comments are written in Spanish.

## Games

### ♟️ Chess (`chess-ajedrez/`)

A modern, interactive web chess game built with plain HTML, CSS, and JavaScript + jQuery 4.0 (loaded from a CDN). No bundler, no server — open `index.html` directly in a browser.

**Highlights**

- Click-to-move with live valid-move indicators
- Per-piece move validation (pawn, knight, bishop, rook, queen, king)
- Captured-pieces panel for both sides
- **Undo move** and **New game** controls
- 10-minute per-side countdown timers with active-turn highlight
- Coordinated board labels (files `A–H`, ranks `1–8`) and responsive layout

> [!IMPORTANT]
> This is a **simplified** chess implementation. It does **not** detect check, checkmate, stalemate, nor implement castling, en passant, or pawn promotion. A king can be captured to end the game.

**Run**

```bash
# from the repo root
xdg-open chess-ajedrez/index.html   # Linux
# or just double-click the file in your file manager
```

### ⭕ Tic-Tac-Toe (`tictactoe-tresenlinea/`)

A single-file pygame tic-tac-toe game (`main.py`) — all logic, UI, and AI in one file. Local two-player mode or versus an unbeatable AI.

**Highlights**

- **2 jugadores** — local hot-seat play
- **Contra la máquina** — two difficulties:
  - *Fácil*: random moves
  - *Difícil*: exhaustive minimax (no pruning, fine for 3×3) — unbeatable, best you can do is draw
- Hand-drawn 5×7 **bitmap glyphs** (`_GLIFOS`) instead of `pygame.font` — intentional, keep it bitmap
- Winning line highlighted in green; menu navigation between rounds

> [!NOTE]
> X always starts. In versus-machine mode you play **X** and the machine plays **O**.

**Run**

```bash
cd tictactoe-tresenlinea
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # pins pygame==2.6.1
.venv/bin/python main.py
```

Requires Python 3.8+.

## Project Structure

```
.
├── chess-ajedrez/
│   ├── index.html     # Board markup + jQuery script include
│   ├── logic.js       # Game state, move rules, timers, undo
│   ├── style.css      # Layout + theming (Plus Jakarta Sans)
│   └── README.md
└── tictactoe-tresenlinea/
    ├── main.py        # The whole game (loop, AI, rendering)
    ├── requirements.txt
    └── README.md
```

## Tech Stack

| Game          | Language            | Runtime / Framework     | Build |
| ------------- | ------------------- | ----------------------- | ----- |
| Chess         | HTML, CSS, JS       | jQuery 4.0 (CDN)        | None  |
| Tic-Tac-Toe   | Python 3.8+         | pygame 2.6.1            | None  |

Both games are **dependency-light and build-free**: open the HTML file or run the Python script — nothing to compile, bundle, or deploy. The chess game fetches jQuery from a CDN, so it needs internet access on first load (the integrity hash is pinned in `index.html`).

## Notes for Contributors

- Keep changes **scoped to one game folder** at a time; the two games are intentionally independent.
- Match the existing language: UI strings, comments, and docs are in **Spanish**.
- There's no linter/typechecker/CI configured — review carefully and run the game manually before committing.
- `.agents/` and `.skills/` are gitignored local scaffolding (see `skills-lock.json`), not application code.