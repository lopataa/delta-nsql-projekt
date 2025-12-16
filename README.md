## Task Tracker s Redis Stack

Full-stack ukázka pro správu úkolů žáků: registrace uživatelů, CRUD nad úkoly, kategorie, filtrování, JWT autentizace a real-time aktualizace přes Socket.io + Redis Pub/Sub. Data jsou v Redis Stack (JSON + TTL 30 dní, Streams pro historii, Search pro filtry).

### Požadavky
- Docker + Docker Compose
- Git

### Rychlé spuštění
```bash
git clone <your-repo-url>
cd task-tracker
docker-compose up --build -d
# frontend: http://localhost:3000
# API: http://localhost:4000
# RedisInsight: http://localhost:8001
```

Pro ukončení a smazání dat:
```bash
docker-compose down -v
```
Pokud chcete data zachovat, použijte `docker-compose down` bez `-v`.

### Struktura
- `backend/` – NestJS REST API + Socket.io gateway, Redis (ioredis), JWT, RedisJSON, Search, Streams, seed skript.
- `frontend/` – Next.js (static export) + Socket.io klient, formuláře, filtry, živý seznam.
- `docker-compose.yml` – redis-stack, backend, frontend (Nginx).
- `docs/architecture.drawio` – diagram architektury (otevřete v draw.io / diagrams.net).
- `frontend/public/screenshot.svg` – ilustrační screenshot UI.

### Backend – API
- `POST /auth/register` – { email, name, password } → JWT + user (token uložen v Redis s TTL 7 dní).
- `POST /auth/login` – { email, password } → JWT + user.
- `GET /auth/me` – profil pro platný token.
- `GET /tasks` – seznam úkolů uživatele (filtry: `category`, `status=open|in_progress|done`, `q` přes Redis Search).
- `POST /tasks` – vytvoří úkol (JSON, TTL 30 dní, zápis do Streamu + Pub/Sub).
- `PUT /tasks/:id` – update stavu/detaily (reset TTL, Stream + Pub/Sub).
- `DELETE /tasks/:id` – smaže úkol, přidá event do Streamu + Pub/Sub.

Redis klíče: `user:*` (JSON), `task:*` (JSON, TTL), `token:*`, stream `tasks:changes`, kanál `tasks:updates`, search indexy `idx:tasks`, `idx:users`.

### Frontend – práce s UI
- Registrace / login, token v `localStorage`.
- Formulář pro nový úkol, kategorie, popis.
- Filtry (kategorie, stav, fulltext) → volají `/tasks`.
- Real-time Socket.io (Redis adapter) → změny se propisují do seznamu na dvou prohlížečích současně.

### Seed dat
```bash
cd backend
# pokud běží Redis v docker-compose na vašem hostu:
REDIS_HOST=localhost REDIS_PASSWORD=redispassword npm run seed

# nebo spusťte přímo v běžícím containeru backendu (Redis je tam na hostu "redis-stack"):
# docker compose exec backend npm run seed
```
Vytvoří demo uživatele `student@example.com` / `changeme123` a 10 úkolů.

### Docker image detaily
- **Redis Stack**: `redis/redis-stack:latest`, persistentní volume `./redis-data:/data`, AOF persist (appendonly), přístupové heslo `redispassword` (měňte v `docker-compose.yml` + env backendu).
- **Backend**: multi-stage Node 20 Alpine, naslouchá na `4000`, env `REDIS_HOST=redis-stack`, `REDIS_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`.
- **Frontend**: build-time proměnná `NEXT_PUBLIC_API_URL` (v compose směřuje na `http://backend:4000`), Nginx statické soubory na portu `3000`.

### Testování real-time
1. Spusťte stack, přihlaste se ve dvou prohlížečích.
2. Přidejte/změňte úkol v jednom okně – druhé se aktualizuje během okamžiku přes Pub/Sub → Socket.io.
3. Sledujte stream v RedisInsight (`tasks:changes`) pro audit.

### Architektura
Diagram: `docs/architecture.drawio` (otevřete na https://app.diagrams.net/ a načtěte soubor).

### Screenshot
Statický náhled UI: `frontend/public/screenshot.svg` (z build výstupu lze snadno přepsat reálným screenshotem).

### Bezpečnostní poznámky
- JWT je validován a token musí být uložen v Redis (blokace expirovaných/odhlášených tokenů).
- Redis vyžaduje heslo; upravte jej + případně firewall/SSL pro produkční prostředí.
