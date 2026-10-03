from flask import Flask, send_from_directory
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", 8080))

print(f"BASE_DIR = {BASE_DIR}", flush=True)
print(f"PORT     = {PORT}", flush=True)


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    print(f"Starting Flask on 0.0.0.0:{PORT}", flush=True)
    app.run(host="0.0.0.0", port=PORT, debug=False)
