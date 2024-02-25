import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
} from "azle";
import { v4 as uuidv4 } from "uuid";

enum Type {
  BlackTile,
  WhiteTile,
  RedPiece,
  RedKing,
  BluePiece,
  BlueKing,
}

type Position = Record<{
  col: number;
  row: number;
}>;

type updatePos = Record<{
  PieceCol: number;
  PieceRow: number;
  movePieceToCol: number;
  movePieceToRow: number;
}>;

// type teamScore = Record<{
//   redTeam: number;
//   blueTeam: number;
// }>

type Tile = Position & {
  type: Type;
  isKing: boolean;
};

type Game = Record<{
  id: string;
  winner: Opt<string>;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>

let board: Tile[][] = [];
let redPieces: Tile[] = [];
let bluePieces: Tile[] = [];

let isRedTurn = true;
let isInit = false;
let isGameOver = false;

let currentId: string;

// const teamScore = new StableBTreeMap<string, teamScore>(0, 44, 1024);
const gameHistory = new StableBTreeMap<string, Game>(1, 44, 1024);


function InitGame(): void {
  for (let row = 0; row < 8; row++) {
    board[row] = [];
    for (let col = 0; col < 8; col++) {
      const tileType =
        (row % 2 === 0 && col % 2 === 0) || (row % 2 === 1 && col % 2 === 1)
          ? Type.BlackTile
          : Type.WhiteTile;

      const tile: Tile = {
        col,
        row,
        type: tileType,
        isKing: false,
      };
      if (row < 3 && tileType === Type.BlackTile) {
        tile.type = Type.RedPiece;
        redPieces.push(tile);
      }
      if (row > 4 && tileType === Type.BlackTile) {
        tile.type = Type.BluePiece;
        bluePieces.push(tile);
      }

      board[row][col] = tile;
    }
  }
}

function isValidMove(
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  pieceType: Type
): boolean {
  const rowDifference = Math.abs(toRow - fromRow);
  const colDifference = Math.abs(toCol - fromCol);

  // Check if the move is not out of bound
  if (toRow < 8 && toRow >= 0 && toCol < 8 && toCol >= 0) {
    // Check if it's a 1 diagonal move if it's a normal piece type
    if (
      pieceType !== Type.RedKing &&
      pieceType !== Type.BlueKing &&
      rowDifference === 1 &&
      colDifference === 1
    ) {
      // Check the direction based on the player's turn
      if ((isRedTurn && toRow > fromRow) || (!isRedTurn && toRow < fromRow)) {
        return true;
      }
    }
  }
  // Check if it's a valid move (jumping over opponent's piece)
  if (
    rowDifference === 2 &&
    colDifference === 2 &&
    board[(fromRow + toRow) / 2][(fromCol + toCol) / 2].type !== Type.BlackTile
  ) {
    return true;
  }

  //Check if it's a diagonal move and is a king
  if (
    (pieceType === Type.RedKing || pieceType === Type.BlueKing) &&
    rowDifference === colDifference &&
    board[toRow][toCol].type === Type.BlackTile
  ) {
    return true;
  }
  return false;
}

function renderBoard(board: Tile[][]): string {
  let boardRender = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const tile = board[row][col];
      let symbol = "";

      switch (tile.type) {
        case Type.BlackTile:
          symbol = "⬛";
          break;
        case Type.WhiteTile:
          symbol = "🔲";
          break;
        case Type.RedPiece:
          symbol = "🔴";
          break;
        case Type.RedKing:
          symbol = "❤️";
          break;
        case Type.BluePiece:
          symbol = "🔵";
          break;
        case Type.BlueKing:
          symbol = "💙";
          break;
      }
      boardRender += `${symbol} `;
    }

    // Append the row number at the end of each row
    boardRender += `${row}\n`;
  }

  boardRender += `0...1...2..3...4..5...6...7 `;

  return boardRender;
}

