import json
import uuid
from typing import Dict, Set, Optional, Any, List
from fastapi import WebSocket
from app.games.catalog import GAMES_CATALOG, get_game_class
from app.games.base import BaseGame

class GroupRoom:
    def __init__(self, group_id: str):
        self.group_id = group_id
        # List of {"session_id": str, "nickname": str, "is_active": bool}
        self.players: List[Dict[str, Any]] = []
        # List of pending invitations: {"challenge_id": str, "challenger_id": str, "challenger_name": str, "target_id": str, "target_name": str, "game_type": str, "status": str}
        self.challenges: List[Dict[str, Any]] = []
        # Map of game_session_id -> BaseGame instance
        self.active_games: Dict[str, BaseGame] = {}

    def add_player(self, session_id: str, nickname: str) -> bool:
        for p in self.players:
            if p["session_id"] == session_id:
                p["nickname"] = nickname
                p["is_active"] = True
                # Reactivate player in all running matches they participate in
                for game in self.active_games.values():
                    game.reactivate_player(session_id)
                return True
        
        self.players.append({
            "session_id": session_id,
            "nickname": nickname,
            "is_active": True
        })
        return True

    def deactivate_player(self, session_id: str):
        for p in self.players:
            if p["session_id"] == session_id:
                p["is_active"] = False
                # Deactivate in active games
                for game in self.active_games.values():
                    game.deactivate_player(session_id)
                break

    def get_player(self, session_id: str) -> Optional[Dict[str, Any]]:
        for p in self.players:
            if p["session_id"] == session_id:
                return p
        return None

    def create_challenge(self, challenger_id: str, target_id: str, game_type: str) -> Optional[Dict[str, Any]]:
        challenger = self.get_player(challenger_id)
        target = self.get_player(target_id)
        if not challenger or not target:
            return None
        
        # Avoid duplicating same challenge
        for ch in self.challenges:
            if ch["challenger_id"] == challenger_id and ch["target_id"] == target_id and ch["game_type"] == game_type and ch["status"] == "pending":
                return ch
                
        challenge = {
            "challenge_id": str(uuid.uuid4())[:8],
            "challenger_id": challenger_id,
            "challenger_name": challenger["nickname"],
            "target_id": target_id,
            "target_name": target["nickname"],
            "game_type": game_type,
            "status": "pending"
        }
        self.challenges.append(challenge)
        return challenge

    def respond_to_challenge(self, challenge_id: str, target_id: str, response: str) -> Optional[Dict[str, Any]]:
        for ch in self.challenges:
            if ch["challenge_id"] == challenge_id and ch["target_id"] == target_id:
                if response in ["accept", "decline"]:
                    ch["status"] = response
                    if response == "accept":
                        # Start game
                        game_class = get_game_class(ch["game_type"])
                        if game_class:
                            game_session_id = f"game_{ch['challenge_id']}"
                            p1 = self.get_player(ch["challenger_id"])
                            p2 = self.get_player(ch["target_id"])
                            if p1 and p2:
                                # Start the game with these two players
                                game_inst = game_class(game_session_id, [p1, p2])
                                self.active_games[game_session_id] = game_inst
                                ch["game_session_id"] = game_session_id
                    return ch
        return None

    def clean_up_challenges(self):
        # We can remove challenges that are accepted or declined to prevent clutter
        self.challenges = [ch for ch in self.challenges if ch["status"] == "pending"]

    def get_state(self) -> Dict[str, Any]:
        return {
            "group_id": self.group_id,
            "players": self.players,
            "challenges": self.challenges,
            "active_games": {
                gid: {**game.get_state(), "dispute": game.get_dispute_state()}
                for gid, game in self.active_games.items()
            },
            # Only expose games that are actually implemented/playable
            "games_catalog": [g for g in GAMES_CATALOG if g.get("is_playable")]
        }


