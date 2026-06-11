import random
import re
import time
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame

# Allowed word characters: German letters + hyphen
_WORD_RE = re.compile(r"^[a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\-]*$")
_START_LETTERS = "ABCDEFGHIJKLMNOPRSTUVWZ"


class WortketteGame(BaseGame):
    """
    Wortkette (Word Chain).

    Reihum-Spiel: Ein Spieler nennt ein Wort, der nächste muss ein neues Wort
    nennen, das mit dem letzten Buchstaben des vorherigen Wortes beginnt.
    Jeder Spieler hat pro Zug eine begrenzte Zeit. Wer es nicht schafft oder
    aufgibt, ist raus. Der letzte verbliebene Spieler gewinnt.

    Eliminierte Spieler bleiben als Zuschauer in der Partie und sehen den
    weiteren Verlauf. Gruppenmitglieder, die nicht mitspielen, können ebenfalls
    jederzeit zuschauen (das Broadcasting läuft über den GroupManager).
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "wortkette", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"  # setup, playing, finished

        # Configuration
        self.turn_seconds: int = 15
        self.min_length: int = 3

        # Round state
        self.order: List[str] = []          # turn order (session_ids)
        self.current_index: int = 0
        self.required_letter: str = ""       # next word must start with this (uppercase)
        self.end_time: float = 0.0
        self.turn_count: int = 0             # increments every turn (anti double-fire)

        self.chain: List[Dict[str, Any]] = []   # [{word, session_id, nickname}]
        self.used_words: set = set()             # lowercased words already played
        self.eliminated: set = set()             # session_ids that are out
        self.turn_error: Optional[Dict[str, str]] = None  # {session_id, reason}

    # --- Player joining (during setup) ---
    def add_participant(self, player: Dict[str, Any]) -> bool:
        if self.status != "setup":
            return False
        for p in self.players:
            if p["session_id"] == player["session_id"]:
                p["is_active"] = True
                return False  # already in
        self.players.append({
            "session_id": player["session_id"],
            "nickname": player["nickname"],
            "is_active": True
        })
        return True

    # --- Turn helpers ---
    def _remaining(self) -> List[str]:
        return [sid for sid in self.order if sid not in self.eliminated]

    def _current_player_id(self) -> Optional[str]:
        if not self.order:
            return None
        return self.order[self.current_index] if 0 <= self.current_index < len(self.order) else None

    def _advance_turn(self):
        """Move to the next non-eliminated player and reset the timer."""
        remaining = self._remaining()
        if len(remaining) <= 1:
            self.status = "finished"
            self.winner = remaining[0] if remaining else "draw"
            self.end_time = 0.0
            return

        n = len(self.order)
        idx = self.current_index
        for _ in range(n):
            idx = (idx + 1) % n
            if self.order[idx] not in self.eliminated:
                self.current_index = idx
                break

        self.turn_count += 1
        self.turn_error = None
        self.end_time = time.time() + self.turn_seconds

    def _eliminate_current(self, reason: str = "Zeit abgelaufen"):
        sid = self._current_player_id()
        if sid is None:
            return
        self.eliminated.add(sid)
        self.turn_error = {"session_id": sid, "reason": reason}
        self._advance_turn()

    def start_game(self):
        active = [p["session_id"] for p in self.players if p["is_active"]]
        if len(active) < 2:
            return False
        self.order = active
        self.current_index = 0
        self.eliminated = set()
        self.used_words = set()
        self.chain = []
        self.required_letter = random.choice(_START_LETTERS)
        self.turn_count = 1
        self.turn_error = None
        self.end_time = time.time() + self.turn_seconds
        self.status = "playing"
        self.winner = None
        return True

    # --- Action handling ---
    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        action_type = action.get("type")

        if action_type == "configure":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            secs = action.get("turn_seconds")
            if isinstance(secs, (int, float)):
                self.turn_seconds = max(5, min(60, int(secs)))
            ml = action.get("min_length")
            if isinstance(ml, (int, float)):
                self.min_length = max(1, min(10, int(ml)))
            return True

        elif action_type == "start_game":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            return self.start_game()

        elif action_type == "submit_word":
            if self.status != "playing" or session_id != self._current_player_id():
                return False

            word = str(action.get("word", "")).strip()
            error = self._validate_word(word)
            if error:
                # Invalid: let the player retry until time runs out
                self.turn_error = {"session_id": session_id, "reason": error}
                return True

            normalized = word.lower()
            self.used_words.add(normalized)
            self.chain.append({
                "word": word,
                "session_id": session_id,
                "nickname": self._name(session_id)
            })
            # Next required letter = last alphabetic char of the word
            self.required_letter = self._last_letter(word).upper()
            self._advance_turn()
            return True

        elif action_type == "timeout":
            if self.status != "playing":
                return False
            # Anti double-fire: only act on the turn the client actually saw
            seen_turn = action.get("turn_count")
            if seen_turn is not None and seen_turn != self.turn_count:
                return False
            if time.time() < self.end_time - 0.5:
                return False
            self._eliminate_current("Zeit abgelaufen")
            return True

        elif action_type == "give_up":
            if self.status != "playing" or session_id != self._current_player_id():
                return False
            self._eliminate_current("Aufgegeben")
            return True

        elif action_type == "restart":
            if self.status != "finished" or session_id != self.creator_id:
                return False
            self.status = "setup"
            self.chain = []
            self.eliminated = set()
            self.used_words = set()
            self.winner = None
            return True

        return False

    def on_dispute_upheld(self, target_id: str, dispute: Dict[str, Any]) -> None:
        # Group agreed the word was invalid -> that player is out.
        if self.status != "playing" or target_id in self.eliminated:
            return
        was_current = (target_id == self._current_player_id())
        self.eliminated.add(target_id)
        if was_current:
            self._advance_turn()
        else:
            remaining = self._remaining()
            if len(remaining) <= 1:
                self.status = "finished"
                self.winner = remaining[0] if remaining else "draw"

    # --- Validation helpers ---
    def _validate_word(self, word: str) -> Optional[str]:
        if not word:
            return "Kein Wort eingegeben"
        if len(word) < self.min_length:
            return f"Mindestens {self.min_length} Buchstaben"
        if not _WORD_RE.match(word):
            return "Nur Buchstaben erlaubt"
        if not word[0].lower() == self.required_letter.lower():
            return f"Muss mit '{self.required_letter}' beginnen"
        if word.lower() in self.used_words:
            return "Wort wurde schon genannt"
        return None

    @staticmethod
    def _last_letter(word: str) -> str:
        for ch in reversed(word):
            if ch.isalpha():
                return ch
        return word[-1] if word else ""

    def _name(self, session_id: str) -> str:
        for p in self.players:
            if p["session_id"] == session_id:
                return p["nickname"]
        return "Unbekannt"

    # --- State ---
    def get_state(self) -> Dict[str, Any]:
        time_left = 0
        if self.status == "playing":
            time_left = max(0, int(round(self.end_time - time.time())))

        current_id = self._current_player_id() if self.status == "playing" else None

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",

            "turn_seconds": self.turn_seconds,
            "min_length": self.min_length,

            "required_letter": self.required_letter,
            "time_left": time_left,
            "turn_count": self.turn_count,
            "current_turn": current_id,
            "current_turn_name": self._name(current_id) if current_id else None,

            "chain": self.chain,
            "used_count": len(self.used_words),
            "remaining_count": len(self._remaining()) if self.order else len([p for p in self.players if p["is_active"]]),
            "turn_error": self.turn_error,

            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "eliminated": p["session_id"] in self.eliminated,
                    "role": "creator" if p["session_id"] == self.creator_id else "player"
                }
                for p in self.players
            ],

            "winner": self.winner,
            "winner_name": self._name(self.winner) if self.winner and self.winner != "draw" else ("Unentschieden" if self.winner == "draw" else None)
        }
