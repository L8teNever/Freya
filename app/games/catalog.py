import random
from typing import Dict, List, Any, Type, Optional
from app.games.base import BaseGame
from app.games.tictactoe import TicTacToeGame
from app.games.stadtlandfluss import StadtLandFlussGame
from app.games.wortkette import WortketteGame
from app.games.bombe import BombeGame
from app.games.bingo import BingoGame
from app.games.zweiwahrheiten import ZweiWahrheitenGame
from app.games.werbinich import WerBinIchGame
from app.games.kniffel import KniffelGame
from app.games.aerger import AergerGame
from app.games.connectfour import ConnectFourGame

# 20 Games Catalog
GAMES_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "tictactoe",
        "name": "Tic-Tac-Toe",
        "icon": "grid_3x3",
        "description": "Klassisches 3x3 Raster-Spiel. Bringe 3 in eine Reihe!",
        "min_players": 2,
        "max_players": 2,
        "is_playable": True
    },
    {
        "id": "connectfour",
        "name": "Vier gewinnt",
        "icon": "filter_hdr",
        "description": "Lasse deine Chips fallen und bringe 4 in eine Reihe.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": True
    },
    {
        "id": "battleship",
        "name": "Schiffe versenken",
        "icon": "directions_boat",
        "description": "Finde und zerstöre die Flotte deines Gegners.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "chess",
        "name": "Schach",
        "icon": "explore",
        "description": "Das klassische königliche Strategiespiel.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "checkers",
        "name": "Dame",
        "icon": "blur_on",
        "description": "Springe über die gegnerischen Steine und erobere das Brett.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "backgammon",
        "name": "Backgammon",
        "icon": "casino",
        "description": "Bewege deine Steine nach Hause, gewürfelt und geplant.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "snake",
        "name": "Snake Versus",
        "icon": "gesture",
        "description": "Fresse Punkte und weiche dem Schwanz deines Gegners aus.",
        "min_players": 2,
        "max_players": 4,
        "is_playable": False
    },
    {
        "id": "pong",
        "name": "Retro Pong",
        "icon": "sports_tennis",
        "description": "Halte den Ball im Spiel. Klassische Paddel-Action.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "memory",
        "name": "Memory",
        "icon": "style",
        "description": "Finde Paare und trainiere dein Gedächtnis.",
        "min_players": 1,
        "max_players": 6,
        "is_playable": False
    },
    {
        "id": "wordsearch",
        "name": "Wortsuche",
        "icon": "search",
        "description": "Finde versteckte Wörter im Buchstabensalat.",
        "min_players": 1,
        "max_players": 4,
        "is_playable": False
    },
    {
        "id": "kniffel",
        "name": "Kniffel",
        "icon": "casino",
        "description": "Würfle clever, halte Würfel und trage Kombinationen ein. Höchste Punktzahl gewinnt.",
        "min_players": 1,
        "max_players": 8,
        "is_playable": True
    },
    {
        "id": "sudoku",
        "name": "Sudoku Coop",
        "icon": "grid_on",
        "description": "Löst das Zahlenrätsel gemeinsam ohne Fehler.",
        "min_players": 1,
        "max_players": 4,
        "is_playable": False
    },
    {
        "id": "uno",
        "name": "Duo (UNO)",
        "icon": "layers",
        "description": "Lege deine Karten passend ab. Vergiss nicht Bescheid zu sagen!",
        "min_players": 2,
        "max_players": 6,
        "is_playable": False
    },
    {
        "id": "aerger",
        "name": "Mensch ärgere dich nicht",
        "icon": "casino",
        "description": "Bringe alle 4 Figuren ins Ziel. Mit einer 6 raus aus dem Haus – und wirf die anderen zurück!",
        "min_players": 2,
        "max_players": 4,
        "is_playable": True
    },
    {
        "id": "tetris",
        "name": "Tetris Versus",
        "icon": "dashboard_customize",
        "description": "Staple Blöcke und schicke Linien zum Gegner.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "minesweeper",
        "name": "Minesweeper Coop",
        "icon": "brightness_high",
        "description": "Markiert alle Minen gemeinsam auf dem Feld.",
        "min_players": 1,
        "max_players": 4,
        "is_playable": False
    },
    {
        "id": "tictactoe3d",
        "name": "Tic-Tac-Toe 3D",
        "icon": "view_in_ar",
        "description": "Tic-Tac-Toe auf 3 Ebenen übereinander. 3D-Denksport.",
        "min_players": 2,
        "max_players": 2,
        "is_playable": False
    },
    {
        "id": "hangman",
        "name": "Galgenmännchen",
        "icon": "face",
        "description": "Errate das gesuchte Wort, bevor der Mann hängt.",
        "min_players": 2,
        "max_players": 4,
        "is_playable": False
    },
    {
        "id": "trivia",
        "name": "Quiz Arena",
        "icon": "quiz",
        "description": "Wer weiß am meisten? Schnelligkeit zählt!",
        "min_players": 2,
        "max_players": 8,
        "is_playable": False
    },
    {
        "id": "carddraw",
        "name": "Karten ziehen",
        "icon": "content_paste_search",
        "description": "Wer zieht die höchste Karte? Glücksspiel für Zwischendurch.",
        "min_players": 2,
        "max_players": 10,
        "is_playable": True  # We'll support this as a simple secondary playable game or mock game!
    },
    {
        "id": "stadtlandfluss",
        "name": "Stadt Land Fluss",
        "icon": "edit_note",
        "description": "Finde passende Begriffe zu verschiedenen Kategorien mit dem vorgegebenen Buchstaben.",
        "min_players": 2,
        "max_players": 8,
        "is_playable": True
    },
    {
        "id": "wortkette",
        "name": "Wortkette",
        "icon": "link",
        "description": "Reihum ein Wort nennen, das mit dem letzten Buchstaben des vorherigen beginnt. Wer es nicht rechtzeitig schafft, fliegt raus!",
        "min_players": 2,
        "max_players": 12,
        "is_playable": True
    },
    {
        "id": "bombe",
        "name": "Bombe",
        "icon": "local_fire_department",
        "description": "Eine Kategorie, eine tickende Bombe. Reihum passenden Begriff nennen – wer die Bombe hält, wenn sie hochgeht, ist raus.",
        "min_players": 2,
        "max_players": 12,
        "is_playable": True
    },
    {
        "id": "bingo",
        "name": "Bingo",
        "icon": "apps",
        "description": "Klassisches Zahlen-Bingo. Markiere gezogene Zahlen auf deiner Karte und rufe als Erste:r Bingo!",
        "min_players": 1,
        "max_players": 16,
        "is_playable": True
    },
    {
        "id": "zweiwahrheiten",
        "name": "2 Wahrheiten, 1 Lüge",
        "icon": "psychology",
        "description": "Jede:r gibt 3 Aussagen ein – eine ist gelogen. Errate bei den anderen die Lüge.",
        "min_players": 2,
        "max_players": 12,
        "is_playable": True
    },
    {
        "id": "werbinich",
        "name": "Wer bin ich?",
        "icon": "theater_comedy",
        "description": "Die Gruppe schlägt für jede:n eine geheime Identität vor und stimmt ab. Errate mit Ja/Nein-Fragen, wer du bist.",
        "min_players": 3,
        "max_players": 12,
        "is_playable": True
    }
]

