FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py entitlements.py ./
RUN useradd --create-home app
USER app
ENV PORT=8080
CMD ["sh","-c","gunicorn --bind :${PORT} --workers 2 --threads 4 --timeout 45 --access-logfile /dev/null app:app"]
