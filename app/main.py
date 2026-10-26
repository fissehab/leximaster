"""LexiMaster FastAPI app: JSON API under /api, audio under /media, SPA at /."""
from __future__ import annotations

import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .api import lists, practice, stats, words

STATIC = db.ROOT / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    yield


app = FastAPI(title="LexiMaster", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2048)

# The app listens on this computer only, but a web page in the browser can
# still send it requests. Only the app's own page may change anything (other
# sites' pages send their own Origin), and only requests addressed to
# localhost are answered (a DNS-rebinding page sends its own host name).
LOCAL_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")


@app.middleware("http")
async def same_origin_writes(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin and not LOCAL_ORIGIN.match(origin):
        return JSONResponse({"detail": "Changes are only accepted from LexiMaster itself."}, status_code=403)
    return await call_next(request)


app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"])
for module in (words, practice, lists, stats):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    with db.tx() as c:
        n = c.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
    return {"ok": True, "words": n}


app.mount("/media/audio", StaticFiles(directory=db.DATA / "audio", check_dir=False), name="audio")
app.mount("/media/tts", StaticFiles(directory=db.DATA / "tts", check_dir=False), name="tts")
class AppFiles(StaticFiles):
    """The app's own CSS and JS: the browser revalidates on every load
    (a quick 304 when unchanged), so an update is never hidden behind a
    stale cached stylesheet."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/static", AppFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})
