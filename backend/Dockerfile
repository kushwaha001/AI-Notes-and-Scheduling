# Backend image — FastAPI + uvicorn
FROM python:3.11-slim

WORKDIR /app

# Install Python deps first (better layer caching)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY backend/ ./

EXPOSE 9000

# DB host/credentials come from docker-compose environment (override .env).
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "9000"]
