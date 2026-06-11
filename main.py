import os
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.manager import GroupManager

app = FastAPI(title="Freya Games Portal")
manager = GroupManager()

# Ensure static folders exist
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js/games", exist_ok=True)

@app.get("/api/group/{group_id}/info")
async def get_group_info(group_id: str):
    room = manager.get_room(group_id)
    if not room:
        return JSONResponse({"exists": False, "message": "Group not found"}, status_code=404)
    
    return {
        "exists": True,
        "players": [
            {
                "nickname": p["nickname"],
                "is_active": p["is_active"]
            }
            for p in room.players
        ]
    }

@app.websocket("/ws/group/{group_id}/{session_id}/{nickname}")
async def websocket_endpoint(websocket: WebSocket, group_id: str, session_id: str, nickname: str):
    await manager.connect(websocket, session_id, group_id, nickname)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                action = json.loads(data)
                changed = await manager.handle_client_message(session_id, group_id, action)
                if changed:
                    await manager.broadcast_group_state(group_id)
            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f"Error handling websocket action: {e}")
    except WebSocketDisconnect:
        await manager.disconnect(websocket, session_id, group_id)

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")

@app.get("/group/{group_id}")
async def get_group_page(group_id: str):
    # Standard SPA fallback: return the main HTML file, client-side JS will read the path
    return FileResponse("static/index.html")

@app.get("/group/{group_id}/spiel/{session_id}")
async def get_group_game_page(group_id: str, session_id: str):
    # Deep-link directly into an active game; client-side JS reads the path
    return FileResponse("static/index.html")

# Mount static files (HTML/CSS/JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

