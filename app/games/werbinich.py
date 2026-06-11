import uuid
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame


class WerBinIchGame(BaseGame):
    """
    Wer bin ich?

    Ablauf:
      1. Vorschläge: Jede:r macht für jede:n anderen einen Vorschlag, wer er/sie
         sein soll.
      2. Abstimmen: Die Gruppe stimmt pro Person ab, welcher Vorschlag wirklich
         genommen wird. Der meistgewählte wird die geheime Identität.
      3. Spielen: Reihum stellt man Ja/Nein-Fragen über die eigene (verdeckte)
         Identität, die anderen antworten mit Ja/Nein, bis man errät, wer man ist.
    """

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "werbinich", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"  # setup, suggest, vote, playing, finished

        # target_id -> list of {"id", "by_id", "by_name", "text"}
        self.suggestions: Dict[str, List[Dict[str, Any]]] = {}
        # target_id -> {voter_id: suggestion_id}
        self.votes: Dict[str, Dict[str, str]] = {}
        # target_id -> identity text (assigned)
        self.identities: Dict[str, str] = {}

        # play state
        self.order: List[str] = []
        self.current_index: int = 0
        self.solved: set = set()
        self.current_question: Optional[str] = None
        self.answers: Dict[str, str] = {}   # responder_id -> "ja"|"nein"|"vielleicht"

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

    def _current_player_id(self) -> Optional[str]:
        if not self.order:
            return None
        return self.order[self.current_index] if 0 <= self.current_index < len(self.order) else None

    def _step_turn(self):
        unsolved = [sid for sid in self.order if sid not in self.solved]
        if not unsolved:
            self.status = "finished"
            return
        n = len(self.order)
        idx = self.current_index
        for _ in range(n):
            idx = (idx + 1) % n
            if self.order[idx] not in self.solved:
                self.current_index = idx
                break
        self.current_question = None
        self.answers = {}

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "start_suggest":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            if len(self._active_ids()) < 3:
                return False
            self.suggestions = {aid: [] for aid in self._active_ids()}
            self.votes = {}
            self.status = "suggest"
            return True

        elif t == "submit_suggestion":
            if self.status != "suggest":
                return False
            target_id = action.get("target_id")
            text = str(action.get("text", "")).strip()
            if not text or target_id == session_id or target_id not in self.suggestions:
                return False
            # one suggestion per (suggester -> target)
            existing = next((s for s in self.suggestions[target_id] if s["by_id"] == session_id), None)
            if existing:
                existing["text"] = text[:80]
            else:
                self.suggestions[target_id].append({
                    "id": str(uuid.uuid4())[:8],
                    "by_id": session_id,
                    "by_name": self._player_name(session_id),
                    "text": text[:80],
                })
            return True

        elif t == "start_vote":
            if self.status != "suggest" or session_id != self.creator_id:
                return False
            # need at least one suggestion per target
            if any(len(self.suggestions.get(aid, [])) == 0 for aid in self._active_ids()):
                return False
            self.votes = {aid: {} for aid in self._active_ids()}
            self.status = "vote"
            return True

        elif t == "submit_vote":
            if self.status != "vote":
                return False
            target_id = action.get("target_id")
            suggestion_id = action.get("suggestion_id")
            if target_id not in self.votes or target_id == session_id:
                return False  # you don't vote on your own identity
            if not any(s["id"] == suggestion_id for s in self.suggestions.get(target_id, [])):
                return False
            self.votes[target_id][session_id] = suggestion_id
            return True

        elif t == "start_play":
            if self.status != "vote" or session_id != self.creator_id:
                return False
            self._assign_identities()
            self.order = self._active_ids()
            self.current_index = 0
            self.solved = set()
            self.current_question = None
            self.answers = {}
            self.status = "playing"
            return True

        elif t == "ask":
            if self.status != "playing" or session_id != self._current_player_id():
                return False
            q = str(action.get("question", "")).strip()
            if not q:
                return False
            self.current_question = q[:160]
            self.answers = {}
            return True

        elif t == "answer":
            if self.status != "playing" or not self.current_question:
                return False
            if session_id == self._current_player_id():
                return False  # the asker can't answer their own question
            val = str(action.get("value", "")).lower()
            if val not in ("ja", "nein", "vielleicht"):
                return False
            self.answers[session_id] = val
            return True

        elif t == "guess":
            if self.status != "playing" or session_id != self._current_player_id():
                return False
            guess = str(action.get("text", "")).strip().lower()
            identity = self.identities.get(session_id, "").strip().lower()
            if guess and identity and (guess == identity or (len(guess) >= 3 and guess in identity)):
                self.solved.add(session_id)
                self._step_turn()
                return True
            # wrong guess just passes the turn
            self._step_turn()
            return True

        elif t == "pass":
            if self.status != "playing" or session_id != self._current_player_id():
                return False
            self._step_turn()
            return True

        elif t == "end":
            if self.status != "playing" or session_id != self.creator_id:
                return False
            self.status = "finished"
            return True

        elif t == "restart":
            if self.status != "finished" or session_id != self.creator_id:
                return False
            self.suggestions = {}
            self.votes = {}
            self.identities = {}
            self.order = []
            self.solved = set()
            self.status = "setup"
            return True

        return False

    def _assign_identities(self):
        self.identities = {}
        for target_id, sugg_list in self.suggestions.items():
            if not sugg_list:
                continue
            tally: Dict[str, int] = {}
            for sid in self.votes.get(target_id, {}).values():
                tally[sid] = tally.get(sid, 0) + 1
            if tally:
                winner_id = max(tally, key=lambda k: tally[k])
            else:
                winner_id = sugg_list[0]["id"]
            chosen = next((s for s in sugg_list if s["id"] == winner_id), sugg_list[0])
            self.identities[target_id] = chosen["text"]

    def get_state(self) -> Dict[str, Any]:
        names = {p["session_id"]: p["nickname"] for p in self.players}
        current_id = self._current_player_id() if self.status == "playing" else None

        # Identities visible to everyone EXCEPT the owner (added per-recipient on client side
        # is not possible here; we expose all and let the client hide its own).
        identity_board = None
        if self.status in ("playing", "finished"):
            identity_board = [
                {"session_id": sid, "nickname": names.get(sid, "?"), "identity": text}
                for sid, text in self.identities.items()
            ]

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",

            "suggestions": self.suggestions if self.status in ("suggest", "vote") else {},
            "votes": self.votes if self.status == "vote" else {},

            "identity_board": identity_board,
            "current_turn": current_id,
            "current_turn_name": names.get(current_id) if current_id else None,
            "current_question": self.current_question,
            "answers": {names.get(sid, "?"): v for sid, v in self.answers.items()},
            "solved_ids": list(self.solved),

            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "solved": p["session_id"] in self.solved,
                    "role": "creator" if p["session_id"] == self.creator_id else "player",
                }
                for p in self.players
            ],
        }
