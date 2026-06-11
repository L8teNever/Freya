import random
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame

# Category ids in fixed display order
UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"]
LOWER = ["three_kind", "four_kind", "full_house", "small_straight", "large_straight", "kniffel", "chance"]
ALL_CATEGORIES = UPPER + LOWER

CATEGORY_NAMES = {
    "ones": "Einser", "twos": "Zweier", "threes": "Dreier", "fours": "Vierer",
    "fives": "Fünfer", "sixes": "Sechser",
    "three_kind": "Dreierpasch", "four_kind": "Viererpasch", "full_house": "Full House",
    "small_straight": "Kleine Straße", "large_straight": "Große Straße",
    "kniffel": "Kniffel", "chance": "Chance",
}


def score_category(category: str, dice: List[int]) -> int:
    counts = {v: dice.count(v) for v in range(1, 7)}
    total = sum(dice)
    if category in ("ones", "twos", "threes", "fours", "fives", "sixes"):
        face = UPPER.index(category) + 1
        return counts[face] * face
    if category == "three_kind":
        return total if any(c >= 3 for c in counts.values()) else 0
    if category == "four_kind":
        return total if any(c >= 4 for c in counts.values()) else 0
    if category == "full_house":
        vals = sorted(counts.values(), reverse=True)
        return 25 if vals[0] == 3 and vals[1] == 2 else 0
    if category == "small_straight":
        s = set(dice)
        for run in ({1, 2, 3, 4}, {2, 3, 4, 5}, {3, 4, 5, 6}):
            if run.issubset(s):
                return 30
        return 0
    if category == "large_straight":
        s = set(dice)
        return 40 if s in ({1, 2, 3, 4, 5}, {2, 3, 4, 5, 6}) else 0
    if category == "kniffel":
        return 50 if any(c == 5 for c in counts.values()) else 0
    if category == "chance":
        return total
    return 0


class KniffelGame(BaseGame):
    """
    Kniffel (Yahtzee).

    Reihum: bis zu 3 Würfe mit 5 Würfeln, Würfel zwischen den Würfen halten,
    danach eine Kategorie eintragen (jede genau einmal). Oben-Bonus: +35, wenn
    die obere Hälfte >= 63 ist. Wer am Ende die meisten Punkte hat, gewinnt.
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "kniffel", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"

        self.order: List[str] = []
        self.current_index: int = 0

        self.dice: List[int] = [0, 0, 0, 0, 0]
        self.held: List[bool] = [False] * 5
        self.rolls_left: int = 3
        self.rolled_this_turn: bool = False

        # session_id -> {category: int}
        self.cards: Dict[str, Dict[str, int]] = {}

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

    def _current(self) -> Optional[str]:
        return self.order[self.current_index] if self.order and 0 <= self.current_index < len(self.order) else None

    def _reset_turn(self):
        self.dice = [0, 0, 0, 0, 0]
        self.held = [False] * 5
        self.rolls_left = 3
        self.rolled_this_turn = False

    def _advance(self):
        self._reset_turn()
        if all(len(self.cards.get(sid, {})) >= len(ALL_CATEGORIES) for sid in self.order):
            self._finish()
            return
        # next player who still has open categories
        n = len(self.order)
        idx = self.current_index
        for _ in range(n):
            idx = (idx + 1) % n
            sid = self.order[idx]
            if len(self.cards.get(sid, {})) < len(ALL_CATEGORIES):
                self.current_index = idx
                return

    def start_game(self) -> bool:
        active = self._active_ids()
        if len(active) < 1:
            return False
        self.order = active
        self.current_index = 0
        self.cards = {sid: {} for sid in active}
        self._reset_turn()
        self.winner = None
        self.status = "playing"
        return True

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "start_game":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            return self.start_game()

        if self.status != "playing":
            if t == "restart" and session_id == self.creator_id and self.status == "finished":
                self.status = "setup"
                self.cards = {}
                self.winner = None
                return True
            return False

        if session_id != self._current():
            return False

        if t == "roll":
            if self.rolls_left <= 0:
                return False
            for i in range(5):
                if not self.held[i] or not self.rolled_this_turn:
                    self.dice[i] = random.randint(1, 6)
            self.rolls_left -= 1
            self.rolled_this_turn = True
            return True

        if t == "toggle_hold":
            if not self.rolled_this_turn:
                return False
            i = action.get("index")
            if isinstance(i, int) and 0 <= i < 5:
                self.held[i] = not self.held[i]
                return True
            return False

        if t == "score":
            if not self.rolled_this_turn:
                return False
            cat = action.get("category")
            if cat not in ALL_CATEGORIES:
                return False
            card = self.cards.setdefault(session_id, {})
            if cat in card:
                return False
            card[cat] = score_category(cat, self.dice)
            self._advance()
            return True

        return False

    def _upper_sum(self, sid: str) -> int:
        card = self.cards.get(sid, {})
        return sum(card.get(c, 0) for c in UPPER)

    def _total(self, sid: str) -> int:
        card = self.cards.get(sid, {})
        base = sum(card.values())
        bonus = 35 if self._upper_sum(sid) >= 63 else 0
        return base + bonus

    def _finish(self):
        self.status = "finished"
        best = -1
        win = None
        draw = False
        for sid in self.order:
            tot = self._total(sid)
            if tot > best:
                best, win, draw = tot, sid, False
            elif tot == best:
                draw = True
        self.winner = "draw" if draw else win

    def get_state(self) -> Dict[str, Any]:
        names = {p["session_id"]: p["nickname"] for p in self.players}
        current_id = self._current() if self.status == "playing" else None

        # Preview scores for the current dice (so the player can choose well)
        preview = {}
        if self.status == "playing" and self.rolled_this_turn and current_id:
            open_cats = [c for c in ALL_CATEGORIES if c not in self.cards.get(current_id, {})]
            preview = {c: score_category(c, self.dice) for c in open_cats}

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",

            "categories": ALL_CATEGORIES,
            "category_names": CATEGORY_NAMES,
            "upper_ids": UPPER,
            "lower_ids": LOWER,

            "dice": self.dice,
            "held": self.held,
            "rolls_left": self.rolls_left,
            "rolled_this_turn": self.rolled_this_turn,
            "preview": preview,

            "current_turn": current_id,
            "current_turn_name": names.get(current_id) if current_id else None,

            "cards": {names.get(sid, "?"): self.cards.get(sid, {}) for sid in self.order} if self.order else {},
            "cards_by_id": {sid: self.cards.get(sid, {}) for sid in self.order},
            "totals": {names.get(sid, "?"): self._total(sid) for sid in self.order} if self.order else {},
            "upper_sums": {names.get(sid, "?"): self._upper_sum(sid) for sid in self.order} if self.order else {},

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
            "winner_name": names.get(self.winner) if self.winner and self.winner != "draw" else ("Unentschieden" if self.winner == "draw" else None),
        }
