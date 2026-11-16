"""LexiMaster FastAPI app: JSON API under /api, audio under /media, SPA at /."""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import re
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .api import lists, practice, stats, words

STATIC = db.ROOT / "static"
log = logging.getLogger("leximaster")

# Host names the app answers to. The test client's "testserver" only when
# LEXIMASTER_TESTING=1 (set by tests/ and tools/parity.py).
TESTING = os.environ.get("LEXIMASTER_TESTING") == "1"
LOCAL_HOSTS = ("localhost", "127.0.0.1") + (("testserver",) if TESTING else ())


# ------------------------------------------------------ Content-Security-Policy
# One policy for the local app (sent as a header on HTML responses) and the
# website (tools/build_site.py writes it into docs/index.html as a <meta>).
# Scripts: only our own files, the page's inline scripts by hash, and (on the
# website) WebAssembly compilation for sql.js. Styles allow
# 'unsafe-inline' because the views write style="..." attributes into HTML.
# blob: is for recordings (played, and fetched to draw their waveform);
# data: for the SVG favicon.
_INLINE_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)


def inline_script_hashes(page: str) -> list[str]:
    """CSP source expressions ('sha256-...') for each inline <script> in the page."""
    return [f"'sha256-{base64.b64encode(hashlib.sha256(m.encode('utf-8')).digest()).decode()}'"
            for m in _INLINE_SCRIPT.findall(page)]


def content_security_policy(script_hashes: list[str], *, header: bool = True, wasm: bool = False) -> str:
    """The policy for a page whose inline scripts have these hashes. A <meta>
    policy (header=False) leaves out frame-ancestors, which browsers ignore
    there with a console warning. wasm allows compiling WebAssembly (sql.js)."""
    directives = [
        "default-src 'self'",
        " ".join(["script-src 'self'", *(["'wasm-unsafe-eval'"] if wasm else []), *script_hashes]),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "media-src 'self' blob: data:",
        "connect-src 'self' blob:",
        "font-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ]
    if header:
        directives.append("frame-ancestors 'none'")
    return "; ".join(directives)


_csp_cache: tuple[int, str] | None = None


def index_csp() -> str:
    """The header policy for static/index.html (recomputed when the file changes)."""
    global _csp_cache
    mtime = (STATIC / "index.html").stat().st_mtime_ns
    if _csp_cache is None or _csp_cache[0] != mtime:
        page = (STATIC / "index.html").read_text(encoding="utf-8")
        _csp_cache = (mtime, content_security_policy(inline_script_hashes(page)))
    return _csp_cache[1]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        db.backup_daily()   # before init(), so the snapshot predates any migration
    except Exception as e:  # a failed backup must not keep the app from starting
        log.warning("Daily backup of %s failed: %s", db.DB_PATH, e)
    db.init()
    yield


app = FastAPI(title="LexiMaster", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2048)

# The app listens on this computer only, but a web page in the browser can
# still send it requests. Only the app's own page may change anything: a
# write that carries an Origin must come from exactly the address the request
# was sent to (scheme, local host name and port), so another local server's
# page (say localhost:3000) is refused too. Requests without an Origin (curl,
# scripts) are allowed. TrustedHost answers only requests addressed to a local
# name (a DNS-rebinding page sends its own host name).
def same_origin(origin: str, host: str | None) -> bool:
    if not host:
        return False
    try:
        o = urlsplit(origin)
        port_ok = o.port is not None or ":" not in o.netloc
    except ValueError:
        return False
    return (port_ok and o.scheme == "http" and o.hostname in LOCAL_HOSTS
            and not o.path and not o.query and o.netloc.lower() == host.lower())


@app.middleware("http")
async def same_origin_writes(request: Request, call_next):
    origin = request.headers.get("origin")
    if (request.method not in ("GET", "HEAD", "OPTIONS") and origin is not None
            and not same_origin(origin, request.headers.get("host"))):
        return JSONResponse({"detail": "Changes are only accepted from LexiMaster itself."}, status_code=403)
    return await call_next(request)


@app.middleware("http")
async def csp_header(request: Request, call_next):
    response = await call_next(request)
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Content-Security-Policy"] = index_csp()
    return response


app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(LOCAL_HOSTS))
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
