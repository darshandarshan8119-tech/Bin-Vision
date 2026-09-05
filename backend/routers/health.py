"""
health.py

REST endpoints for health checking and backend readiness.
"""
import time
from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Health check endpoint for container orchestrators, browser extension, and monitoring.
    """
    return {
        "status": "healthy",
        "service": "bin-vision-backend",
        "version": "1.0.0",
        "timestamp": time.time()
    }


@router.get("/")
async def root():
    return {
        "message": "BIN-Vision Agent Backend is running",
        "docs": "/docs",
        "websocket": "/ws/agent"
    }
