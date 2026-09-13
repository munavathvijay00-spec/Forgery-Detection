#!/usr/bin/env python3
"""
AegisDoc Office Kit Bridge Server
Satisfies iQOO HackTracker: "Office Kit usage (10%): Phone and laptop bridge use."

Enables real-time, low-latency, zero-knowledge pairing between an Android/iQOO phone 
(Secure Forensic Enclave) and a Laptop/Desktop (Compliance Auditor Terminal).

Zero-Knowledge Policy:
Raw document pixels never leave the phone. Only forensic telemetry, 
detected bounding box coordinates, and explanation strings are synchronized.
"""

import asyncio
import json
import logging
import os
import sys
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# In-memory session registry: room_id -> {"phone": ws, "laptop": ws, "history": []}
ROOMS = {}

async def handle_ws(request):
    ws = web.WebSocketResponse(heartbeat=20.0)
    await ws.prepare(request)

    role = None
    room_id = None

    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                try:
                    payload = json.loads(msg.data)
                except Exception:
                    continue

                action = payload.get("action")

                if action == "join":
                    room_id = str(payload.get("roomId", "AEGIS-HQ")).upper().strip()
                    role = payload.get("role", "phone") # 'phone' or 'laptop'
                    
                    if room_id not in ROOMS:
                        ROOMS[room_id] = {"phone": None, "laptop": None, "history": []}

                    ROOMS[room_id][role] = ws
                    logging.info(f"Client joined room '{room_id}' as '{role}'. Active pairs: {bool(ROOMS[room_id]['phone'] and ROOMS[room_id]['laptop'])}")

                    # Acknowledge connection
                    await ws.send_json({
                        "event": "joined",
                        "roomId": room_id,
                        "role": role,
                        "paired": bool(ROOMS[room_id]["phone"] and ROOMS[room_id]["laptop"])
                    })

                    # Notify peer
                    peer_role = "laptop" if role == "phone" else "phone"
                    peer_ws = ROOMS[room_id].get(peer_role)
                    if peer_ws and not peer_ws.closed:
                        await peer_ws.send_json({
                            "event": "peer_connected",
                            "peerRole": role,
                            "roomId": room_id
                        })

                elif action == "sync_telemetry":
                    # Broadcast forensic findings from Phone -> Laptop
                    if room_id and room_id in ROOMS:
                        ROOMS[room_id]["history"].append(payload.get("data"))
                        laptop_ws = ROOMS[room_id].get("laptop")
                        if laptop_ws and not laptop_ws.closed:
                            await laptop_ws.send_json({
                                "event": "telemetry_update",
                                "data": payload.get("data")
                            })

                elif action == "remote_command":
                    # Command from Laptop -> Phone (e.g. 'request_rescan', 'spotlight_region')
                    if room_id and room_id in ROOMS:
                        phone_ws = ROOMS[room_id].get("phone")
                        if phone_ws and not phone_ws.closed:
                            await phone_ws.send_json({
                                "event": "remote_command",
                                "command": payload.get("command"),
                                "regionId": payload.get("regionId")
                            })

                elif action == "ping":
                    await ws.send_json({"event": "pong"})

            elif msg.type == web.WSMsgType.ERROR:
                logging.error(f"WebSocket error: {ws.exception()}")

    finally:
        if room_id and room_id in ROOMS:
            if role and ROOMS[room_id].get(role) == ws:
                ROOMS[room_id][role] = None
                logging.info(f"Client '{role}' disconnected from room '{room_id}'")
                peer_role = "laptop" if role == "phone" else "phone"
                peer_ws = ROOMS[room_id].get(peer_role)
                if peer_ws and not peer_ws.closed:
                    try:
                        await peer_ws.send_json({
                            "event": "peer_disconnected",
                            "peerRole": role
                        })
                    except Exception:
                        pass

    return ws

async def handle_status(request):
    return web.json_response({
        "status": "online",
        "service": "AegisDoc Office Kit Bridge",
        "version": "2.4.0",
        "active_rooms": len(ROOMS)
    })

@web.middleware
async def no_cache_middleware(request, handler):
    resp = await handler(request)
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

def create_app():
    app = web.Application(middlewares=[no_cache_middleware])
    app.router.add_get("/ws", handle_ws)
    app.router.add_get("/api/status", handle_status)
    
    client_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "client")
    index_path = os.path.join(client_dir, "index.html")

    async def handle_root(req):
        return web.FileResponse(index_path)

    async def handle_favicon(req):
        return web.Response(status=204)

    app.router.add_get("/", handle_root)
    app.router.add_get("/favicon.ico", handle_favicon)
    app.router.add_get("/apple-touch-icon.png", handle_favicon)
    app.router.add_get("/apple-touch-icon-precomposed.png", handle_favicon)
    app.router.add_static("/", client_dir, show_index=False)
    return app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8765))
    logging.info(f"Starting AegisDoc Office Kit Bridge Server on http://0.0.0.0:{port}")
    app = create_app()
    web.run_app(app, host="0.0.0.0", port=port)
