"""Tic-Tac-Toe (3 en raya) en Python con pygame.

Modos:
  - 2 jugadores
  - Contra la maquina (Fácil = aleatorio, Dificil = minimax imbatible)

Uso:
    .venv/bin/python main.py
"""

import random
import sys

import pygame

# ---------------------------------------------------------------------------
# Configuracion
# ---------------------------------------------------------------------------
ANCHO, ALTO = 420, 560
FPS = 60

FONDO = (24, 26, 38)
PANEL = (34, 38, 54)
LINEA = (80, 88, 120)
X_COLOR = (90, 170, 255)
O_COLOR = (255, 120, 140)
TEXTO = (235, 238, 245)
RESALTAR = (90, 220, 130)
BOTON = (52, 58, 80)
BOTON_HOVER = (70, 80, 110)

CELDA = 130
TABLERO_X = (ANCHO - CELDA * 3) // 2
TABLERO_Y = 120


# ---------------------------------------------------------------------------
# Logica del juego (pura, sin dependencias de pygame)
# ---------------------------------------------------------------------------
HUMAN = "X"
AI = "O"

LINEAS_GANADORAS = [
    (0, 1, 2), (3, 4, 5), (6, 7, 8),  # filas
    (0, 3, 6), (1, 4, 7), (2, 5, 8),  # columnas
    (0, 4, 8), (2, 4, 6),             # diagonales
]


def check_winner(board):
    """Devuelve ('X'|'O', linea) si hay ganador, None si no."""
    for a, b, c in LINEAS_GANADORAS:
        v = board[a]
        if v and v == board[b] == board[c]:
            return v, (a, b, c)
    return None


def is_draw(board):
    return all(board) and not check_winner(board)


def available_moves(board):
    return [i for i, v in enumerate(board) if not v]


# ---------------------------------------------------------------------------
# Inteligencia artificial
# ---------------------------------------------------------------------------
def ai_random(board, _symbol):
    moves = available_moves(board)
    return random.choice(moves) if moves else None


def minimax(board, symbol, maximizing_symbol):
    """Minimax sin poda (suficiente para 3x3). Devuelve (score, move)."""
    result = check_winner(board)
    if result:
        return (1 if result[0] == maximizing_symbol else -1), None
    if is_draw(board):
        return 0, None

    opponent = AI if symbol == HUMAN else HUMAN
    best_move = None

    if symbol == maximizing_symbol:
        best_score = -float("inf")
        for i in available_moves(board):
            board[i] = symbol
            score, _ = minimax(board, opponent, maximizing_symbol)
            board[i] = ""
            if score > best_score:
                best_score, best_move = score, i
        return best_score, best_move
    else:
        best_score = float("inf")
        for i in available_moves(board):
            board[i] = symbol
            score, _ = minimax(board, opponent, maximizing_symbol)
            board[i] = ""
            if score < best_score:
                best_score, best_move = score, i
        return best_score, best_move


def ai_hard(board, symbol):
    maximizing = symbol
    if not any(board):
        # Primer movimiento: cualquiera del centro/esquinas da lo mismo
        return random.choice([0, 2, 4, 6, 8])
    _, move = minimax(board, symbol, maximizing)
    return move


def move_ai(board, symbol, difficulty):
    if difficulty == "facil":
        return ai_random(board, symbol)
    return ai_hard(board, symbol)


