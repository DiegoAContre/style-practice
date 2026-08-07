// Mapeo de piezas Unicode (Usamos la misma figura sólida para ambos colores, CSS se encarga de pintarlas)
const unicodePieces = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟', // Negras
    'R': '♜', 'N': '♞', 'B': '♝', 'Q': '♛', 'K': '♚', 'P': '♟'  // Blancas
};

// Configuración inicial del juego
const initialBoard = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], // Fila 8 (Negras)
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // Fila 7
    ['', '', '', '', '', '', '', ''],         // Fila 6
    ['', '', '', '', '', '', '', ''],         // Fila 5
    ['', '', '', '', '', '', '', ''],         // Fila 4
    ['', '', '', '', '', '', '', ''],         // Fila 3
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // Fila 2
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']  // Fila 1 (Blancas)
];

// Estado global de la partida
let board = [];
let currentTurn = 'white'; // 'white' o 'black'
let selectedPiece = null;  // { row, col }
let validMoves = [];       // Array de { row, col, capture }
let lastMove = null;       // { from: {row, col}, to: {row, col} }
let moveHistory = [];      // Pila para guardar estados anteriores y permitir deshacer
let capturedPieces = {
    white: [], // Piezas blancas capturadas por las negras
    black: []  // Piezas negras capturadas por las blancas
};

// Configuración de los temporizadores
let timerWhite = 600; // 10 minutos en segundos
let timerBlack = 600;
let timerInterval = null;
let gameActive = true;

// Inicialización cuando el DOM esté listo
$(document).ready(function() {
    initGame();

    // Eventos de controles
    $('#btn-restart').on('click', function() {
        initGame();
    });

    $('#btn-undo').on('click', function() {
        undoMove();
    });
});

// Inicializar una nueva partida
function initGame() {
    // Restaurar tablero de inicio
    board = JSON.parse(JSON.stringify(initialBoard));
    currentTurn = 'white';
    selectedPiece = null;
    validMoves = [];
    lastMove = null;
    moveHistory = [];
    capturedPieces = { white: [], black: [] };
    timerWhite = 600;
    timerBlack = 600;
    gameActive = true;

    // Actualizar visualizaciones del panel
    updateCapturedUI();
    updateStatusMessage("La partida ha comenzado. Mueven las Blancas.");
    updateTurnCards();
    
    // Reiniciar e iniciar temporizadores
    clearInterval(timerInterval);
    updateTimerDisplay('white');
    updateTimerDisplay('black');
    startTimers();

    // Renderizar tablero
    renderBoard();
}

// Renderizar el tablero de ajedrez dinámicamente
function renderBoard() {
    const $chessboard = $('#chessboard');
    $chessboard.empty();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const isLight = (r + c) % 2 === 0;
            const squareClass = isLight ? 'light' : 'dark';
            const pieceChar = board[r][c];

            const $square = $('<div>')
                .addClass(`square ${squareClass}`)
                .attr('data-row', r)
                .attr('data-col', c);

            // Resaltar último movimiento realizado
            if (lastMove && (
                (lastMove.from.row === r && lastMove.from.col === c) ||
                (lastMove.to.row === r && lastMove.to.col === c)
            )) {
                $square.addClass('last-move');
            }

            // Si hay una pieza, renderizarla
            if (pieceChar) {
                const isWhite = pieceChar === pieceChar.toUpperCase();
                const pieceColorClass = isWhite ? 'white-piece' : 'black-piece';
                const unicodeChar = unicodePieces[pieceChar];

                const $piece = $('<div>')
                    .addClass(`piece ${pieceColorClass}`)
                    .text(unicodeChar)
                    .attr('data-row', r)
                    .attr('data-col', c);

                $square.append($piece);
            }

            // Vincular evento de clic en la casilla
            $square.on('click', function() {
                handleSquareClick(r, c);
            });

            $chessboard.append($square);
        }
    }
}

