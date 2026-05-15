from __future__ import annotations

from .config import BackendSettings


class LazyAsgiApp:
    def __init__(self) -> None:
        self._app = None

    async def __call__(self, scope, receive, send) -> None:
        if self._app is None:
            from .api import create_app

            self._app = create_app()
        await self._app(scope, receive, send)


app = LazyAsgiApp()


def main() -> None:
    import uvicorn
    from .api import create_app

    settings = BackendSettings.from_env()
    uvicorn.run(create_app(settings=settings), host=settings.backend_host, port=settings.backend_port, reload=False)


if __name__ == "__main__":
    main()