def get_game_class(game_type: str) -> Optional[Type[BaseGame]]:
    if game_type == "tictactoe":
        return TicTacToeGame
    elif game_type == "carddraw":
        # We can implement a quick simple game class for Card Draw inside catalog or another file!
        return CardDrawGame
    elif game_type == "stadtlandfluss":
        return StadtLandFlussGame
    elif game_type == "wortkette":
        return WortketteGame
    elif game_type == "bombe":
        return BombeGame
    elif game_type == "bingo":
        return BingoGame
    elif game_type == "zweiwahrheiten":
        return ZweiWahrheitenGame
    elif game_type == "werbinich":
        return WerBinIchGame
    elif game_type == "kniffel":
        return KniffelGame
    elif game_type == "aerger":
        return AergerGame
    elif game_type == "connectfour":
        return ConnectFourGame
    return None

class CardDrawGame(BaseGame):
    """A quick secondary game to demonstrate catalog flexibility."""
    def __init__(self, game_session_id: str, players: List[Dict[str, Any]]):
        super().__init__(game_session_id, "carddraw", players)
        self.scores: Dict[str, int] = {}
        self.winner = None
        self.start_game()

    def start_game(self) -> bool:
        self.scores = {}
        self.winner = None
        # Draw a random card score for each active player
        for p in self.players:
            self.scores[p["session_id"]] = random.randint(1, 100)
        
        # Determine winner
        max_score = -1
        winning_id = None
        is_draw = False
        
        for p_id, score in self.scores.items():
            if score > max_score:
                max_score = score
                winning_id = p_id
                is_draw = False
            elif score == max_score:
                is_draw = True
                
        self.winner = "draw" if is_draw else winning_id
        self.status = "finished"
        return True

    def handle_action(self, session_id: str, action: Dict[str, Any]) -> bool:
        if action.get("type") == "restart":
            return self.start_game()
        return False

    def get_state(self) -> Dict[str, Any]:
        player_names = {p["session_id"]: p["nickname"] for p in self.players}
        scores_with_names = {player_names.get(sid, "Unknown"): score for sid, score in self.scores.items()}
        
        winner_name = "Draw"
        if self.winner and self.winner != "draw":
            winner_name = player_names.get(self.winner, "Unknown")
            
        return {
            "game_session_id": self.game_session_id,
            "game_type": self.game_type,
            "status": self.status,
            "scores": scores_with_names,
            "players": [
                {
                    "session_id": p["session_id"],
                    "nickname": p["nickname"],
                    "is_active": p["is_active"],
                    "role": "player"
                }
                for p in self.players
            ],
            "winner": self.winner,
            "winner_name": winner_name
        }