class GroupManager:
    def __init__(self):
        # Maps group_id -> GroupRoom
        self.rooms: Dict[str, GroupRoom] = {}
        # Maps session_id -> Set of active WebSockets
        self.user_websockets: Dict[str, Set[WebSocket]] = {}
        # Maps session_id -> group_id
        self.user_groups: Dict[str, str] = {}

    def get_or_create_room(self, group_id: str) -> GroupRoom:
        if group_id not in self.rooms:
            self.rooms[group_id] = GroupRoom(group_id)
        return self.rooms[group_id]

    def get_room(self, group_id: str) -> Optional[GroupRoom]:
        return self.rooms.get(group_id)

    async def connect(self, websocket: WebSocket, session_id: str, group_id: str, nickname: str):
        await websocket.accept()
        
        if session_id not in self.user_websockets:
            self.user_websockets[session_id] = set()
        self.user_websockets[session_id].add(websocket)
        
        self.user_groups[session_id] = group_id

        room = self.get_or_create_room(group_id)
        room.add_player(session_id, nickname)
        
        await self.broadcast_group_state(group_id)

    async def disconnect(self, websocket: WebSocket, session_id: str, group_id: str):
        if session_id in self.user_websockets:
            self.user_websockets[session_id].discard(websocket)
            if not self.user_websockets[session_id]:
                del self.user_websockets[session_id]
                room = self.get_room(group_id)
                if room:
                    room.deactivate_player(session_id)
                    # Clean up empty room after inactivity (can be done or kept, let's keep it)
        
        await self.broadcast_group_state(group_id)

    async def handle_client_message(self, session_id: str, group_id: str, message_data: Dict[str, Any]) -> bool:
        room = self.get_room(group_id)
        if not room:
            return False

        msg_type = message_data.get("type")
        changed = False

        if msg_type == "challenge_send":
            target_id = message_data.get("target_id")
            game_type = message_data.get("game_type")
            if target_id and game_type:
                room.create_challenge(session_id, target_id, game_type)
                changed = True

        elif msg_type == "challenge_respond":
            challenge_id = message_data.get("challenge_id")
            response = message_data.get("response")
            if challenge_id and response:
                room.respond_to_challenge(challenge_id, session_id, response)
                changed = True
                
        elif msg_type == "challenge_dismiss":
            challenge_id = message_data.get("challenge_id")
            room.challenges = [ch for ch in room.challenges if ch["challenge_id"] != challenge_id]
            changed = True

        elif msg_type == "game_action":
            game_session_id = message_data.get("game_session_id")
            action = message_data.get("action")
            if game_session_id and action:
                game = room.active_games.get(game_session_id)
                if game:
                    # Dispute/fairness actions are shared by every game type
                    if str(action.get("type", "")).startswith("dispute_"):
                        changed = game.handle_dispute(session_id, action)
                    else:
                        changed = game.handle_action(session_id, action)

        elif msg_type == "game_join":
            game_session_id = message_data.get("game_session_id")
            game = room.active_games.get(game_session_id)
            if game:
                player = room.get_player(session_id)
                if player and game.add_participant(player):
                    changed = True

        elif msg_type == "game_close":
            game_session_id = message_data.get("game_session_id")
            if game_session_id in room.active_games:
                del room.active_games[game_session_id]
                # Also clean up related challenge
                room.challenges = [ch for ch in room.challenges if ch.get("game_session_id") != game_session_id]
                changed = True

        return changed

    async def broadcast_group_state(self, group_id: str):
        room = self.get_room(group_id)
        if not room:
            return

        state = room.get_state()
        message = json.dumps({
            "type": "state_update",
            "state": state
        })

        for player in room.players:
            p_id = player["session_id"]
            if p_id in self.user_websockets:
                for ws in self.user_websockets[p_id].copy():
                    try:
                        await ws.send_text(message)
                    except Exception:
                        self.user_websockets[p_id].discard(ws)