//to start game
$update;
export function startCheckers(): Result<string, string> {
  if (!isInit) {
    isInit = !isInit;
    InitGame();
    currentId = uuidv4();
    //insert game history to the StableBTreeMap
    const game: Game = {id: currentId, createdAt: ic.time(), updatedAt: Opt.None, winner: Opt.None};
    gameHistory.insert(game.id, game);
    return Result.Ok("\n Game has started. Update the board.\n");
  } else {
    return Result.Ok("\n The game has been initialized.\n");
  }
}

$query;
export function updateBoard(): Result<string, string> {
  if (redPieces.length === 0) {
    isGameOver = true;
    return Result.Ok(
      "\n\n" +
        renderBoard(board) +
        "\n\n" +
        `\nRed Pieces: ${redPieces.length} \nBlue Pieces: ${bluePieces.length} \n\n` +
        `Game Over. Blue Team won with ${bluePieces.length} pieces left.`
    );
    //add score to the scoreboard
  }

  if (bluePieces.length === 0) {
    isGameOver = true;
    return match(gameHistory.get(currentId), {
      Some: (game) => {
          const updatedGame: Game = {...game, updatedAt: Opt.Some(ic.time()), winner: Opt.Some("Red Team")};
          gameHistory.insert(game.id, updatedGame);
          return Result.Ok<string,string>(
    "\n\n" +
      renderBoard(board) +
      "\n\n" +
      `\nRed Pieces: ${redPieces.length} \nBlue Pieces: ${bluePieces.length} \n\n` +
      `Game Over. Red Team won with ${redPieces.length} pieces left.`
  );
      },
      None: () => Result.Err<string, string>(`couldn't update a message with id=${currentId}. Game not found`)
  });
  } 

  if (redPieces.length === 0) {
    isGameOver = true;
    return match(gameHistory.get(currentId), {
      Some: (game) => {
          const updatedGame: Game = {...game, updatedAt: Opt.Some(ic.time()), winner: Opt.Some("Blue Team")};
          gameHistory.insert(game.id, updatedGame);
          return Result.Ok<string,string>(
    "\n\n" +
      renderBoard(board) +
      "\n\n" +
      `\nRed Pieces: ${redPieces.length} \nBlue Pieces: ${bluePieces.length} \n\n` +
      `Game Over. Blue Team won with ${bluePieces.length} pieces left.`
  );
      },
      None: () => Result.Err<string, string>(`couldn't update a message with id=${currentId}. Game not found`)
  });
  }

  

  return Result.Ok(
    "\n\n" +
      renderBoard(board) +
      "\n\n" +
      `\nRed Pieces: ${redPieces.length} \nBlue Pieces: ${bluePieces.length} \n\n` +
      (isRedTurn ? "Red's turn to move" : "Blue's turn to move")
  );
}

