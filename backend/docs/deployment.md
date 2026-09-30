# Deployment

Target setup: a single Ubuntu VPS running Docker Compose. 2 vCPU / 4 GB RAM / 60 GB SSD is enough to start. The stack is `docker-compose.yml`: nginx, web, api, postgres, the migrate one-shot, the OTel collector, Tempo, Prometheus and Grafana, plus optional Loki and Promtail. GitHub Actions builds the images, pushes them to GHCR and deploys over SSH.

## Server prerequisites

```bash
# Ubuntu 22.04/24.04
sudo apt-get update && sudo apt-get install -y ca-certificates curl rsync ufw awscli
curl -fsSL https://get.docker.com | sudo sh          # Docker Engine + compose plugin
sudo adduser --disabled-password deploy && sudo usermod -aG docker deploy
sudo mkdir -p /opt/cholo && sudo chown deploy:deploy /opt/cholo

# firewall: only SSH + HTTP(S)
sudo ufw default deny incoming && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable

# docker log rotation is set per service in compose; also cap the daemon default:
echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

Add the deploy public key to `/home/deploy/.ssh/authorized_keys`. The matching private key goes into the `SSH_KEY` secret.

## GitHub configuration

### Secrets (Settings → Secrets and variables → Actions, preferably scoped to the environment)

| Secret | Required | Value |
|---|---|---|
| `SSH_HOST` | ✅ | Server IP or hostname |
| `SSH_USER` | ✅ | `deploy` |
| `SSH_KEY` | ✅ | Private key (ed25519) for `SSH_USER` |
| `SSH_PORT` | – | Defaults to 22 |
| `SSH_KNOWN_HOSTS` | recommended | Output of `ssh-keyscan -p <port> <host>`. Without it the workflow keyscans on every run (trust on first use). |
| `DEPLOY_PATH` | ✅ | `/opt/cholo` |
| `PROD_ENV_FILE` | ✅ | The whole production `.env`: copy `.env.example` and fill every `change-me`. The workflow overrides `API_IMAGE`, `WEB_IMAGE`, `IMAGE_TAG` and `DEPLOY_ENV`. |
| `GHCR_PULL_TOKEN` | recommended | Classic PAT with `read:packages`, so the server can re-pull images after the job's `GITHUB_TOKEN` expires |
| `GHCR_PULL_USER` | with the PAT | GitHub username that owns the PAT |

Pushing images uses the built-in `GITHUB_TOKEN`. The workflow declares `permissions: packages: write`, so no extra secret is needed. After the first push, open each package (`cholo-api`, `cholo-web`) on GitHub and either link it to the repository or keep it private.

### Variables

| Variable | Example |
|---|---|
| `PUBLIC_URL` | `https://cholo.shop` (smoke test and environment URL) |
| `NEXT_PUBLIC_API_URL` | `/api` (baked into the web image) |

### Environments

Create a **`production`** environment (and optionally `staging`) under Settings → Environments. Add **Required reviewers**, so every production deploy waits for approval, and restrict deployment branches to `main`.

## First deploy

1. Point DNS for `DOMAIN` (and `www`) at the server.
2. Fill `PROD_ENV_FILE`. Keep `NGINX_MODE=http` for now. Generate secrets with `openssl rand -base64 48 | tr -d '/+=' | cut -c1-48`, and keep passwords URL-safe because they are embedded in `DATABASE_URL`.
3. Push to `main`, or run **Deploy** manually (Actions → Deploy → Run workflow). The pipeline:
   * runs CI (`ci.yml` via `workflow_call`)
   * builds and pushes `ghcr.io/<owner>/cholo-api` and `cholo-web` tagged `sha-<7>` and `latest`
   * waits for environment approval
   * rsyncs `docker-compose.yml` and `ops/` and writes `.env`
   * logs the server in to GHCR
   * runs `ops/deploy/remote-deploy.sh <tag>`, which pulls, runs `migrate`, runs `up -d --remove-orphans`, waits for `api /health/ready`, `web` and `nginx`, and rolls back on failure
   * smoke-tests `PUBLIC_URL/api/v1/health/ready`
4. Seed the reference data once. In production the OWNER password comes from `ADMIN_BOOTSTRAP_PASSWORD`, and no demo customer is created unless `SEED_DEMO_USERS=true`.

   ```bash
   ssh deploy@server 'cd /opt/cholo && docker compose --profile seed run --rm seed'
   ```

5. Log in to `/admin` and **change the OWNER password**.
6. Enable TLS (next section).

## TLS

**Option A: certbot with the webroot plugin** (the ACME challenge path is already served by nginx):

```bash
cd /opt/cholo
docker run --rm -v "$PWD/ops/nginx/certs:/etc/letsencrypt" -v cholo_certbot-webroot:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot -d cholo.shop -d www.cholo.shop \
  --email ops@cholo.shop --agree-tos --no-eff-email
# → ops/nginx/certs/live/cholo.shop/{fullchain,privkey}.pem
```

