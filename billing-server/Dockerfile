FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py entitlements.py security.py persistence.py play_api.py service.py entrypoint.py ./
RUN useradd --create-home app
ENV PORT=8080
# Root performs only the fixed disk permission preflight; entrypoint drops all
# supplementary groups and its UID/GID before executing Gunicorn.
ENTRYPOINT ["python", "entrypoint.py"]
