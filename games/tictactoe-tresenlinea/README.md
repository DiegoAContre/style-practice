# Tic-Tac-Toe (3 en raya)

Juego de tres en raya en Python con `pygame`, con dos modos:
dos jugadores locales o contra la máquina (Fácil / Difícil).

## Requisitos

- Python 3.8 o superior
- `pygame` (se instala dentro del entorno virtual, ver abajo)

## Instalación

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Cómo ejecutar

```bash
.venv/bin/python main.py
```

## Cómo se juega

1. Al abrir aparece el **menú principal**:
   - **2 Jugadores**: dos personas alternan turnos en el mismo equipo.
   - **Contra la máquina**: abre el menú de dificultad.
2. En **Contra la máquina**, elige dificultad:
   - **Fácil**: la IA hace movimientos aleatorios.
   - **Dificil**: la IA usa minimax y es imbatible (como mucho empatas).
3. Siempre empiezan las **X**. En el modo contra la máquina tú juegas con **X**
   y la máquina con **O**.
4. Haz **clic** en una casilla vacía del tablero 3×3 para colocar tu marca.
5. Gana quien alinee tres marcas (filas, columnas o diagonales); la línea
   ganadora se resalta en verde. Si se llena el tablero sin ganador, es **empate**.
6. Al terminar la partida:
   - **Reiniciar**: juega otra vez con el mismo modo/dificultad.
   - **Menú**: vuelve al menú principal para cambiar de modo.

### Controles

| Acción | Control |
|--------|---------|
| Colocar marca / pulsar botón | Clic izquierdo del ratón |
| Reiniciar partida | Botón "Reiniciar" |
| Volver al menú | Botón "Menú" |
| Salir del juego | Cerrar la ventana o botón "Salir" |