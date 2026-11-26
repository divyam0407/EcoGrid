FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    coinor-cbc \
    && rm -rf /var/lib/apt/lists/*

COPY intelligence/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY intelligence ./intelligence
COPY datasets ./datasets

EXPOSE 8000

CMD ["uvicorn", "intelligence.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
