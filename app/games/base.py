import uuid
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional

class BaseGame(ABC):
    def __init__(self, game_session_id: str, game_type: str, players: List[Dict[str, Any]]):
        self.game_session_id: str = game_session_id
        self.game_type: str = game_type
        # players: List of {"session_id": str, "nickname": str, "is_active": bool}
        self.players: List[Dict[str, Any]] = [
            {"session_id": p["session_id"], "nickname": p["nickname"], "is_active": True}
            for p in players
        ]
        self.status: str = "playing"  # playing, finished
        self.winner: Optional[str] = None  # session_id or "draw" or None

        # Shared "dispute" (Anfechten) poll — available in every game so any
        # player can challenge another player's move/answer and let the rest of
        # the table vote on whether it is valid. Only one open dispute at a time.
        self.dispute: Optional[Dict[str, Any]] = None

        # Tracks participants who explicitly clicked "Match verlassen".
        self.left_players: List[Dict[str, str]] = []

    def deactivate_player(self, session_id: str) -> None:
        for p in self.players:
            if p["session_id"] == session_id:
                p["is_active"] = False
                break

    def reactivate_player(self, session_id: str) -> None:
        for p in self.players:
            if p["session_id"] == session_id:
                p["is_active"] = True
                break

    def mark_left(self, session_id: str) -> bool:
        """Record that a participant explicitly left. Returns True if they were a participant."""
        for p in self.players:
            if p["session_id"] == session_id:
                if not any(lp["session_id"] == session_id for lp in self.left_players):
                    self.left_players.append({"session_id": session_id, "nickname": p["nickname"]})
                return True
        return False

    def all_participants_left(self) -> bool:
        if not self.players:
            return False
        left_ids = {lp["session_id"] for lp in self.left_players}
        return all(p["session_id"] in left_ids for p in self.players)

    def add_participant(self, player: Dict[str, Any]) -> bool:
        """Allow a group member to join an in-progress lobby. Returns True if added.

        Default games are fixed-roster (challenge-based) and reject new joiners.
        Group games like Wortkette override this to accept players during setup.
        """
        return False

    # ----------------------------------------------------------------- #
    #  Dispute / fairness voting (shared by all games)                   #
    # ----------------------------------------------------------------- #
    def _player_name(self, session_id: str) -> str:
        for p in self.players:
            if p["session_id"] == session_id:
                return p["nickname"]
        return "Unbekannt"

    def _is_participant(self, session_id: str) -> bool:
        return any(p["session_id"] == session_id for p in self.players)

    def _dispute_voter_ids(self) -> List[str]:
        """Everyone active in the match may vote, except the accused player."""
        if not self.dispute:
            return []
        target = self.dispute["target_id"]
        return [p["session_id"] for p in self.players if p["is_active"] and p["session_id"] != target]

    def handle_dispute(self, session_id: str, action: Dict[str, Any]) -> bool:
        t = action.get("type")
        if t == "dispute_open":
            return self.open_dispute(session_id, action.get("target_id"),
                                     str(action.get("subject", "")), str(action.get("reason", "")))
        if t == "dispute_vote":
            return self.vote_dispute(session_id, action.get("value"))
        if t == "dispute_resolve":
            return self.force_resolve_dispute(session_id)
        if t == "dispute_dismiss":
            return self.dismiss_dispute(session_id)
        return False

    def open_dispute(self, opener_id: str, target_id: Optional[str], subject: str, reason: str) -> bool:
        if self.dispute and self.dispute["status"] == "open":
            return False
        if not self._is_participant(opener_id) or not target_id or not self._is_participant(target_id):
            return False
        if target_id == opener_id:
            return False
        self.dispute = {
            "id": str(uuid.uuid4())[:8],
            "opener_id": opener_id,
            "opener_name": self._player_name(opener_id),
            "target_id": target_id,
            "target_name": self._player_name(target_id),
            "subject": subject[:120],
            "reason": reason[:120],
            "votes": {},          # voter_id -> bool (True = "ist gültig", False = "ist ungültig")
            "status": "open",
            "upheld": None,
        }
        return True

    def vote_dispute(self, voter_id: str, value: Any) -> bool:
        if not self.dispute or self.dispute["status"] != "open":
            return False
        if voter_id not in self._dispute_voter_ids():
            return False
        self.dispute["votes"][voter_id] = bool(value)
        # Auto-finalize once everyone eligible has voted
        eligible = self._dispute_voter_ids()
        if eligible and all(v in self.dispute["votes"] for v in eligible):
            self._finalize_dispute()
        return True

    def force_resolve_dispute(self, requester_id: str) -> bool:
        if not self.dispute or self.dispute["status"] != "open":
            return False
        creator_id = getattr(self, "creator_id", None)
        if requester_id != creator_id and requester_id != self.dispute["opener_id"]:
            return False
        self._finalize_dispute()
        return True

    def dismiss_dispute(self, requester_id: str) -> bool:
        if not self.dispute:
            return False
        creator_id = getattr(self, "creator_id", None)
        if requester_id != creator_id and requester_id != self.dispute["opener_id"]:
            return False
        self.dispute = None
        return True

    def _finalize_dispute(self) -> None:
        votes = list(self.dispute["votes"].values())
        invalid = sum(1 for v in votes if v is False)
        valid = sum(1 for v in votes if v is True)
        # "upheld" = the table agrees the move/answer was INVALID
        upheld = invalid > valid
        self.dispute["status"] = "resolved"
        self.dispute["upheld"] = upheld
        if upheld:
            self.on_dispute_upheld(self.dispute["target_id"], self.dispute)

    def on_dispute_upheld(self, target_id: str, dispute: Dict[str, Any]) -> None:
        """Hook: a dispute against `target_id` was upheld by the group.

        Default is social-only (verdict is just shown). Games override this to
        apply a consequence (e.g. eliminate the player who cheated)."""
        pass

    def get_dispute_state(self) -> Optional[Dict[str, Any]]:
        if not self.dispute:
            return None
        votes = self.dispute["votes"]
        return {
            "id": self.dispute["id"],
            "opener_id": self.dispute["opener_id"],
            "opener_name": self.dispute["opener_name"],
            "target_id": self.dispute["target_id"],
            "target_name": self.dispute["target_name"],
            "subject": self.dispute["subject"],
            "reason": self.dispute["reason"],
            "status": self.dispute["status"],
            "upheld": self.dispute["upheld"],
            "valid_count": sum(1 for v in votes.values() if v is True),
            "invalid_count": sum(1 for v in votes.values() if v is False),
            "voter_ids": list(votes.keys()),
            "eligible_count": len(self._dispute_voter_ids()),
        }

    @abstractmethod
    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        """Processes an in-game action from a player. Returns True if state changed."""
        pass

    @abstractmethod
    def get_state(self) -> Dict[str, Any]:
        """Returns JSON-serializable state of the game."""
        pass

