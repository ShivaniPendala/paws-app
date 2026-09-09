# Services package
# Avoid importing submodules at package import time to prevent import-time
# side-effects and relative-import errors when running modules directly with
# `uvicorn main:app`. Import submodules lazily from application code instead.
__all__ = ["triage_service", "spatial_service", "firestore_service"]