// Manejar el clic en una casilla o pieza
function handleSquareClick(row, col) {
    if (!gameActive) return;

    const piece = board[row][col];
    const pieceColor = piece ? (piece === piece.toUpperCase() ? 'white' : 'black') : null;

    // Caso 1: Clic en una de las jugadas posibles sugeridas
    const isPossibleMove = validMoves.some(m => m.row === row && m.col === col);
    if (isPossibleMove) {
        executeMove(selectedPiece.row, selectedPiece.col, row, col);
        return;
    }

    // Caso 2: Seleccionar una pieza del turno actual
    if (pieceColor === currentTurn) {
        // Quitar resaltados anteriores
        $('.square').removeClass('selected possible-move possible-capture');
        
        // Seleccionar nueva pieza
        selectedPiece = { row, col };
        $(`.square[data-row="${row}"][data-col="${col}"]`).addClass('selected');

        // Calcular y mostrar jugadas válidas
        validMoves = calculateValidMoves(row, col);
        highlightValidMoves();
    } else {
        // Caso 3: Clic fuera de piezas válidas o jugadas posibles -> Deseleccionar
        selectedPiece = null;
        validMoves = [];
        $('.square').removeClass('selected possible-move possible-capture');
    }
}

// Resaltar visualmente las jugadas posibles
function highlightValidMoves() {
    validMoves.forEach(move => {
        const $square = $(`.square[data-row="${move.row}"][data-col="${move.col}"]`);
        if (move.capture) {
            $square.addClass('possible-capture');
        } else {
            $square.addClass('possible-move');
        }
    });
}

// Ejecutar el movimiento de una casilla a otra
function executeMove(fromRow, fromCol, toRow, toCol) {
    // Guardar estado actual en el historial antes de modificar
    saveStateToHistory();

    const piece = board[fromRow][fromCol];
    const targetPiece = board[toRow][toCol];

    // Manejar captura si existe
    if (targetPiece) {
        const isTargetWhite = targetPiece === targetPiece.toUpperCase();
        if (isTargetWhite) {
            capturedPieces.white.push(targetPiece);
        } else {
            capturedPieces.black.push(targetPiece);
        }
        updateCapturedUI();

        // Si se captura al Rey, terminar la partida
        if (targetPiece.toLowerCase() === 'k') {
            endGame(currentTurn === 'white' ? "¡Victoria de las Blancas! El Rey negro ha sido capturado." : "¡Victoria de las Negras! El Rey blanco ha sido capturado.");
            board[toRow][toCol] = piece;
            board[fromRow][fromCol] = '';
            lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };
            selectedPiece = null;
            validMoves = [];
            renderBoard();
            return;
        }
    }

    // Mover la pieza
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = '';

    // Promoción de Peón básica (se convierte en Reina automáticamente al llegar al final)
    if (piece === 'P' && toRow === 0) {
        board[toRow][toCol] = 'Q';
    } else if (piece === 'p' && toRow === 7) {
        board[toRow][toCol] = 'q';
    }

    // Registrar último movimiento
    lastMove = {
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol }
    };

    // Cambiar turno y limpiar selección
    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    selectedPiece = null;
    validMoves = [];

    updateStatusMessage(currentTurn === 'white' ? "Mueven las Blancas." : "Mueven las Negras.");
    updateTurnCards();
    renderBoard();
}

// Deshacer el último movimiento
function undoMove() {
    if (moveHistory.length === 0 || !gameActive) return;

    const previousState = moveHistory.pop();
    board = previousState.board;
    currentTurn = previousState.currentTurn;
    capturedPieces = previousState.capturedPieces;
    lastMove = previousState.lastMove;
    timerWhite = previousState.timerWhite;
    timerBlack = previousState.timerBlack;

    selectedPiece = null;
    validMoves = [];

    updateCapturedUI();
    updateStatusMessage(currentTurn === 'white' ? "Mueven las Blancas (Deshecho)." : "Mueven las Negras (Deshecho).");
    updateTurnCards();
    updateTimerDisplay('white');
    updateTimerDisplay('black');
    renderBoard();
}

