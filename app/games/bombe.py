import random
import re
import time
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame

_WORD_RE = re.compile(r"^[a-zA-ZäöüÄÖÜß0-9][a-zA-ZäöüÄÖÜß0-9 \-]*$")

DEFAULT_CATEGORIES = [
    "Ein Tier",
    "Eine Stadt",
    "Ein Land",
    "Ein Essen",
    "Ein Beruf",
    "Eine Automarke",
    "Ein Vorname",
    "Etwas im Kühlschrank",
    "Ein Filmtitel",
    "Eine Farbe",
]


class BombeGame(BaseGame):
    """
    Bombe (Bomb Party).

    Eine Kategorie wird vorgegeben ("Ein Tier", ...). Reihum muss jeder Spieler
    einen passenden Begriff nennen. Eine gemeinsame Bombe tickt die ganze Zeit
    herunter. Wer die Bombe gerade hält und es bis 0 nicht schafft, fliegt raus.

    Fairness:
    - Bei einer gültigen Eingabe gibt es +5 Sek. Bonus (man muss ja tippen),
      aber NICHT missbrauchbar: der Begriff muss eine Mindestlänge haben, gültige
      Zeichen enthalten und darf in dieser Bomben-Runde nicht doppelt sein.
    - Zweifelt jemand einen Begriff an ("das stimmt doch gar nicht"), startet das
      gemeinsame Anfechten/Abstimmen aus BaseGame. Wird es bestätigt, fliegt der
      Spieler raus.
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "bombe", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"

        # Config
        self.bomb_seconds: int = 30      # total bomb time when a new bomb starts
        self.type_bonus: int = 5         # seconds added on a valid answer
        self.min_length: int = 3
        self.categories: List[str] = list(DEFAULT_CATEGORIES[:6])

        # Round state
        self.order: List[str] = []
        self.current_index: int = 0
        self.bomb_end_time: float = 0.0
        self.turn_count: int = 0
        self.current_category: str = ""
        self.used_terms: set = set()
        self.recent: List[Dict[str, Any]] = []   # last few accepted answers (for context/dispute)
        self.eliminated: set = set()
        self.turn_error: Optional[Dict[str, str]] = None

    # --- Joining ---
    def add_participant(self, player: Dict[str, Any]) -> bool:
        if self.status != "setup":
            return False
        for p in self.players:
            if p["session_id"] == player["session_id"]:
                p["is_active"] = True
                return False
        self.players.append({"session_id": player["session_id"], "nickname": player["nickname"], "is_active": True})
        return True

    # --- Turn helpers ---
    def _remaining(self) -> List[str]:
        return [sid for sid in self.order if sid not in self.eliminated]

    def _current_player_id(self) -> Optional[str]:
        if not self.order:
            return None
        return self.order[self.current_index] if 0 <= self.current_index < len(self.order) else None

    def _new_bomb(self):
        """Pick a fresh category and reset the bomb timer for the survivors."""
        self.current_category = random.choice(self.categories) if self.categories else "Ein Wort"
        self.used_terms = set()
        self.bomb_end_time = time.time() + self.bomb_seconds

    def _advance_after_explode(self):
        remaining = self._remaining()
        if len(remaining) <= 1:
            self.status = "finished"
            self.winner = remaining[0] if remaining else "draw"
            self.bomb_end_time = 0.0
            return
        # next non-eliminated and start a fresh bomb
        self._step_index()
        self.turn_count += 1
        self.turn_error = None
        self._new_bomb()

    def _advance_after_answer(self):
        self._step_index()
        self.turn_count += 1
        self.turn_error = None
        # bomb keeps ticking; reward typing with bonus time
        self.bomb_end_time += self.type_bonus

    def _step_index(self):
        n = len(self.order)
        idx = self.current_index
        for _ in range(n):
            idx = (idx + 1) % n
            if self.order[idx] not in self.eliminated:
                self.current_index = idx
                return

    def start_game(self):
        active = [p["session_id"] for p in self.players if p["is_active"]]
        if len(active) < 2:
            return False
        self.order = active
        self.current_index = 0
        self.eliminated = set()
        self.recent = []
        self.turn_count = 1
        self.turn_error = None
        self.winner = None
        self._new_bomb()
        self.status = "playing"
        return True

    def _explode_current(self):
        sid = self._current_player_id()
        if sid is None:
            return
        self.eliminated.add(sid)
        self.turn_error = {"session_id": sid, "reason": "💥 Bombe explodiert!"}
        self._advance_after_explode()

    # --- Actions ---
    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "configure":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            bs = action.get("bomb_seconds")
            if isinstance(bs, (int, float)):
                self.bomb_seconds = max(10, min(120, int(bs)))
            tb = action.get("type_bonus")
            if isinstance(tb, (int, float)):
                self.type_bonus = max(0, min(15, int(tb)))
            ml = action.get("min_length")
            if isinstance(ml, (int, float)):
                self.min_length = max(1, min(12, int(ml)))
            cats = action.get("categories")
            if isinstance(cats, list):
                cleaned = [str(c).strip() for c in cats if str(c).strip()]
                if cleaned:
                    self.categories = cleaned[:30]
            return True

        elif t == "add_category":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            cat = str(action.get("category", "")).strip()
            if cat and cat not in self.categories:
                self.categories.append(cat[:60])
                return True
            return False

        elif t == "start_game":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            return self.start_game()

        elif t == "submit_term":
            if self.status != "playing" or session_id != self._current_player_id():
                return False
            # bomb already expired -> this is an explosion, not an answer
            if time.time() >= self.bomb_end_time:
                self._explode_current()
                return True
            term = str(action.get("term", "")).strip()
            err = self._validate(term)
            if err:
                self.turn_error = {"session_id": session_id, "reason": err}
                return True
            self.used_terms.add(term.lower())
            entry = {"term": term, "session_id": session_id, "nickname": self._player_name(session_id), "category": self.current_category}
            self.recent.append(entry)
            self.recent = self.recent[-6:]
            self._advance_after_answer()
            return True

        elif t == "timeout":
            if self.status != "playing":
                return False
            seen = action.get("turn_count")
            if seen is not None and seen != self.turn_count:
                return False
            if time.time() < self.bomb_end_time - 0.5:
                return False
            self._explode_current()
            return True

        elif t == "give_up":
            if self.status != "playing" or session_id != self._current_player_id():
                return False
            self._explode_current()
            return True

        elif t == "restart":
            if self.status != "finished" or session_id != self.creator_id:
                return False
            self.status = "setup"
            self.recent = []
            self.eliminated = set()
            self.winner = None
            return True

        return False

    def on_dispute_upheld(self, target_id: str, dispute: Dict[str, Any]) -> None:
        if self.status != "playing" or target_id in self.eliminated:
            return
        was_current = (target_id == self._current_player_id())
        self.eliminated.add(target_id)
        if was_current:
            self._advance_after_explode()
        else:
            remaining = self._remaining()
            if len(remaining) <= 1:
                self.status = "finished"
                self.winner = remaining[0] if remaining else "draw"

    def _validate(self, term: str) -> Optional[str]:
        if not term:
            return "Kein Begriff eingegeben"
        if len(term) < self.min_length:
            return f"Mindestens {self.min_length} Zeichen"
        if not _WORD_RE.match(term):
            return "Ungültige Zeichen"
        if term.lower() in self.used_terms:
            return "Schon genannt"
        return None

    # --- State ---
    def get_state(self) -> Dict[str, Any]:
        time_left = 0
        if self.status == "playing":
            time_left = max(0, int(round(self.bomb_end_time - time.time())))
        current_id = self._current_player_id() if self.status == "playing" else None
        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",

            "bomb_seconds": self.bomb_seconds,
            "type_bonus": self.type_bonus,
            "min_length": self.min_length,
            "categories": self.categories,

            "current_category": self.current_category,
            "time_left": time_left,
            "turn_count": self.turn_count,
            "current_turn": current_id,
            "current_turn_name": self._player_name(current_id) if current_id else None,
            "recent": self.recent,
            "turn_error": self.turn_error,

            "remaining_count": len(self._remaining()) if self.order else len([p for p in self.players if p["is_active"]]),
            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "eliminated": p["session_id"] in self.eliminated,
                    "role": "creator" if p["session_id"] == self.creator_id else "player",
                }
                for p in self.players
            ],
            "winner": self.winner,
            "winner_name": self._player_name(self.winner) if self.winner and self.winner != "draw" else ("Unentschieden" if self.winner == "draw" else None),
        }
