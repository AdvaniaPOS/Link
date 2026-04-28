# Production deployment notes

## Backend service (systemd)

See `betala-backend.service`. Install once, then `systemctl restart betala-backend` after each deploy. This replaces the brittle `nohup uvicorn ... &` pattern.

## HSTS (when fronted by HTTPS)

Once the site is reachable only over HTTPS (Cloudflare, Caddy, or nginx with a TLS cert), add to the server block:

```
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

Do **not** add HSTS while the site is still served over plain HTTP — clients who got the header would lose access.

## Database backups

SQLite at `~/Link/backend/betala.db`. Daily snapshot via cron:

```
0 3 * * * cp -a /home/poshubadmin/Link/backend/betala.db /home/poshubadmin/backups/betala-$(date +\%F).db && find /home/poshubadmin/backups -name 'betala-*.db' -mtime +30 -delete
```

## Required env vars

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | At least 32 random bytes (e.g. `openssl rand -hex 32`) |
| `DATABASE_URL` | `sqlite:////home/poshubadmin/Link/backend/betala.db` |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` | Verified sender |
| `PUBLIC_BASE_URL` | `https://tagly.poshub.no` (used for password-reset links + QR codes) |
| `LOCKOUT_MAX_ATTEMPTS` | optional (default 7) |
| `LOCKOUT_MINUTES` | optional (default 15) |
| `PASSWORD_RESET_MINUTES` | optional (default 60) |

After updating `.env`: `sudo systemctl restart betala-backend`.

## Running migrations on prod

```
cd ~/Link/backend
source .venv/bin/activate
alembic upgrade head
sudo systemctl restart betala-backend
```