//blue team move
$update;
export function blueTeam(pos: updatePos): Result<string, string> {
  if (!isRedTurn && !isGameOver) {
    // Find the piece index that blueTeam wants to move
    const pieceIndex = bluePieces.findIndex(
      (piece) => pos.PieceCol === piece.col && pos.PieceRow === piece.row
    );

    // Check if the piece index is valid
    if (pieceIndex !== -1) {
      // Check if the next move is valid (black tile)
      if (
        board[pos.movePieceToRow][pos.movePieceToCol].type === Type.BlackTile &&
        isValidMove(
          pos.PieceRow,
          pos.PieceCol,
          pos.movePieceToRow,
          pos.movePieceToCol,
          bluePieces[pieceIndex].type
        )
      ) {
        //check if the piece that moved is a king or no
        //if yes change the destination as a king too. if not, don't.
        if (
          board[pos.PieceRow][pos.PieceCol].type === Type.BlueKing &&
          bluePieces[pieceIndex].isKing
        ) {
          board[pos.PieceRow][pos.PieceCol].type = Type.BlackTile;
          board[pos.movePieceToRow][pos.movePieceToCol].type = Type.BlueKing;
        } else {
          board[pos.PieceRow][pos.PieceCol].type = Type.BlackTile;
        }

        bluePieces[pieceIndex].col = pos.movePieceToCol;
        bluePieces[pieceIndex].row = pos.movePieceToRow;

        //piece promotion to a king if it reaches the end of the row(index 0)
        if (
          bluePieces[pieceIndex].row === 0 &&
          !bluePieces[pieceIndex].isKing
        ) {
          board[pos.movePieceToRow][pos.movePieceToCol].isKing = true;
          board[pos.movePieceToRow][pos.movePieceToCol].type = Type.BlueKing;
          bluePieces[pieceIndex].type = Type.BlueKing;
          bluePieces[pieceIndex].isKing = true;
        } else {
          board[pos.movePieceToRow][pos.movePieceToCol].type = Type.BluePiece;
        }

        // Check if it's a capture move
        if (
          Math.abs(pos.PieceRow - pos.movePieceToRow) === 2 &&
          Math.abs(pos.PieceCol - pos.movePieceToCol) === 2
        ) {
          const capturedPieceRow = (pos.PieceRow + pos.movePieceToRow) / 2;
          const capturedPieceCol = (pos.PieceCol + pos.movePieceToCol) / 2;

          // Check if the captured piece indices are valid
          if (
            capturedPieceRow >= 0 &&
            capturedPieceRow < 8 &&
            capturedPieceCol >= 0 &&
            capturedPieceCol < 8
          ) {
            // Mark the captured piece as captured
            board[capturedPieceRow][capturedPieceCol].type = Type.BlackTile;
            // Remove the captured piece from the opponent's pieces array
            const capturedPieceIndex = redPieces.findIndex(
              (piece) =>
                piece.col === capturedPieceCol && piece.row === capturedPieceRow
            );

            // Check if the captured piece index is valid before removing
            if (capturedPieceIndex !== -1) {
              redPieces.splice(capturedPieceIndex, 1);
            }
          }
        }
      } else {
        return Result.Err(
          "That tile is occupied or an illegal move.\n" +
            `Destination type = ${
              board[pos.movePieceToRow][pos.movePieceToCol].type
            }` +
            `Current type = ${board[pos.PieceRow][pos.PieceCol].type}`
        );
      }
    } else {
      return Result.Err("Piece is not found.");
    }

    //change team turn
    isRedTurn = !isRedTurn;
    return Result.Ok(
      `${pos.PieceCol}, ${pos.PieceRow} \n ${pos.movePieceToCol}, ${
        pos.movePieceToCol
      }, isRedTurn = ${isRedTurn} \n type: ${
        board[pos.movePieceToRow][pos.movePieceToCol].type
      }\n\n
      
      
      piece index:${pieceIndex}\nisKing: ${
        bluePieces[pieceIndex].isKing
      } \ntype: ${bluePieces[pieceIndex].type} ${bluePieces[pieceIndex].row} ${
        bluePieces[pieceIndex].col
      }}`
    );
  } else {
    return isGameOver
      ? Result.Ok("Game has ended. Call startCheckers to start a new game.")
      : Result.Ok("Wait for your turn");
  }
}

