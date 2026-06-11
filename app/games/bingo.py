import random
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame

# Classic 75-ball column ranges for B I N G O
_COLUMN_RANGES = [(1, 15), (16, 30), (31, 45), (46, 60), (61, 75)]


class BingoGame(BaseGame):
    """
    Bingo (75 Kugeln).

    Jede:r bekommt eine 5x5-Karte (Mitte ist frei). Der Host zieht Zahlen; alle
    markieren ihre Karte (nur gezogene Zahlen zählen). Wer als Erste:r das
    eingestellte Muster voll hat, ruft Bingo. Der Server prüft den Anspruch.

    Einstellungen:
      - mode: "line" (eine Reihe/Spalte/Diagonale) oder "full" (ganze Karte).
      - auto_draw: Host zieht manuell, oder Zahlen kommen automatisch (Client-Takt).
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "bingo", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"

        # Config
        self.mode: str = "line"          # line | full
        self.auto_draw: bool = False
        self.auto_interval: int = 5      # seconds, used by the host client when auto

        # Round state
        self.cards: Dict[str, List[Dict[str, Any]]] = {}   # session_id -> 25 cells
        self.drawn: List[int] = []
        self.last_number: Optional[int] = None

    def add_participant(self, player: Dict[str, Any]) -> bool:
        if self.status != "setup":
            return False
        for p in self.players:
            if p["session_id"] == player["session_id"]:
                p["is_active"] = True
                return False
        self.players.append({"session_id": player["session_id"], "nickname": player["nickname"], "is_active": True})
        return True

    def _active_ids(self) -> List[str]:
        return [p["session_id"] for p in self.players if p["is_active"]]

    def _make_card(self) -> List[Dict[str, Any]]:
        # Build column by column, then flatten row-major
        columns = []
        for lo, hi in _COLUMN_RANGES:
            nums = random.sample(range(lo, hi + 1), 5)
            columns.append(nums)
        cells: List[Dict[str, Any]] = []
        for row in range(5):
            for col in range(5):
                if row == 2 and col == 2:
                    cells.append({"n": None, "marked": True, "free": True})  # free center
                else:
                    cells.append({"n": columns[col][row], "marked": False, "free": False})
        return cells

    def start_game(self) -> bool:
        active = self._active_ids()
        if len(active) < 1:
            return False
        self.cards = {sid: self._make_card() for sid in active}
        self.drawn = []
        self.last_number = None
        self.winner = None
        self.status = "playing"
        return True

    def _draw(self) -> bool:
        remaining = [n for n in range(1, 76) if n not in self.drawn]
        if not remaining:
            return False
        n = random.choice(remaining)
        self.drawn.append(n)
        self.last_number = n
        return True

    def _winning(self, cells: List[Dict[str, Any]]) -> bool:
        drawn_set = set(self.drawn)

        def is_marked(i: int) -> bool:
            c = cells[i]
            if c.get("free"):
                return True
            return c["marked"] and c["n"] in drawn_set

        if self.mode == "full":
            return all(is_marked(i) for i in range(25))

        # line mode: any row, column or diagonal
        for r in range(5):
            if all(is_marked(r * 5 + c) for c in range(5)):
                return True
        for c in range(5):
            if all(is_marked(r * 5 + c) for r in range(5)):
                return True
        if all(is_marked(i * 5 + i) for i in range(5)):
            return True
        if all(is_marked(i * 5 + (4 - i)) for i in range(5)):
            return True
        return False

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "configure":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            mode = action.get("mode")
            if mode in ("line", "full"):
                self.mode = mode
            ad = action.get("auto_draw")
            if isinstance(ad, bool):
                self.auto_draw = ad
            iv = action.get("auto_interval")
            if isinstance(iv, (int, float)):
                self.auto_interval = max(2, min(20, int(iv)))
            return True

        elif t == "start_game":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            return self.start_game()

        elif t == "draw":
            if self.status != "playing" or session_id != self.creator_id:
                return False
            return self._draw()

        elif t == "mark":
            if self.status != "playing":
                return False
            card = self.cards.get(session_id)
            if not card:
                return False
            idx = action.get("index")
            if not isinstance(idx, int) or not (0 <= idx < 25):
                return False
            cell = card[idx]
            if cell.get("free"):
                return False
            # Only allow marking numbers that were actually drawn (fairness)
            if cell["n"] not in self.drawn:
                return False
            cell["marked"] = not cell["marked"]
            return True

        elif t == "claim_bingo":
            if self.status != "playing":
                return False
            card = self.cards.get(session_id)
            if not card:
                return False
            if self._winning(card):
                self.status = "finished"
                self.winner = session_id
                return True
            return False  # false claim — silently ignored

        elif t == "restart":
            if self.status != "finished" or session_id != self.creator_id:
                return False
            self.cards = {}
            self.drawn = []
            self.last_number = None
            self.winner = None
            self.status = "setup"
            return True

        return False

    def get_state(self) -> Dict[str, Any]:
        names = {p["session_id"]: p["nickname"] for p in self.players}
        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",

            "mode": self.mode,
            "auto_draw": self.auto_draw,
            "auto_interval": self.auto_interval,

            "drawn": self.drawn,
            "last_number": self.last_number,
            "drawn_count": len(self.drawn),
            "cards": self.cards,

            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "role": "creator" if p["session_id"] == self.creator_id else "player",
                }
                for p in self.players
            ],
            "winner": self.winner,
            "winner_name": names.get(self.winner) if self.winner else None,
        }
