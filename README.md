# Tagly

Multi-tenant Digital Product Pass system. Skann en QR-kode på en fysisk enhet → kunden får en
merkevarestylet side med produktinfo og et kontaktskjema som ruter e-posten til riktig firma via
**Resend**.

> Tjenesten kjører pdd. på domenet `tagly.poshub.no` (Cloudflare Tunnel). Det gamle `betala.link`-domenet er deprecated.

## Stack

| Lag       | Teknologi                                                       |
| --------- | --------------------------------------------------------------- |
| Backend   | FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL                   |
| Kø        | Celery · Redis                                                  |
| E-post    | Resend (Python SDK)                                             |
| Frontend  | React 18 · Vite · TypeScript · TailwindCSS · `qrcode.react`     |
| Infra     | docker-compose (Postgres + Redis), Cloudflare Tunnel            |

## Mappestruktur

```
backend/
  app/
    api/public.py       # /p/{uuid} og /p/{uuid}/support
    models/             # Firm, ProductModel, Asset, Ticket
    workers/            # Celery app + send_resend_email task
    config.py, database.py, main.py, schemas.py
  alembic/              # migrasjoner
frontend/
  src/
    pages/ProductPage.tsx
    pages/AdminLabels.tsx
    components/Label.tsx       # 12mm Brother P-touch
    components/SupportForm.tsx
docker-compose.yml      # Postgres + Redis
```

## Komme i gang

### 1. Start databaser

```powershell
docker compose up -d
```

### 2. Backend

```powershell
cd backend
uv sync                        # eller: python -m venv .venv ; .venv\Scripts\pip install -e .
Copy-Item .env.example .env    # fyll inn RESEND_API_KEY etc.

# Generér første migrasjon
uv run alembic revision --autogenerate -m "init"
uv run alembic upgrade head

# Kjør API
uv run uvicorn app.main:app --reload --port 18000
```

### 3. Celery-worker (egen terminal)

```powershell
cd backend
uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info --pool=solo
```

> `--pool=solo` på Windows. På Linux kan du droppe det og bruke prefork.

### 4. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Åpne <http://localhost:51730/p/{asset-uuid}> for kundevisning eller <http://localhost:51730/admin/labels>
for å skrive ut 12mm-etiketter.

## Resend-domeneverifisering (før produksjon)

1. Resend dashboard → Domains → Add `poshub.no` (eller en subdomain du eier).
2. Lim inn SPF, DKIM og DMARC-records hos DNS-leverandøren.
3. Vent på "Verified" før du sender produksjons-e-post.
4. Sett `RESEND_FROM_EMAIL=tagly@poshub.no` (eller annen verifisert avsender) i `.env`.

## Cloudflare Tunnel (eksponer lokalt)

```bash
cloudflared tunnel login
cloudflared tunnel create tagly
cloudflared tunnel route dns tagly tagly.poshub.no
cloudflared tunnel run tagly
```

## Vedlegg

`Ticket.attachment_url` aksepterer en URL (f.eks. en presigned S3-URL). E-postmalen i
[backend/app/workers/tasks.py](backend/app/workers/tasks.py) renderer den som en lenke. Hvis du
trenger ekte vedlegg-bytes, bytt ut `payload` med `attachments=[{"filename": ..., "content": ...}]`
i Resend-kallet.

## Køens flyt

```
POST /p/{uuid}/support
        │
        ▼
   Ticket(status=pending)  ───►  send_resend_email.delay(ticket_id)
                                          │
                                          ▼
                              resend.Emails.send(...)
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                   status=sent + sent_at       retry m/ backoff
                                                (max 5 forsøk)
                                                       │
                                                       ▼
                                             status=failed + last_error
```

## Sikkerhet

* Alle UUID-er er `uuid4` – ikke gjettbare.
* CORS er låst til `CORS_ORIGINS` (komma-separert).
* `Reply-To` settes til kundens e-post slik at firma-supporten kan svare direkte uten å lekke
  Resend-fra-adressen.
* Husk å rate-limite `/p/{uuid}/support` (f.eks. via Cloudflare WAF) før produksjon.