$update;
export function redTeam(pos: updatePos): Result<string, string> {
  if (isRedTurn && !isGameOver) {
    // Find the piece index that redTeam wants to move
    const pieceIndex = redPieces.findIndex(
      (piece) => pos.PieceCol === piece.col && pos.PieceRow === piece.row
    );

    // Check if the piece index is valid
    if (pieceIndex !== -1) {
      // Check if the next move is valid (black tile)
      if (
        board[pos.movePieceToRow][pos.movePieceToCol].type === Type.BlackTile &&
        isValidMove(
          pos.PieceRow,
          pos.PieceCol,
          pos.movePieceToRow,
          pos.movePieceToCol,
          redPieces[pieceIndex].type
        )
      ) {
        if (board[pos.PieceRow][pos.PieceCol].type === Type.RedKing) {
          board[pos.PieceRow][pos.PieceCol].type = Type.BlackTile;
          board[pos.movePieceToRow][pos.movePieceToCol].type = Type.RedKing;
        } else {
          board[pos.PieceRow][pos.PieceCol].type = Type.BlackTile;
          board[pos.movePieceToRow][pos.movePieceToCol].type = Type.RedPiece;
        }

        redPieces[pieceIndex].col = pos.movePieceToCol;
        redPieces[pieceIndex].row = pos.movePieceToRow;

        if (
          pos.movePieceToRow === 7 &&
          !board[pos.movePieceToRow][pos.movePieceToCol].isKing
        ) {
          board[pos.movePieceToRow][pos.movePieceToCol].isKing = true;
          board[pos.movePieceToRow][pos.movePieceToCol].type = Type.RedKing;
          redPieces[pieceIndex].type = Type.RedKing;
        }

        // Check if it's a capture move
        if (
          Math.abs(pos.PieceRow - pos.movePieceToRow) === 2 &&
          Math.abs(pos.PieceCol - pos.movePieceToCol) === 2
        ) {
          const capturedPieceRow = (pos.PieceRow + pos.movePieceToRow) / 2;
          const capturedPieceCol = (pos.PieceCol + pos.movePieceToCol) / 2;

          // Check if the captured piece indices are valid
          if (
            capturedPieceRow >= 0 &&
            capturedPieceRow < 8 &&
            capturedPieceCol >= 0 &&
            capturedPieceCol < 8
          ) {
            // Mark the captured piece as captured
            board[capturedPieceRow][capturedPieceCol].type = Type.BlackTile;
            // Remove the captured piece from the opponent's pieces array
            const capturedPieceIndex = bluePieces.findIndex(
              (piece) =>
                piece.col === capturedPieceCol && piece.row === capturedPieceRow
            );

            // Check if the captured piece index is valid before removing
            if (capturedPieceIndex !== -1) {
              bluePieces.splice(capturedPieceIndex, 1);
            }
          }
        }
      } else {
        return Result.Err(
          "That tile is occupied.\n" +
            `Destination type = ${
              board[pos.movePieceToRow][pos.movePieceToCol].type
            }` +
            `Current type = ${board[pos.PieceRow][pos.PieceCol].type}\n` +
            isValidMove(
              pos.PieceRow,
              pos.PieceCol,
              pos.movePieceToRow,
              pos.movePieceToCol,
              redPieces[pieceIndex].type
            )
        );
      }
    } else {
      return Result.Err("Invalid move");
    }
    //change team turn
    isRedTurn = !isRedTurn;
    return Result.Ok(
      `${pos.PieceCol}, ${pos.PieceRow} \n ${pos.movePieceToCol}, ${
        pos.movePieceToCol
      }, isRedTurn = ${isRedTurn} \n type: ${
        board[pos.movePieceToRow][pos.movePieceToCol].type
      }`
    );
  } else {
    return isGameOver
      ? Result.Ok("Game has ended. Call startCheckers to start a new game.")
      : Result.Ok("Wait for your turn");
  }
}

//to see game scoreboard
// $query;
// export function TeamScores(): Result<Vec<teamScore>, string> {
//   return Result.Ok(teamScore.values());
// }

//implements game reset
$update;
export function reset(): Result<string, string> {
  board = [];
  redPieces = [];
  bluePieces = [];
  isRedTurn = true;
  isInit = false;
  isGameOver = false;
  currentId = "";

  // Initialize a new game
  InitGame();
  return Result.Ok("game reseted, please update the board");
}

//to see all games history
$query
export function getGamesHistory(): Result<Vec<Game>, string>{
return Result.Ok(gameHistory.values()); 
}

//to see a game history based on game ID
$query
export function getMessage(id: string): Result<Game, string> {
  return match(gameHistory.get(id), {
      Some: (message) => Result.Ok<Game, string>(message),
      None: () => Result.Err<Game, string>(`a Game with id=${id} not found`)
  });
}

$query
export function howToPlay(): Result<string, string>{
  return Result.Ok("\nHow To Play: \n1. Start Game by calling startCheckers.\n2. Call updateBoard to see any changes after a move.\n2. Move every piece with Row and Column. If your team fail to move a piece, your team can try again.\n3. If your team has no piece left on the board, you lose.\n4. Reset the game by calling reset.")
}