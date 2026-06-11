from typing import Dict, List, Any, Optional
from app.games.base import BaseGame


class ZweiWahrheitenGame(BaseGame):
    """
    2 Wahrheiten, 1 Lüge.

    Jeder gibt 3 Aussagen ein und markiert, welche davon gelogen ist. Danach
    versuchen alle anderen, bei jedem Mitspieler die Lüge zu erraten. Zum Schluss
    wird aufgelöst und gepunktet:
      - +1 Punkt pro korrekt erratener Lüge.
      - +1 Punkt für die Autor:in pro Person, die sie täuschen konnte.
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "zweiwahrheiten", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"  # setup, collect, guessing, finished

        # author_id -> {"statements": [s,s,s], "lie_index": int}
        self.entries: Dict[str, Dict[str, Any]] = {}
        # guesser_id -> {author_id: guessed_index}
        self.guesses: Dict[str, Dict[str, int]] = {}
        self.scores: Dict[str, int] = {}

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

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "start_collect":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            if len(self._active_ids()) < 2:
                return False
            self.entries = {}
            self.guesses = {}
            self.status = "collect"
            return True

        elif t == "submit_entry":
            if self.status != "collect":
                return False
            statements = action.get("statements")
            lie_index = action.get("lie_index")
            if (not isinstance(statements, list) or len(statements) != 3
                    or not all(str(s).strip() for s in statements)):
                return False
            if not isinstance(lie_index, int) or not (0 <= lie_index <= 2):
                return False
            self.entries[session_id] = {
                "statements": [str(s).strip()[:140] for s in statements],
                "lie_index": lie_index,
            }
            # Auto-advance once every active player submitted
            if all(aid in self.entries for aid in self._active_ids()):
                self.status = "guessing"
            return True

        elif t == "force_guessing":
            if self.status != "collect" or session_id != self.creator_id:
                return False
            if not self.entries:
                return False
            self.status = "guessing"
            return True

        elif t == "submit_guess":
            if self.status != "guessing":
                return False
            author_id = action.get("author_id")
            idx = action.get("index")
            if author_id not in self.entries or author_id == session_id:
                return False
            if not isinstance(idx, int) or not (0 <= idx <= 2):
                return False
            self.guesses.setdefault(session_id, {})[author_id] = idx
            return True

        elif t == "reveal":
            if self.status != "guessing" or session_id != self.creator_id:
                return False
            self._score()
            self.status = "finished"
            return True

        elif t == "restart":
            if self.status != "finished" or session_id != self.creator_id:
                return False
            self.entries = {}
            self.guesses = {}
            self.scores = {}
            self.status = "setup"
            return True

        return False

    def _score(self):
        self.scores = {p["session_id"]: 0 for p in self.players}
        for author_id, entry in self.entries.items():
            lie = entry["lie_index"]
            for guesser_id, gmap in self.guesses.items():
                if author_id == guesser_id or author_id not in gmap:
                    continue
                if gmap[author_id] == lie:
                    self.scores[guesser_id] = self.scores.get(guesser_id, 0) + 1   # correct
                else:
                    self.scores[author_id] = self.scores.get(author_id, 0) + 1     # fooled them

    def get_state(self) -> Dict[str, Any]:
        names = {p["session_id"]: p["nickname"] for p in self.players}
        submitted_ids = list(self.entries.keys())

        # During guessing/finished, expose statements (but hide lie_index until finished)
        public_entries = {}
        if self.status in ("guessing", "finished"):
            for aid, e in self.entries.items():
                public_entries[aid] = {
                    "nickname": names.get(aid, "?"),
                    "statements": e["statements"],
                    "lie_index": e["lie_index"] if self.status == "finished" else None,
                }

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",
            "entries": public_entries,
            "submitted_ids": submitted_ids,
            "guesses": self.guesses,
            "scores": {names.get(sid, "?"): v for sid, v in self.scores.items()} if self.scores else {},
            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "submitted": p["session_id"] in self.entries,
                    "role": "creator" if p["session_id"] == self.creator_id else "player",
                }
                for p in self.players
            ],
        }
