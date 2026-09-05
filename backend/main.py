"""
main.py

FastAPI application entry point for the BIN-Vision Agent Backend.
Provides WebSockets and REST APIs for autonomous, privacy-preserving browser automation.
"""
import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("bin_vision.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting BIN-Vision Agent Backend Server...")
    provider = os.getenv("LLM_PROVIDER", "heuristic")
    logger.info(f"Configured LLM Provider: {provider}")
    yield
    logger.info("Shutting down BIN-Vision Agent Backend Server...")


app = FastAPI(
    title="BIN-Vision Agent Backend",
    description="Backend reasoning and action generation engine for BIN-Vision browser extension",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware configuration (support Chrome extensions and local frontends)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and attach routers
from .routers.health import router as health_router
from .routers.agent import router as agent_router

app.include_router(health_router)
app.include_router(agent_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
