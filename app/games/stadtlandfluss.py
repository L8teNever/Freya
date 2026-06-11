import random
import time
from typing import Dict, List, Any, Optional
from app.games.base import BaseGame

class StadtLandFlussGame(BaseGame):
    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "stadtlandfluss", players)
        self.creator_id: str = players[0]["session_id"]
        self.status: str = "setup"  # setup, playing, voting, finished
        
        # Configuration
        self.categories: List[str] = ["Stadt", "Land", "Fluss", "Name", "Tier"]
        self.duration: int = 60  # seconds
        self.letter: str = ""
        self.end_time: float = 0.0
        
        # In-round state
        self.answers: Dict[str, Dict[str, str]] = {}  # session_id -> {category: answer}
        self.votes: Dict[str, Dict[str, Dict[str, bool]]] = {}  # target_id -> {category: {voter_id: bool}}
        
        # Scores
        self.scores: Dict[str, int] = {p["session_id"]: 0 for p in self.players}
        self.round_scores: Dict[str, int] = {p["session_id"]: 0 for p in self.players}
        self.detailed_round_results: Dict[str, Dict[str, Any]] = {}  # session_id -> {category: {answer, points, valid}}
        
        self.active_letters: str = "ABCDEFGHIJKLMNOPRSTUVW"

    def start_round(self):
        self.letter = random.choice(self.active_letters)
        self.answers = {p["session_id"]: {cat: "" for cat in self.categories} for p in self.players}
        self.votes = {
            p["session_id"]: {cat: {} for cat in self.categories}
            for p in self.players
        }
        self.round_scores = {p["session_id"]: 0 for p in self.players}
        self.detailed_round_results = {}
        self.end_time = time.time() + self.duration
        self.status = "playing"

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        action_type = action.get("type")

        if action_type == "configure":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            
            cats = action.get("categories")
            if isinstance(cats, list) and all(isinstance(c, str) for c in cats):
                # Ensure we have valid, non-empty categories
                self.categories = [c.strip() for c in cats if c.strip()]
            
            dur = action.get("duration")
            if isinstance(dur, (int, float)):
                self.duration = max(10, min(300, int(dur)))
            return True

        elif action_type == "start_round":
            if self.status != "setup" or session_id != self.creator_id:
                return False
            self.start_round()
            return True

        elif action_type == "submit_answers":
            if self.status != "playing":
                return False
            
            user_answers = action.get("answers", {})
            self.answers[session_id] = {
                cat: str(user_answers.get(cat, "")).strip()
                for cat in self.categories
            }
            
            # Check if all players have submitted
            all_submitted = True
            for p in self.players:
                if p["is_active"] and p["session_id"] not in self.answers:
                    all_submitted = False
                    break
            
            if all_submitted:
                self.status = "voting"
            return True

        elif action_type == "stop_round":
            if self.status != "playing":
                return False
            
            # Save whatever answers this player sent
            user_answers = action.get("answers", {})
            self.answers[session_id] = {
                cat: str(user_answers.get(cat, "")).strip()
                for cat in self.categories
            }
            
            # Fill missing answers for other players with empty strings
            for p in self.players:
                if p["session_id"] not in self.answers:
                    self.answers[p["session_id"]] = {cat: "" for cat in self.categories}
            
            self.status = "voting"
            return True

        elif action_type == "cast_vote":
            if self.status != "voting":
                return False
            
            target_id = action.get("target_id")
            category = action.get("category")
            value = action.get("value")  # Expected: bool
            
            if target_id in self.votes and category in self.categories:
                self.votes[target_id][category][session_id] = bool(value)
                return True
            return False

        elif action_type == "finish_voting":
            if self.status != "voting" or session_id != self.creator_id:
                return False
            
            self.calculate_scores()
            self.status = "finished"
            return True

        elif action_type == "restart":
            if self.status != "finished":
                return False
            self.status = "setup"
            return True

        return False

    def calculate_scores(self):
        # 1. Determine validity of each answer
        valid_answers: Dict[str, Dict[str, bool]] = {}  # session_id -> {category: is_valid}
        
        for p in self.players:
            sid = p["session_id"]
            valid_answers[sid] = {}
            p_answers = self.answers.get(sid, {})
            
            for cat in self.categories:
                ans = p_answers.get(cat, "").strip()
                
                # Check basic empty rule
                if not ans:
                    valid_answers[sid][cat] = False
                    continue
                
                # Check correct starting letter
                if not ans.lower().startswith(self.letter.lower()):
                    valid_answers[sid][cat] = False
                    continue
                
                # Check votes
                cat_votes = self.votes.get(sid, {}).get(cat, {})
                no_votes = sum(1 for v in cat_votes.values() if v is False)
                yes_votes = sum(1 for v in cat_votes.values() if v is True)
                
                # Rejected if more other players voted False than True
                if no_votes > yes_votes:
                    valid_answers[sid][cat] = False
                else:
                    valid_answers[sid][cat] = True

        # Initialize round details dictionary
        self.detailed_round_results = {
            p["session_id"]: {cat: {"answer": "", "valid": False, "points": 0} for cat in self.categories}
            for p in self.players
        }

        # 2. Score points per category
        for cat in self.categories:
            # Gather valid answers for this category
            active_valid_answers: Dict[str, str] = {}  # session_id -> normalized_answer
            for p in self.players:
                sid = p["session_id"]
                if valid_answers[sid][cat]:
                    active_valid_answers[sid] = self.answers[sid][cat].strip().lower()

            total_valid_players = len(active_valid_answers)

            for p in self.players:
                sid = p["session_id"]
                ans_raw = self.answers.get(sid, {}).get(cat, "")
                is_val = valid_answers[sid][cat]
                
                points = 0
                if is_val:
                    norm_ans = active_valid_answers[sid]
                    # Check duplicates
                    duplicates = sum(1 for other_sid, other_ans in active_valid_answers.items() if other_ans == norm_ans)
                    
                    if total_valid_players == 1:
                        # Only player in this round with a valid answer in this category
                        points = 20
                    elif duplicates > 1:
                        # Shared exact same answer
                        points = 5
                    else:
                        # Unique valid answer
                        points = 10
                
                self.detailed_round_results[sid][cat] = {
                    "answer": ans_raw,
                    "valid": is_val,
                    "points": points
                }
                
                self.round_scores[sid] += points
                self.scores[sid] += points

    def get_state(self) -> Dict[str, Any]:
        time_left = 0
        if self.status == "playing":
            time_left = max(0, int(self.end_time - time.time()))

        player_names = {p["session_id"]: p["nickname"] for p in self.players}

        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "creator_id": self.creator_id,
            "categories": self.categories,
            "duration": self.duration,
            "letter": self.letter,
            "time_left": time_left,
            
            # Round data
            "answers": self.answers,
            "votes": self.votes,
            
            # Scoring
            "scores": {player_names.get(sid, "Unknown"): val for sid, val in self.scores.items()},
            "round_scores": {player_names.get(sid, "Unknown"): val for sid, val in self.round_scores.items()},
            
            # Map of detailed results with nicknames for easy client rendering
            "results": {
                player_names.get(sid, "Unknown"): {
                    cat: data for cat, data in details.items()
                }
                for sid, details in self.detailed_round_results.items()
            },

            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "role": "creator" if p["session_id"] == self.creator_id else "player"
                }
                for p in self.players
            ]
        }
