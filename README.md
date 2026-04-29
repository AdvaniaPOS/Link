# Tagly

Multi-tenant Digital Product Pass system. Skann en QR-kode på en fysisk enhet → kunden får en
merkevarestylet side med produktinfo og et kontaktskjema som ruter e-posten til riktig firma via
**Resend**. Bak QR-koden ligger et komplett admin-portal for utstyrsregister, kataloger,
brukere/roller og support-kø.

> **Produksjon:** `https://tagly.poshub.no` (Cloudflare Tunnel → nginx → uvicorn på :18000).
> Det gamle `betala.link`-domenet er deprecated.

## Stack

| Lag       | Teknologi                                                       |
| --------- | --------------------------------------------------------------- |
| Backend   | FastAPI 0.136 · SQLAlchemy 2 · Alembic · SQLite (prod) / Postgres (compose) |
| Kø        | Celery · Redis (kan kjøres `CELERY_EAGER=true` i dev)           |
| Auth      | PyJWT (HS256) · bcrypt · pyotp (TOTP/2FA) · slowapi (rate limit) |
| E-post    | Resend (Python SDK), verifisert avsender `no-reply@poshub.no`   |
| Frontend  | React 18 · Vite · TypeScript · TailwindCSS · `qrcode.react`     |
| Infra     | systemd (`tagly-backend.service`) · nginx · Cloudflare Tunnel   |

## Funksjonsoversikt

### Offentlig (uten innlogging)
- `GET /p/{asset-uuid}` — kundevisning av en enhet (firmabranding, produktinfo, tilbehør, evt. video).
- `POST /p/{asset-uuid}/support` — kundekontakt-skjema → Ticket → Resend-mail til firmaets support.
- `POST /api/auth/forgot-password` — sender reset-lenke (alltid 204, ingen info-leak).
- `POST /api/auth/reset-password` — bytter passord via engangs-token.

### Admin-portal (`/admin`)
| Side | Rolle | Funksjon |
|---|---|---|
| `LoginPage` | alle | E-post + passord + valgfri TOTP. Lockout etter `LOCKOUT_MAX_ATTEMPTS`. |
| `ForgotPasswordPage` / `ResetPasswordPage` | alle | Selvbetjent passord-reset via Resend-mail. |
| `DashboardPage` | innlogget | Nøkkeltall per aktiv firm. |
| `ScanPage` | firm_admin+ | Quick-scan QR → hopp til riktig asset. |
| `QuickRegisterPage` | firm_admin+ | Hurtigregistrering av nytt utstyr fra QR. |
| `AssetsPage` | firm_admin+ | Utstyrsregister (CRUD, søkefilter, lokasjon, tilbehør). |
| `LocationsPage` | firm_admin+ | Lokasjoner per firma. |
| `AccessoriesPage` | firm_admin+ | Tilbehør koblet til assets. |
| `ProductsPage` | firm_admin+ | Firmaets produkter (instans av katalog). |
| `CatalogPage` | super_admin / firma-eier | Felles produkt­katalog. |
| `TicketsPage` | firm_admin+ | Support-henvendelser, søkefilter, status, eskalering. |
| `FirmsPage` | super_admin | Firmaer + branding (logo, farge, support-mail). |
| `UsersPage` | super_admin / firm_admin | Brukere + roller + medlemskap i flere firmaer. |
| `ProfilePage` | innlogget | Eget passord + TOTP-oppsett. |
| `AuditLogsPage` | super_admin | Audit-spor for sensitive handlinger. |
| `AdminLabels` | firm_admin+ | Skriv ut 12 mm Brother P-touch QR-etiketter. |

### Roller
- `super_admin` — alt på tvers av firmaer.
- `firm_admin` — full kontroll i sitt firma + medlemskaps-firmaer.
- `firm_user` — lesetilgang + ticket-håndtering.

### Bakgrunnsjobber (Celery)
- `send_resend_email` — sender ticket-mail med retry/backoff (maks 5 forsøk).
- `send_password_reset_email` — sender reset-lenke.

## Mappestruktur

