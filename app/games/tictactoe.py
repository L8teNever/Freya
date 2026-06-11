import random
from typing import Dict, Any, List, Optional
from app.games.base import BaseGame

class TicTacToeGame(BaseGame):
    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "tictactoe", players)
        self.board: List[Optional[str]] = [None] * 9  # 0 to 8
        self.current_turn: Optional[str] = None  # session_id
        self.roles: Dict[str, str] = {}  # session_id -> "X" or "O"
        self.winning_line: Optional[List[int]] = None  # Winning cells
        self.start_game()

    def start_game(self) -> bool:
        # Reset state
        self.board = [None] * 9
        self.winner = None
        self.winning_line = None
        
        # Assign roles based on players
        if len(self.players) >= 2:
            self.roles = {
                self.players[0]["session_id"]: "X",
                self.players[1]["session_id"]: "O"
            }
            # X starts first
            self.current_turn = self.players[0]["session_id"]
        else:
            self.roles = {}
            self.current_turn = None

        self.status = "playing"
        return True

    def check_winner(self) -> Optional[str]:
        # Winning combinations
        win_coords = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],  # Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8],  # Cols
            [0, 4, 8], [2, 4, 6]              # Diagonals
        ]
        for coord in win_coords:
            val0 = self.board[coord[0]]
            val1 = self.board[coord[1]]
            val2 = self.board[coord[2]]
            if val0 is not None and val0 == val1 == val2:
                self.winning_line = coord
                # Find player ID for this role
                for p_id, role in self.roles.items():
                    if role == val0:
                        return p_id
        
        # Check draw
        if all(cell is not None for cell in self.board):
            return "draw"
        
        return None

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        action_type = action.get("type")

        if action_type == "restart":
            return self.start_game()

        if action_type == "make_move":
            if self.status != "playing":
                return False
            
            if self.current_turn != session_id:
                return False

            position = action.get("position")
            if position is None or not (0 <= position <= 8):
                return False

            if self.board[position] is not None:
                return False

            # Mark move
            role = self.roles.get(session_id)
            if not role:
                return False  # Observers cannot move

            self.board[position] = role

            # Check for win/draw
            result = self.check_winner()
            if result:
                self.status = "finished"
                self.winner = result
                self.current_turn = None
            else:
                # Switch turn
                players_with_roles = list(self.roles.keys())
                if len(players_with_roles) == 2:
                    current_idx = players_with_roles.index(session_id)
                    self.current_turn = players_with_roles[1 - current_idx]

            return True

        return False

    def get_state(self) -> Dict[str, Any]:
        player_names = {p["session_id"]: p["nickname"] for p in self.players}
        
        roles_with_names = {}
        for s_id, role in self.roles.items():
            roles_with_names[role] = {
                "session_id": s_id,
                "nickname": player_names.get(s_id, "Unknown")
            }

        winner_name = None
        if self.winner and self.winner != "draw":
            winner_name = player_names.get(self.winner, "Unknown")
        elif self.winner == "draw":
            winner_name = "Draw"

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "board": self.board,
            "current_turn": self.current_turn,
            "current_turn_name": player_names.get(self.current_turn) if self.current_turn else None,
            "roles": roles_with_names,
            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "role": self.roles.get(p["session_id"], "spectator")
                }
                for p in self.players
            ],
            "winner": self.winner,
            "winner_name": winner_name,
            "winning_line": self.winning_line
        }

