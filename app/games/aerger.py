import random
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame

TRACK_LEN = 40          # main loop fields (0..39)
GOAL_LEN = 4            # goal lane fields per player
TOKENS = 4             # tokens per player

# token "steps":  -1 = yard (Haus), 0..39 = on track, 40..43 = goal lane


class AergerGame(BaseGame):
    """
    Mensch ärgere dich nicht.

    2-4 Spieler, je 4 Figuren. Mit einer 6 kommt man aus dem Haus und darf
    nochmal würfeln. Figuren laufen über das 40er-Rundfeld in die eigene
    Zielgerade. Landet man auf einer gegnerischen Figur, fliegt diese zurück
    ins Haus. Wer zuerst alle 4 Figuren im Ziel hat, gewinnt.

    Einstellungen:
      - exit_only_six: True = Rauskommen nur mit 6 (Standard). False = auch mit 1.
      - reroll_on_six: Extra-Wurf bei 6 (Standard an).
    """

    COLORS = ["#E53935", "#1E88E5", "#43A047", "#FDD835"]  # red, blue, green, yellow

    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "aerger", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"

        # Config
        self.exit_only_six: bool = True
        self.reroll_on_six: bool = True

        # Round state
        self.order: List[str] = []
        self.current_index: int = 0
        self.offsets: Dict[str, int] = {}        # session_id -> start field on track
        self.tokens: Dict[str, List[int]] = {}   # session_id -> [4 steps]
        self.color_index: Dict[str, int] = {}

        self.die: Optional[int] = None
        self.phase: str = "roll"                 # roll | move
        self.legal: List[int] = []               # token indices the current player may move
        self.consecutive_sixes: int = 0
        self.message: str = ""

    def add_participant(self, player: Dict[str, Any]) -> bool:
        if self.status != "setup":
            return False
        if len([p for p in self.players if p["is_active"]]) >= 4:
            return False
        for p in self.players:
            if p["session_id"] == player["session_id"]:
                p["is_active"] = True
                return False
        self.players.append({"session_id": player["session_id"], "nickname": player["nickname"], "is_active": True})
        return True

    def _active_ids(self) -> List[str]:
        return [p["session_id"] for p in self.players if p["is_active"]][:4]

    def _current(self) -> Optional[str]:
        return self.order[self.current_index] if self.order and 0 <= self.current_index < len(self.order) else None

    def start_game(self) -> bool:
        active = self._active_ids()
        if not (2 <= len(active) <= 4):
            return False
        n = len(active)
        step = 4 // n if n in (1, 2, 4) else 1  # spread starts around the board
        self.order = active
        self.offsets = {}
        self.color_index = {}
        self.tokens = {}
        for i, sid in enumerate(active):
            self.offsets[sid] = (i * step) * 10 % TRACK_LEN
            self.color_index[sid] = (i * step) % 4
            self.tokens[sid] = [-1, -1, -1, -1]
        self.current_index = 0
        self.die = None
        self.phase = "roll"
        self.legal = []
        self.consecutive_sixes = 0
        self.message = ""
        self.winner = None
        self.status = "playing"
        return True

    def _abs_field(self, sid: str, steps: int) -> Optional[int]:
        """Absolute track field for a token, or None if in yard/goal."""
        if 0 <= steps <= TRACK_LEN - 1:
            return (self.offsets[sid] + steps) % TRACK_LEN
        return None

    def _own_occupied_abs(self, sid: str, exclude: int) -> set:
        occ = set()
        for i, st in enumerate(self.tokens[sid]):
            if i == exclude:
                continue
            f = self._abs_field(sid, st)
            if f is not None:
                occ.add(f)
        return occ

    def _own_goal_slots(self, sid: str, exclude: int) -> set:
        return {st for i, st in enumerate(self.tokens[sid]) if i != exclude and st >= TRACK_LEN}

    def _legal_moves(self, sid: str, die: int) -> List[int]:
        legal = []
        own_abs = None
        for i, steps in enumerate(self.tokens[sid]):
            if steps == -1:
                # leaving the yard
                can_exit = (die == 6) or (not self.exit_only_six and die == 1)
                if not can_exit:
                    continue
                start_abs = self.offsets[sid]
                if start_abs in self._own_occupied_abs(sid, i):
                    continue
                legal.append(i)
                continue
            new = steps + die
            if new > TRACK_LEN + GOAL_LEN - 1:   # would overshoot the goal
                continue
            if new <= TRACK_LEN - 1:
                dest = (self.offsets[sid] + new) % TRACK_LEN
                if dest in self._own_occupied_abs(sid, i):
                    continue
            else:
                if new in self._own_goal_slots(sid, i):
                    continue
            legal.append(i)
        return legal

    def _capture_at(self, mover_id: str, abs_field: int):
        for sid in self.order:
            if sid == mover_id:
                continue
            for i, st in enumerate(self.tokens[sid]):
                if self._abs_field(sid, st) == abs_field:
                    self.tokens[sid][i] = -1
                    self.message = f"{self._player_name(mover_id)} wirft {self._player_name(sid)} raus!"

    def _has_won(self, sid: str) -> bool:
        return all(st >= TRACK_LEN for st in self.tokens[sid])

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")

        if t == "configure":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            if isinstance(action.get("exit_only_six"), bool):
                self.exit_only_six = action["exit_only_six"]
            if isinstance(action.get("reroll_on_six"), bool):
                self.reroll_on_six = action["reroll_on_six"]
            return True

        if t == "start_game":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            return self.start_game()

        if self.status == "finished":
            if t == "restart" and session_id == self.creator_id:
                self.status = "setup"
                self.winner = None
                return True
            return False

        if self.status != "playing" or session_id != self._current():
            return False

        if t == "roll" and self.phase == "roll":
            self.die = random.randint(1, 6)
            self.message = ""
            if self.die == 6:
                self.consecutive_sixes += 1
            else:
                self.consecutive_sixes = 0

            # Three sixes in a row -> turn forfeited (anti-stalling)
            if self.die == 6 and self.consecutive_sixes >= 3:
                self.message = "Dreimal die 6 – Zug verfällt!"
                self._end_turn(force=True)
                return True

            self.legal = self._legal_moves(session_id, self.die)
            if not self.legal:
                self.message = f"Keine gültigen Züge mit einer {self.die}."
                self._end_turn()
                return True
            self.phase = "move"
            return True

        if t == "move" and self.phase == "move":
            ti = action.get("token")
            if ti not in self.legal:
                return False
            steps = self.tokens[session_id][ti]
            new = (0 if steps == -1 else steps + self.die)
            self.tokens[session_id][ti] = new
            abs_field = self._abs_field(session_id, new)
            if abs_field is not None:
                self._capture_at(session_id, abs_field)

            if self._has_won(session_id):
                self.status = "finished"
                self.winner = session_id
                self.phase = "done"
                self.legal = []
                return True

            # Roll a 6 -> same player rolls again
            extra = (self.die == 6 and self.reroll_on_six)
            self._end_turn(extra=extra)
            return True

        return False

    def _end_turn(self, extra: bool = False, force: bool = False):
        self.die = None
        self.legal = []
        self.phase = "roll"
        if extra and not force:
            return  # same player rolls again
        self.consecutive_sixes = 0
        n = len(self.order)
        self.current_index = (self.current_index + 1) % n

    def get_state(self) -> Dict[str, Any]:
        names = {p["session_id"]: p["nickname"] for p in self.players}
        current_id = self._current() if self.status == "playing" else None

        token_view = {}
        for sid in self.order:
            view = []
            for st in self.tokens[sid]:
                if st == -1:
                    view.append({"state": "yard", "abs": None, "goal": None})
                elif st >= TRACK_LEN:
                    view.append({"state": "goal", "abs": None, "goal": st - TRACK_LEN})
                else:
                    view.append({"state": "track", "abs": self._abs_field(sid, st), "goal": None})
            token_view[sid] = view

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "joinable": self.status == "setup",

            "exit_only_six": self.exit_only_six,
            "reroll_on_six": self.reroll_on_six,

            "track_len": TRACK_LEN,
            "goal_len": GOAL_LEN,
            "tokens": token_view,
            "offsets": self.offsets,
            "colors": {sid: self.COLORS[self.color_index.get(sid, i)] for i, sid in enumerate(self.order)},

            "die": self.die,
            "phase": self.phase,
            "legal": self.legal,
            "message": self.message,

            "current_turn": current_id,
            "current_turn_name": names.get(current_id) if current_id else None,

            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "color": self.COLORS[self.color_index.get(p["session_id"], 0)] if p["session_id"] in self.color_index else None,
                    "role": "creator" if p["session_id"] == self.creator_id else "player",
                }
                for p in self.players
            ],
            "winner": self.winner,
            "winner_name": names.get(self.winner) if self.winner else None,
        }