// Guardar el estado del juego para poder deshacerlo
function saveStateToHistory() {
    moveHistory.push({
        board: JSON.parse(JSON.stringify(board)),
        currentTurn: currentTurn,
        capturedPieces: JSON.parse(JSON.stringify(capturedPieces)),
        lastMove: lastMove ? JSON.parse(JSON.stringify(lastMove)) : null,
        timerWhite: timerWhite,
        timerBlack: timerBlack
    });
}

// Actualizar el panel de piezas capturadas
function updateCapturedUI() {
    const $whiteGroup = $('#white-captured-list');
    const $blackGroup = $('#black-captured-list');

    $whiteGroup.empty();
    $blackGroup.empty();

    // Las piezas blancas capturadas por las negras se muestran en la sección del jugador negro o debajo de blancas
    // Vamos a representarlas con unicode de tamaño pequeño
    capturedPieces.white.forEach(piece => {
        $whiteGroup.append($('<span>').addClass('piece-small').text(unicodePieces[piece]).css('color', '#ffffff'));
    });

    capturedPieces.black.forEach(piece => {
        $blackGroup.append($('<span>').addClass('piece-small').text(unicodePieces[piece]).css('color', '#1a1a1a'));
    });
}

// Actualizar mensaje de estado
function updateStatusMessage(message) {
    $('#status-message').text(message);
}

// Resaltar la tarjeta del jugador activo
function updateTurnCards() {
    $('.player-card').removeClass('active');
    if (currentTurn === 'white') {
        $('.player-card.white').addClass('active');
        $('.player-card.white .status').text("Tu turno");
        $('.player-card.black .status').text("Esperando...");
    } else {
        $('.player-card.black').addClass('active');
        $('.player-card.black .status').text("Tu turno");
        $('.player-card.white .status').text("Esperando...");
    }
}

// Terminar la partida
function endGame(message) {
    gameActive = false;
    clearInterval(timerInterval);
    updateStatusMessage(message);
    alert(message);
}

// Temporizadores de juego
function startTimers() {
    timerInterval = setInterval(function() {
        if (!gameActive) return;

        if (currentTurn === 'white') {
            timerWhite--;
            updateTimerDisplay('white');
            if (timerWhite <= 0) {
                endGame("¡Tiempo agotado! Las Negras ganan la partida.");
            }
        } else {
            timerBlack--;
            updateTimerDisplay('black');
            if (timerBlack <= 0) {
                endGame("¡Tiempo agotado! Las Blancas ganan la partida.");
            }
        }
    }, 1000);
}

function updateTimerDisplay(color) {
    const time = color === 'white' ? timerWhite : timerBlack;
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    $(`#timer-${color}`).text(formattedTime);
}

// --- MOTOR DE CÁLCULO DE MOVIMIENTOS ---

function getPieceColor(r, c) {
    const piece = board[r][c];
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'white' : 'black';
}

