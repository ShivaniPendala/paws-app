# Stage 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

# Install compilation tools needed for C-extensions/grpcio
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libssl-dev \
    libffi-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Build wheels for all dependencies
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# Stage 2: Final Runtime
FROM python:3.11-slim

WORKDIR /app

# Copy pre-compiled dependencies from builder
COPY --from=builder /install /usr/local

# Copy application source code
COPY . /app

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]