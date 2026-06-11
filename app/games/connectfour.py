from typing import Dict, Any, List, Optional
from app.games.base import BaseGame

ROWS = 6
COLS = 7


class ConnectFourGame(BaseGame):
    """
    Vier gewinnt.

    7 Spalten x 6 Reihen. Abwechselnd Chips fallen lassen. Wer zuerst 4 in einer
    Reihe (horizontal, vertikal oder diagonal) hat, gewinnt.
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "connectfour", players)
        self.board: List[Optional[str]] = [None] * (ROWS * COLS)  # index = row*COLS+col, row 0 = oben
        self.current_turn: Optional[str] = None
        self.roles: Dict[str, str] = {}          # session_id -> "R" / "Y"
        self.winning_line: Optional[List[int]] = None
        self.start_game()

    def start_game(self) -> bool:
        self.board = [None] * (ROWS * COLS)
        self.winner = None
        self.winning_line = None
        if len(self.players) >= 2:
            self.roles = {self.players[0]["session_id"]: "R", self.players[1]["session_id"]: "Y"}
            self.current_turn = self.players[0]["session_id"]
        else:
            self.roles = {}
            self.current_turn = None
        self.status = "playing"
        return True

    def _drop_row(self, col: int) -> Optional[int]:
        for row in range(ROWS - 1, -1, -1):
            if self.board[row * COLS + col] is None:
                return row
        return None

    def _check_win(self, last_idx: int) -> bool:
        role = self.board[last_idx]
        if role is None:
            return False
        r0, c0 = divmod(last_idx, COLS)
        for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
            line = [last_idx]
            for sign in (1, -1):
                r, c = r0 + dr * sign, c0 + dc * sign
                while 0 <= r < ROWS and 0 <= c < COLS and self.board[r * COLS + c] == role:
                    line.append(r * COLS + c)
                    r += dr * sign
                    c += dc * sign
            if len(line) >= 4:
                self.winning_line = sorted(line)[:4] if len(line) == 4 else sorted(line)
                return True
        return False

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "restart":
            return self.start_game()

        if t == "drop":
            if self.status != "playing" or self.current_turn != session_id:
                return False
            role = self.roles.get(session_id)
            if not role:
                return False
            col = action.get("column")
            if not isinstance(col, int) or not (0 <= col < COLS):
                return False
            row = self._drop_row(col)
            if row is None:
                return False
            idx = row * COLS + col
            self.board[idx] = role

            if self._check_win(idx):
                self.status = "finished"
                self.winner = session_id
                self.current_turn = None
            elif all(cell is not None for cell in self.board):
                self.status = "finished"
                self.winner = "draw"
                self.current_turn = None
            else:
                ids = list(self.roles.keys())
                self.current_turn = ids[1 - ids.index(session_id)]
            return True

        return False

    def get_state(self) -> Dict[str, Any]:
        names = {p["session_id"]: p["nickname"] for p in self.players}
        roles_with_names = {role: {"session_id": sid, "nickname": names.get(sid, "?")} for sid, role in self.roles.items()}
        winner_name = None
        if self.winner and self.winner != "draw":
            winner_name = names.get(self.winner, "?")
        elif self.winner == "draw":
            winner_name = "Draw"
        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "rows": ROWS,
            "cols": COLS,
            "board": self.board,
            "current_turn": self.current_turn,
            "current_turn_name": names.get(self.current_turn) if self.current_turn else None,
            "roles": roles_with_names,
            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "role": self.roles.get(p["session_id"], "spectator"),
                }
                for p in self.players
            ],
            "winner": self.winner,
            "winner_name": winner_name,
            "winning_line": self.winning_line,
        }
