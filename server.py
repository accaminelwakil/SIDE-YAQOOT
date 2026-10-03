from flask import Flask, send_from_directory, Response
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# ── Manifest: يحتاج MIME type خاص ───────────────────────────────────
@app.route("/manifest.json")
def manifest():
    resp = send_from_directory(BASE_DIR, "manifest.json")
    resp.headers["Content-Type"] = "application/manifest+json"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ── Digital Asset Links (TWA / Android) ─────────────────────────────
@app.route("/.well-known/assetlinks.json")
def assetlinks():
    resp = send_from_directory(
        os.path.join(BASE_DIR, "static", ".well-known"),
        "assetlinks.json"
    )
    resp.headers["Content-Type"] = "application/json"
    return resp


# ── Service Worker: يجب أن يكون في الجذر تماماً ──────────────────────
@app.route("/sw.js")
def service_worker():
    resp = send_from_directory(BASE_DIR, "sw.js")
    resp.headers["Content-Type"] = "application/javascript"
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


# ── الصفحة الرئيسية ──────────────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


# ── كل الملفات الثابتة (CSS, JS, assets, ...) ───────────────────────
@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
