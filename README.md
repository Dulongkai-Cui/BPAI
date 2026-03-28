# BPAI Frontend Docker Setup

This repository now uses a frontend-first structure for local development.

## Recommended structure

```text
BPAI/
|-- docker/
|   `-- frontend-dev-entrypoint.sh
|-- frontend/
|   |-- .env.local.example
|   |-- package.json
|   |-- tsconfig.json
|   |-- next.config.ts
|   `-- src/
|       `-- app/
|-- Dockerfile
|-- docker-compose.yml
`-- .dockerignore
```

## Before first start

Copy the example environment file:

```bash
cp frontend/.env.local.example frontend/.env.local
```

On Windows PowerShell:

```powershell
Copy-Item frontend/.env.local.example frontend/.env.local
```

## Start the frontend

```bash
docker compose up --build
```

Open `http://localhost:3000`.

## Stop the environment

```bash
docker compose down
```

## Dependency management

Install new packages inside the container so the host machine stays clean:

```bash
docker compose exec frontend npm install <package-name>
```

If you change `package.json` or `package-lock.json`, restart the frontend service:

```bash
docker compose restart frontend
```

## Notes

- Source code is bind-mounted from `./frontend` into the container.
- `node_modules` stays inside the Docker volume `frontend_node_modules`.
- Next.js build cache stays inside the Docker volume `frontend_next`.
- This setup is intentionally frontend-only for now. Backend, database, and other services can be added later in the same `docker-compose.yml`.
