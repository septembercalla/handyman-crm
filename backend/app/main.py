import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, customers, dashboard, handymen, schedule, tasks

logging.basicConfig(level=logging.INFO)

API_PREFIX = "/api/v1"

app = FastAPI(
    title="Handyman CRM API",
    description="Dispatcher console backend — tasks, handymen, customers, schedule.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,  # required for the httpOnly auth cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, tasks.router, handymen.router, customers.router):
    app.include_router(router, prefix=API_PREFIX)
app.include_router(schedule.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {"service": "handyman-crm-api", "docs": "/docs"}
