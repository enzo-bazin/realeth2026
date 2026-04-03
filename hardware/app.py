"""Point d'entree du serveur Flask IrisWallet Hardware."""

from flask import Flask
from flask_cors import CORS

from api.routes import api
from config import HOST, PORT, DEBUG


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(api)
    return app


if __name__ == "__main__":
    app = create_app()
    print(f"IrisWallet Hardware API running on http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=DEBUG)
