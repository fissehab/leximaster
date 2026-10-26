"""LexiMaster FastAPI app: JSON API under /api, audio under /media, SPA at /."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
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
for module in (words, practice, lists, stats):
    app.include_router(module.router)


@app.get("/api/health")
def health():
    with db.tx() as c:
        n = c.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
    return {"ok": True, "words": n}


app.mount("/media/audio", StaticFiles(directory=db.DATA / "audio", check_dir=False), name="audio")
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
