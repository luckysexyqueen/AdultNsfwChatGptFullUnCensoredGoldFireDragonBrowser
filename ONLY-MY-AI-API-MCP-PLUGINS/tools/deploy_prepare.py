"""Prepare deployment commands; does not impersonate cloud login or provision infrastructure."""
import argparse,os,secrets
p=argparse.ArgumentParser();p.add_argument('--provider',choices=['docker','render'],default='docker');a=p.parse_args()
print('Set MCP_BEARER_TOKEN in your provider secret store (never commit it).')
print('Set ALLOWED_API_HOSTS to comma-separated upstream hosts.')
print('Build: docker build -t spec-direct-mcp .')
print('Run: docker run --rm -p 8080:8080 --env-file .env spec-direct-mcp')
print('Provide TLS/HTTPS reverse proxy; verify /mcp with connection_doctor.py.')
print('Cloud deployment needs a provider account, credentials and user approval.')