function isInsideBoard(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function calculateValidMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];

    const color = getPieceColor(r, c);
    const pieceType = piece.toLowerCase();
    let moves = [];

    switch (pieceType) {
        case 'p': // Peón
            const dir = color === 'white' ? -1 : 1; // Blanco sube (resta fila), Negro baja (suma fila)
            const startRow = color === 'white' ? 6 : 1;

            // 1 paso adelante
            if (isInsideBoard(r + dir, c) && !board[r + dir][c]) {
                moves.push({ row: r + dir, col: c, capture: false });
                
                // 2 pasos adelante (solo desde fila inicial)
                if (r === startRow && isInsideBoard(r + 2 * dir, c) && !board[r + 2 * dir][c]) {
                    moves.push({ row: r + 2 * dir, col: c, capture: false });
                }
            }

            // Capturas diagonales
            const captureCols = [c - 1, c + 1];
            captureCols.forEach(col => {
                if (isInsideBoard(r + dir, col)) {
                    const targetPiece = board[r + dir][col];
                    if (targetPiece && getPieceColor(r + dir, col) !== color) {
                        moves.push({ row: r + dir, col: col, capture: true });
                    }
                }
            });
            break;

        case 'n': // Caballo
            const knightOffsets = [
                [-2, -1], [-2, 1], [-1, -2], [-1, 2],
                [1, -2], [1, 2], [2, -1], [2, 1]
            ];
            knightOffsets.forEach(offset => {
                const targetRow = r + offset[0];
                const targetCol = c + offset[1];

                if (isInsideBoard(targetRow, targetCol)) {
                    const targetColor = getPieceColor(targetRow, targetCol);
                    if (!targetColor) {
                        moves.push({ row: targetRow, col: targetCol, capture: false });
                    } else if (targetColor !== color) {
                        moves.push({ row: targetRow, col: targetCol, capture: true });
                    }
                }
            });
            break;

        case 'r': // Torre
            const rookDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            rookDirs.forEach(d => {
                let step = 1;
                while (true) {
                    const targetRow = r + d[0] * step;
                    const targetCol = c + d[1] * step;

                    if (!isInsideBoard(targetRow, targetCol)) break;

                    const targetColor = getPieceColor(targetRow, targetCol);
                    if (!targetColor) {
                        moves.push({ row: targetRow, col: targetCol, capture: false });
                    } else {
                        if (targetColor !== color) {
                            moves.push({ row: targetRow, col: targetCol, capture: true });
                        }
                        break; // Se detiene al chocar con cualquier pieza
                    }
                    step++;
                }
            });
            break;

        case 'b': // Alfil
            const bishopDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            bishopDirs.forEach(d => {
                let step = 1;
                while (true) {
                    const targetRow = r + d[0] * step;
                    const targetCol = c + d[1] * step;

                    if (!isInsideBoard(targetRow, targetCol)) break;

                    const targetColor = getPieceColor(targetRow, targetCol);
                    if (!targetColor) {
                        moves.push({ row: targetRow, col: targetCol, capture: false });
                    } else {
                        if (targetColor !== color) {
                            moves.push({ row: targetRow, col: targetCol, capture: true });
                        }
                        break; // Detener al chocar con cualquier pieza
                    }
                    step++;
                }
            });
            break;

        case 'q': // Reina
            // La reina combina los movimientos de la torre y el alfil
            const queenDirs = [
                [-1, 0], [1, 0], [0, -1], [0, 1], // Torre
                [-1, -1], [-1, 1], [1, -1], [1, 1] // Alfil
            ];
            queenDirs.forEach(d => {
                let step = 1;
                while (true) {
                    const targetRow = r + d[0] * step;
                    const targetCol = c + d[1] * step;

                    if (!isInsideBoard(targetRow, targetCol)) break;

                    const targetColor = getPieceColor(targetRow, targetCol);
                    if (!targetColor) {
                        moves.push({ row: targetRow, col: targetCol, capture: false });
                    } else {
                        if (targetColor !== color) {
                            moves.push({ row: targetRow, col: targetCol, capture: true });
                        }
                        break;
                    }
                    step++;
                }
            });
            break;

        case 'k': // Rey
            const kingDirs = [
                [-1, 0], [1, 0], [0, -1], [0, 1],
                [-1, -1], [-1, 1], [1, -1], [1, 1]
            ];
            kingDirs.forEach(d => {
                const targetRow = r + d[0];
                const targetCol = c + d[1];

                if (isInsideBoard(targetRow, targetCol)) {
                    const targetColor = getPieceColor(targetRow, targetCol);
                    if (!targetColor) {
                        moves.push({ row: targetRow, col: targetCol, capture: false });
                    } else if (targetColor !== color) {
                        moves.push({ row: targetRow, col: targetCol, capture: true });
                    }
                }
            });
            break;
    }

    return moves;
}