FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server ./server
COPY specs ./specs
ENV PYTHONUNBUFFERED=1 PORT=8080
EXPOSE 8080
CMD ["python","-m","server.mcp_server"]
