# FlawFerret AI Server

Backend service for FlawFerret AI scenario generation.

## What it does
- exposes `GET /health`
- exposes `POST /generate-scenario`
- routes generation requests to OpenAI or local Ollama

## Requirements
- Node.js 20+
- `OPENAI_API_KEY` (required only when provider is OpenAI)

## Local run
1. Install dependencies: `npm install`
2. Set env vars (or copy `.env.example`):
   - `OPENAI_API_KEY=...`
   - optional `OPENAI_MODEL=gpt-4o-mini`
   - optional `PORT=8787`
3. Start server: `npm run start`

Server default URL: `http://localhost:8787`

## Docker
- Build and run: `docker compose up --build`

## Extension wiring
In FlawFerret extension options:
- set AI Server URL to this server (for local: `http://localhost:8787`)
- choose provider (`openai` or `ollama`)
- set model and Ollama URL as needed
