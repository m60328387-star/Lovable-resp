# Deploy Weaver on your own Contabo VPS (or any other server)

This folder contains a full production Docker stack for running Weaver independently of Lovable.

## What you get

- `weaver-app` — the TanStack Start app built for Node.js.
- `weaver-db` — local Postgres (optional; you can keep Supabase for now and migrate later).
- `weaver-executor` — remote command executor for running npm/build/test commands.
- `weaver-nginx` — reverse proxy with automatic HTTPS via Let's Encrypt.

## Required VPS specs

- Ubuntu 22.04/24.04 (or any Linux with Docker & Docker Compose).
- 2 vCPU / 4 GB RAM minimum.
- 40 GB disk minimum.

## Quick start

1. **Add the SSH public key** to your server so this workspace can deploy:

   ```bash
   # On the server (as root or a sudo user)
   mkdir -p ~/.ssh
   echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP+y1TY3W+cx6LvMtH6jRADdvHf20SNILTbVoFohp30W weaver-deploy@lovable" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   chmod 700 ~/.ssh
   ```

2. **Install Docker & Docker Compose** on the server:

   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. **Copy this folder to the server** and configure it:

   ```bash
   scp -r deploy weaver@194.163.155.52:/opt/weaver
   ssh weaver@194.163.155.52
   cd /opt/weaver/deploy
   cp .env.example .env
   nano .env            # fill in secrets, domain, email
   docker compose up -d --build
   ```

4. **Point your domain** to `194.163.155.52` and wait for Let's Encrypt.

## First run

The first time the app starts, it expects the Supabase variables to be present in `.env`.
If you want to migrate fully to local Postgres, run the migration after the stack is up:

```bash
docker compose exec db psql -U weaver -d weaver -f /docker-entrypoint-initdb.d/01-schema.sql
```

## Useful commands

```bash
# View logs
docker compose logs -f app

# Restart after update
docker compose up -d --build

# Run a shell inside the app container
docker compose exec app sh

# Update the executor token in the database, then restart the executor
docker compose restart executor
```

## أمان قاعدة البيانات (كونتابو = المصدر الأساسي)

- قاعدة Postgres تعمل داخل Docker فقط، بلا منفذ منشور على الإنترنت (`db:5432` داخلياً فقط).
- حاوية `backup` تأخذ نسخة `pg_dump` مضغوطة كل 24 ساعة إلى `/opt/weaver/backups`
  مع الاحتفاظ بآخر 14 يوماً والتحقق من سلامة كل ملف (`gzip -t`).
- كل عملية نشر تأخذ نسخة `pre-deploy-*.sql.gz` قبل أي تغيير، ومجلد `backups`
  محميّ من التنظيف أثناء النشر.
- الاسترجاع: `bash /opt/weaver/deploy/db/restore.sh` (آخر نسخة) أو مع اسم ملف محدد.
  يأخذ نسخة أمان `pre-restore-*` قبل التنفيذ.
- في الإنتاج لا يوجد رجوع صامت إلى Lovable Cloud: إن غاب `DATABASE_URL` يفشل التطبيق بوضوح.
- `/api/public/health` يعرض عمر آخر نسخة احتياطية (`backup.ageHours`, `backup.stale`).
- `deploy/.env` بصلاحيات `600` ومجلد النسخ `700`.

### تنزيل نسخة إلى جهازك
```
scp -i <key> root@194.163.155.52:/opt/weaver/backups/latest.sql.gz ./
```
