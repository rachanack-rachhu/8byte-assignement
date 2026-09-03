# Sample Todo App — EC2 + RDS + GitHub Actions CI/CD

A minimal, real, cloneable app you can use to practice the full flow:
**clone → run locally against Postgres → containerize → CI tests on PR →
CD builds/pushes/deploys to staging → manual approval → deploy to production (EC2 + RDS)**.

No Terraform — infrastructure is created manually via the AWS Console (see `deploy/ec2-setup.md`),
and application deployment is automated entirely through GitHub Actions + SSH.

## What's in this repo

```
sample-app-rds/
├── app/                        # The application itself
│   ├── src/
│   │   ├── index.js            # Express server + /health endpoint
│   │   ├── db.js                # Postgres connection pool (env-var driven)
│   │   └── routes/todos.js      # CRUD API used to prove DB read/write works
│   ├── tests/todos.test.js      # Integration tests (hit a real Postgres)
│   ├── Dockerfile               # Multi-stage, non-root, with HEALTHCHECK
│   └── package.json
├── docker-compose.yml          # Local dev: app + Postgres
├── .env.example
├── deploy/
│   ├── ec2-setup.md             # Manual, step-by-step: create RDS + EC2 + security groups
│   └── deploy.sh                 # Script GitHub Actions runs ON the EC2 box to roll out a new image
└── .github/workflows/
    ├── ci.yml                    # Runs on every PR: lint, tests, npm audit, Trivy container scan
    └── cd.yml                    # Runs on merge to main: build/push image → deploy staging → manual approval → deploy prod
```

## 1. Run it locally first (sanity check)

```bash
git clone <your-fork-url> sample-app-rds
cd sample-app-rds
docker compose up --build
# in another terminal:
curl http://localhost:3000/health
curl -X POST http://localhost:3000/todos -H "Content-Type: application/json" -d '{"title":"hello"}'
curl http://localhost:3000/todos
```

If you see the todo come back, the app + Postgres wiring works. This is exactly the same
code path that will run against RDS in staging/production — only the `PGHOST`/`PGSSLMODE`
env vars change.

## 2. Provision AWS infrastructure (manual, no Terraform)

Follow `deploy/ec2-setup.md` top to bottom. At the end you will have:

- 1 RDS PostgreSQL instance (or 2, one per environment)
- 2 EC2 instances: `sample-app-staging`, `sample-app-prod`, each running Docker
- Security groups: `ec2-sg` (SSH from you, app port from ALB/anywhere) and `rds-sg` (5432 only from `ec2-sg`)
- `/opt/sample-todo-app/.env` on each EC2 box with that environment's RDS endpoint/credentials
- `/opt/sample-todo-app/deploy.sh` copied onto each box (from `deploy/deploy.sh`)

## 3. Configure GitHub

### Repo secrets (Settings → Secrets and variables → Actions → New repository secret)
| Secret | Value |
|---|---|
| `EC2_SSH_USER` | `ec2-user` |
| `EC2_SSH_PRIVATE_KEY` | contents of the `.pem` key you created for the EC2 instances |
| `SLACK_BOT_TOKEN` | Slack app bot token (or remove the Slack steps if you don't want this) |
| `SLACK_CHANNEL_ID` | Slack channel ID to notify |

(`GITHUB_TOKEN` for pushing to GHCR is provided automatically — nothing to configure.)

### GitHub Environments (Settings → Environments)
Create two environments — this is what gives you the manual-approval gate for production:

1. **staging**
   - Environment secret: `STAGING_EC2_HOST` = staging EC2 public IP
   - No required reviewers (auto-deploys on every merge to main)
2. **production**
   - Environment secret: `PROD_EC2_HOST` = production EC2 public IP
   - ✅ Check **"Required reviewers"** and add yourself/your team
   - This is the actual manual approval step — the `deploy-production` job in `cd.yml`
     will pause and wait for someone to click **Approve** in the Actions tab before it runs.

## 4. The pipeline flow

```
PR opened  ──▶  ci.yml
                 ├─ lint + unit/integration tests (against a Postgres service container)
                 ├─ npm audit (dependency vulnerabilities)
                 └─ Trivy scan of the built Docker image
                 (Slack notification if any job fails)

PR merged
to main    ──▶  cd.yml
                 ├─ build-and-push: build image → Trivy scan → push to GHCR
                 ├─ deploy-staging: SSH into staging EC2, run deploy.sh, health-check /health
                 ├─ ⏸ waits for manual approval (GitHub "production" environment reviewer)
                 └─ deploy-production: SSH into prod EC2, run deploy.sh, health-check /health
                 (Slack notification on every failure, and on successful prod deploy)
```

## 5. Making a change end-to-end

```bash
git checkout -b feature/add-priority-field
# edit app/src/routes/todos.js, add a test in app/tests/todos.test.js
git push origin feature/add-priority-field
# open a PR -> ci.yml runs automatically
# merge PR -> cd.yml builds, pushes, deploys to staging automatically
# go to the Actions tab -> approve the "production" environment job when ready
```

## Swapping pieces later

- **Registry**: swap GHCR for Amazon ECR by changing the `docker/login-action` step in `cd.yml`
  to `aws-actions/amazon-ecr-login@v2` and updating `REGISTRY`/`IMAGE_NAME`.
- **Compute**: replace the SSH-to-EC2 deploy steps with an ECS `aws ecs update-service --force-new-deployment`
  step if you move to ECS/Fargate later — the rest of the pipeline (test → scan → push → staging → approval → prod) stays identical.
- **Infra as code**: once you're comfortable with the manual flow, this whole `ec2-setup.md`
  procedure is exactly what a Terraform module would encode (VPC, subnets, RDS, security groups, EC2, ALB) —
  happy to generate that version too whenever you want it.