```
backend/
  app/
    api/                # auth, users, firms, catalog, products, assets,
                        # accessories, locations, memberships, tickets,
                        # public, admin
    models/             # Firm, User, ProductCatalog, FirmProduct, Asset,
                        # Accessory, Ticket, AuditLog, PasswordResetToken
    workers/            # Celery app + send_resend_email + send_password_reset_email
    auth.py, security.py, rate_limit.py, request_context.py
    config.py, database.py, main.py, schemas.py
  alembic/              # migrasjoner (linje: 7b3a1f8c4e2d → 9d4e2c1a7b50 → a1b2c3d4e5f6)
  scripts/dev_seed.py   # seeder demo-firma + super_admin
deploy/
  tagly-backend.service # systemd-unit
  README.md             # prod-runbook
frontend/
  src/
    admin/              # hele admin-portalen (se tabell over)
    pages/              # ProductPage (offentlig kundevisning), AdminLabels
    components/         # Label.tsx (12mm Brother P-touch PT-2100), SupportForm.tsx
docker-compose.yml      # Postgres + Redis (kun for dev)
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
* `TrustedHostMiddleware` er låst til `TRUSTED_HOSTS`.
* JWT (HS256) signert med `JWT_SECRET` (≥32 bytes anbefalt).
* Passord hashet med bcrypt; valgfri TOTP/2FA per bruker.
* Login-lockout etter `LOCKOUT_MAX_ATTEMPTS` (default 7) i `LOCKOUT_MINUTES` (default 15).
* `slowapi` rate-limiter både `/p/{uuid}/support` og auth-endepunkter.
* `Reply-To` settes til kundens e-post slik at firma-supporten kan svare direkte uten å lekke
  Resend-fra-adressen.
* Audit-log skriver alle sensitive handlinger (login, passord-bytte, rolle-endringer).
* nginx i prod sender HSTS (`max-age=31536000; includeSubDomains`), strict CSP, X-Frame-Options DENY,
  X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin.

## Drift i produksjon

Detaljert runbook ligger i [deploy/README.md](deploy/README.md). Kort versjon:

```bash
# Deploy etter en commit
cd ~/Link && git pull
cd backend && source .venv/bin/activate && alembic upgrade head
cd ../frontend && npm ci && npm run build
sudo systemctl restart tagly-backend
sudo systemctl status tagly-backend --no-pager | head -5
curl -s https://tagly.poshub.no/api/health
```

Logger:

```bash
sudo journalctl -u tagly-backend -n 100 --no-pager
sudo journalctl -u tagly-backend -f          # følg live
```

## Backup

SQLite ligger som én fil på prod: `/home/poshubadmin/Link/backend/tagly.db` (+ `*-wal` / `*-shm`
ved aktiv WAL). Daglig snapshot via cron som beholder 30 dager:

```bash
mkdir -p ~/backups
crontab -e
```

Legg til (én linje):

```
0 3 * * * cp -a /home/poshubadmin/Link/backend/tagly.db /home/poshubadmin/backups/tagly-$(date +\%F).db && find /home/poshubadmin/backups -name 'tagly-*.db' -mtime +30 -delete
```

> `cp -a` er trygt mot en levende SQLite i WAL-modus for *snapshot*-bruk; for 100 % konsistent
> backup mens skriving pågår, bruk `sqlite3 tagly.db ".backup /path/til/tagly-YYYY-MM-DD.db"`
> i stedet.

Manuell on-demand backup:

```bash
sqlite3 ~/Link/backend/tagly.db ".backup ~/backups/tagly-manual-$(date +%F-%H%M).db"
```

Restore:

```bash
sudo systemctl stop tagly-backend
cp ~/backups/tagly-2026-04-28.db ~/Link/backend/tagly.db
rm -f ~/Link/backend/tagly.db-wal ~/Link/backend/tagly.db-shm
sudo systemctl start tagly-backend
```

Last også ned backup-mappen utenfor serveren regelmessig (rsync til en arbeidsstasjon eller
opplasting til S3/B2/Azure Blob). Cron-en over beskytter mot uhell, ikke mot tap av maskinen.

Filer som også bør sikkerhetskopieres:
- `~/Link/backend/.env` (inneholder `JWT_SECRET`, `RESEND_API_KEY`).
- `~/Link/backend/uploads/` (kundens vedlegg fra support-skjemaet).