Then set `NGINX_MODE=https` in `PROD_ENV_FILE` (and `GRAFANA_COOKIE_SECURE=true`) and redeploy, or edit `.env` on the server and run `docker compose up -d nginx`. The https template redirects HTTP to HTTPS, sends HSTS, uses TLS 1.2/1.3 and OCSP stapling, and enables HTTP/2.

Renewal, from the deploy user's crontab:

```cron
0 4 * * 1 cd /opt/cholo && docker run --rm -v "$PWD/ops/nginx/certs:/etc/letsencrypt" -v cholo_certbot-webroot:/var/www/certbot certbot/certbot renew --quiet && docker compose exec -T nginx nginx -s reload
```

The deploy rsync excludes `ops/nginx/certs/`, so certificates survive deploys.

**Option B: Cloudflare in front** (proxied DNS with "Full (strict)" and an origin certificate in `ops/nginx/certs/live/<domain>/`), or plain `NGINX_MODE=http` behind a load balancer that terminates TLS.

## Operations

| Task | Command (in `/opt/cholo`) |
|---|---|
| Status | `docker compose ps` |
| Logs | `docker compose logs -f --tail=200 api` |
| Shell into the DB | `docker compose exec postgres psql -U cholo cholo` |
| Grafana | `https://<domain>/grafana/`, or `ssh -L 3001:127.0.0.1:3001 deploy@server` then http://localhost:3001 |
| Prometheus / Tempo (internal only) | `ssh -L 3001:…` and use them through Grafana Explore |
| Logs pipeline | `docker compose --profile logs up -d` |
| Scale the API | `docker compose up -d --scale api=2` (nginx and Prometheus find the replicas through Docker DNS) |

## Backups

`ops/backup/pg-backup.sh` writes a compressed `pg_dump -Fc` to `backups/`, checks it with `pg_restore --list`, writes a sha256 file, uploads to S3-compatible object storage when `BACKUP_S3_URI` is set (Cloudflare R2, Backblaze B2 or AWS S3; set `BACKUP_S3_ENDPOINT` for non-AWS providers), and keeps `BACKUP_KEEP_DAYS` days locally.

Nightly cron for the deploy user:

```cron
15 3 * * * cd /opt/cholo && ./ops/backup/pg-backup.sh >> /var/log/cholo-backup.log 2>&1
```

On the bucket side, turn on versioning or object lock and add a lifecycle rule (e.g. keep 30 daily and 12 monthly backups). Use an access key that can only write to that bucket.

### Restore drill (monthly; write down the result)

```bash
aws s3 cp s3://bucket/cholo/cholo-YYYYmmdd-HHMMSS.dump backups/ ${BACKUP_S3_ENDPOINT:+--endpoint-url $BACKUP_S3_ENDPOINT}
./ops/backup/pg-restore.sh backups/cholo-YYYYmmdd-HHMMSS.dump      # restores into cholo_restore_check
```

The script prints row counts and the latest order. Compare them with production, then drop `cholo_restore_check`.

**A real restore:** stop the writers (`docker compose stop api web`), run `TARGET_DB=cholo ./ops/backup/pg-restore.sh <file>` (it asks you to type the database name), then `docker compose up -d`.

The targets are an RPO of 24 hours (tighten it with WAL archiving via pgBackRest or WAL-G if needed) and an RTO under 30 minutes.

## Zero-downtime notes

* Compose's `up -d` recreates `api` and `web` in place, which causes a few seconds of 502s. nginx retries once on the next upstream (`proxy_next_upstream`). For true zero downtime, run `--scale api=2` and recreate one replica at a time, or put the stack behind a blue/green pair of compose projects.
* **Migrations must be backwards compatible**, because the previous image version keeps running until the new one is healthy, and a rollback runs the old code on the new schema. Use **expand → migrate data → contract**:
  * add columns as nullable or with a default
  * backfill in a later deploy
  * drop or rename a column only after no running version reads it
  * create large indexes with `CREATE INDEX CONCURRENTLY` in a separate migration
* The API stops gracefully: `enableShutdownHooks`, `stop_grace_period: 30s`, and `tini` forwarding SIGTERM, so in-flight requests finish and telemetry is flushed.
* Health probes: `/api/v1/health/live` (the process is up; used by the Docker HEALTHCHECK) and `/api/v1/health/ready` (database reachable and heap sane; used by the deploy gate and the smoke test).

## Rollback

* **Automatic.** When `remote-deploy.sh` sees failed health checks within `HEALTH_TIMEOUT` (180s), it switches `IMAGE_TAG` back to the previous tag in `.deploy/current_tag`, restarts `api`, `web` and `nginx`, and fails the workflow. `.deploy/history` keeps the log.
* **Manual.** Actions → **Deploy** → Run workflow with `image_tag=sha-abc1234`. This skips CI and the build and deploys that existing image. Old images are kept for 10 days (`image prune --filter until=240h`).
* **On the server:** `./ops/deploy/remote-deploy.sh sha-abc1234`
* A migration is never rolled back automatically. If a migration itself is the problem, write a new forward migration. As a last resort, restore from backup.