# ---------------------------------------------------------------------------
# Fuente bitmap (pygame no tiene modulo font en Python 3.14, ver AGENTS.md)
# ---------------------------------------------------------------------------
# Glifos 5x7. Cada glifo es una lista de 7 cadenas de 5 caracteres ('#' = on).
_GLIFOS = {
    'A': [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'B': ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    'C': [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    'D': ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
    'E': ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    'F': ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    'G': [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    'H': ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'I': [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    'J': ["..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.."],
    'L': ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    'M': ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    'N': ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    'O': [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'P': ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    'Q': [".###.", "#...#", "#...#", "#...#", "#..##", "#.##.", ".##.#"],
    'R': ["####.", "#...#", "#...#", "####.", "#..#.", "#...#", "#...#"],
    'S': [".####", "#....", "#....", ".###.", "....#", "....#", "#####"],
    'T': ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    'U': ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    'V': ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    'W': ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    'X': ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
    '2': ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    ' ': [".....", ".....", ".....", ".....", ".....", ".....", "....."],
    '-': [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    ':': [".....", "..#..", "..#..", ".....", "..#..", "..#..", "....."],
    '!': ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
}

GLIFO_W = 5
GLIFO_H = 7
GLIFO_GAP = 1   # espacio entre glifos


def text_size(text, scale):
    """Tamano en pixels de `text` dibujado con `scale`."""
    n = len(text)
    w = n * (GLIFO_W + GLIFO_GAP) * scale - GLIFO_GAP * scale
    return max(w, 0), GLIFO_H * scale


def draw_text(surf, text, x, y, color, scale):
    """Dibuja `text` con origen superior-izquierdo en (x, y)."""
    for i, ch in enumerate(text.upper()):
        glifo = _GLIFOS.get(ch)
        if glifo is None:
            continue
        ox = x + i * (GLIFO_W + GLIFO_GAP) * scale
        for ry, fila in enumerate(glifo):
            for rx, c in enumerate(fila):
                if c == "#":
                    pygame.draw.rect(
                        surf, color,
                        (ox + rx * scale, y + ry * scale, scale, scale))


def draw_text_centered(surf, text, cx, cy, color, scale):
    w, h = text_size(text, scale)
    draw_text(surf, text, cx - w // 2, cy - h // 2, color, scale)


def draw_text_in_rect(surf, text, rect, color, scale):
    draw_text_centered(surf, text, rect.centerx, rect.centery, color, scale)


# ---------------------------------------------------------------------------
# Interfaz grafica
# ---------------------------------------------------------------------------
class Button:
    def __init__(self, rect, text):
        self.rect = pygame.Rect(rect)
        self.text = text

    def dibujar(self, surf, scale, hover):
        color = BOTON_HOVER if hover else BOTON
        pygame.draw.rect(surf, color, self.rect, border_radius=10)
        draw_text_in_rect(surf, self.text, self.rect, TEXTO, scale)

    def clic(self, pos):
        return self.rect.collidepoint(pos)


def dibujar_tablero(surf, board, linea_ganadora=None):
    for i in range(1, 3):
        # verticales
        pygame.draw.line(
            surf, LINEA,
            (TABLERO_X + i * CELDA, TABLERO_Y),
            (TABLERO_X + i * CELDA, TABLERO_Y + 3 * CELDA), 4)
        # horizontales
        pygame.draw.line(
            surf, LINEA,
            (TABLERO_X, TABLERO_Y + i * CELDA),
            (TABLERO_X + 3 * CELDA, TABLERO_Y + i * CELDA), 4)

    for i, val in enumerate(board):
        if not val:
            continue
        fila, col = divmod(i, 3)
        cx = TABLERO_X + col * CELDA + CELDA // 2
        cy = TABLERO_Y + fila * CELDA + CELDA // 2
        color = X_COLOR if val == "X" else O_COLOR
        dibujar_marca(surf, val, cx, cy, color)

    if linea_ganadora:
        a, _b, c = linea_ganadora
        start = centro_celda(a)
        end = centro_celda(c)
        pygame.draw.line(surf, RESALTAR, start, end, 7)


# Escalas de fuente (bitmap)
ESC_TITULO = 4
ESC_BOTON = 2
ESC_ESTADO = 3


def centro_celda(i):
    fila, col = divmod(i, 3)
    return (TABLERO_X + col * CELDA + CELDA // 2,
            TABLERO_Y + fila * CELDA + CELDA // 2)


def dibujar_marca(surf, marca, cx, cy, color):
    r = 30
    if marca == "X":
        pygame.draw.line(surf, color, (cx - r, cy - r), (cx + r, cy + r), 7)
        pygame.draw.line(surf, color, (cx + r, cy - r), (cx - r, cy + r), 7)
    else:
        pygame.draw.circle(surf, color, (cx, cy), r, 7)


def celda_en(pos):
    x, y = pos
    if x < TABLERO_X or x >= TABLERO_X + 3 * CELDA:
        return None
    if y < TABLERO_Y or y >= TABLERO_Y + 3 * CELDA:
        return None
    col = (x - TABLERO_X) // CELDA
    fila = (y - TABLERO_Y) // CELDA
    return int(fila * 3 + col)


# ---------------------------------------------------------------------------
# Pantallas
# ---------------------------------------------------------------------------
def menu_principal(surf, mouse_pos):
    surf.fill(FONDO)
    draw_text_centered(surf, "TIC-TAC-TOE", ANCHO // 2, 80, TEXTO, ESC_TITULO)

    botones = [
        Button((ANCHO // 2 - 120, 180, 240, 60), "2 JUGADORES"),
        Button((ANCHO // 2 - 120, 260, 240, 60), "CONTRA LA MAQUINA"),
        Button((ANCHO // 2 - 120, 340, 240, 60), "SALIR"),
    ]
    for b in botones:
        b.dibujar(surf, ESC_BOTON, b.clic(mouse_pos))
    return botones


def menu_dificultad(surf, mouse_pos):
    surf.fill(FONDO)
    draw_text_centered(surf, "DIFICULTAD", ANCHO // 2, 80, TEXTO, ESC_TITULO)

    botones = [
        Button((ANCHO // 2 - 120, 180, 240, 60), "FACIL"),
        Button((ANCHO // 2 - 120, 260, 240, 60), "DIFICIL"),
        Button((ANCHO // 2 - 120, 340, 240, 60), "VOLVER"),
    ]
    for b in botones:
        b.dibujar(surf, ESC_BOTON, b.clic(mouse_pos))
    return botones


def pantalla_juego(surf, board, turno, estado, mouse_pos):
    surf.fill(FONDO)
    if estado == "jugando":
        texto = f"TURNO: {turno}"
        color = X_COLOR if turno == "X" else O_COLOR
    else:
        ganador, _ = check_winner(board) or (None, None)
        if ganador:
            texto = f"GANA {ganador}!"
            color = RESALTAR
        else:
            texto = "EMPATE!"
            color = TEXTO
    draw_text_centered(surf, texto, ANCHO // 2, 60, color, ESC_ESTADO)

    linea = check_winner(board)
    dibujar_tablero(surf, board, linea[1] if linea else None)

    if estado != "jugando":
        botones = [
            Button((40, ALTO - 60, 160, 44), "REINICIAR"),
            Button((ANCHO - 200, ALTO - 60, 160, 44), "MENU"),
        ]
    else:
        botones = [
            Button((ANCHO - 200, ALTO - 60, 160, 44), "MENU"),
        ]
    for b in botones:
        b.dibujar(surf, ESC_BOTON, b.clic(mouse_pos))
    return botones


# ---------------------------------------------------------------------------
# Bucle principal
# ---------------------------------------------------------------------------
def main():
    pygame.init()
    pantalla = pygame.display.set_mode((ANCHO, ALTO))
    pygame.display.set_caption("Tic-Tac-Toe")
    reloj = pygame.time.Clock()

    escena = "menu"
    modo = None          # "2p" o "ai"
    dificultad = None    # "facil" o "dificil"
    board = [""] * 9
    turno = HUMAN        # X siempre empieza
    estado = "jugando"   # "jugando" | "terminado"
    ia_pendiente = False

    def reiniciar():
        nonlocal board, turno, estado, ia_pendiente
        board = [""] * 9
        turno = HUMAN
        estado = "jugando"
        ia_pendiente = False

    corriendo = True
    while corriendo:
        mouse_pos = pygame.mouse.get_pos()
        clic_pos = None

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                corriendo = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                clic_pos = event.pos

        # Procesar clicks
        if escena == "menu":
            botones = menu_principal(pantalla, mouse_pos)
            if clic_pos:
                if botones[0].clic(clic_pos):
                    modo, escena, dificultad = "2p", "juego", None
                    reiniciar()
                elif botones[1].clic(clic_pos):
                    escena = "dificultad"
                elif botones[2].clic(clic_pos):
                    corriendo = False

        elif escena == "dificultad":
            botones = menu_dificultad(pantalla, mouse_pos)
            if clic_pos:
                if botones[0].clic(clic_pos):
                    dificultad, escena, modo = "facil", "juego", "ai"
                    reiniciar()
                elif botones[1].clic(clic_pos):
                    dificultad, escena, modo = "dificil", "juego", "ai"
                    reiniciar()
                elif botones[2].clic(clic_pos):
                    escena = "menu"

        elif escena == "juego":
            botones = pantalla_juego(
                pantalla, board, turno, estado, mouse_pos)

            if clic_pos:
                if estado == "jugando":
                    i = celda_en(clic_pos)
                    if i is not None and not board[i]:
                        board[i] = turno
                        res = check_winner(board)
                        if res or is_draw(board):
                            estado = "terminado"
                        else:
                            turno = AI if turno == HUMAN else HUMAN
                            ia_pendiente = (modo == "ai" and turno == AI)
                # botones
                if botones:
                    if botones[0].clic(clic_pos) and botones[0].text == "REINICIAR":
                        reiniciar()
                    elif botones[-1].clic(clic_pos) and botones[-1].text == "MENU":
                        escena = "menu"

            # Movimiento de la IA
            if ia_pendiente and estado == "jugando":
                pygame.time.delay(400)  # pequena pausa para que se sienta natural
                mov = move_ai(board, AI, dificultad)
                if mov is not None:
                    board[mov] = turno
                    if check_winner(board) or is_draw(board):
                        estado = "terminado"
                    else:
                        turno = HUMAN
                ia_pendiente = False

        pygame.display.flip()
        reloj.tick(FPS)

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()