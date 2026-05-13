from __future__ import annotations

import uvicorn

from .api import create_app
from .config import BackendSettings


app = create_app()


def main() -> None:
    settings = BackendSettings.from_env()
    uvicorn.run(create_app(settings=settings), host=settings.backend_host, port=settings.backend_port, reload=False)


if __name__ == "__main__":
    main()
