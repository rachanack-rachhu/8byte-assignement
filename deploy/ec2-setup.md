# One-time EC2 + RDS setup (manual, console-based — no Terraform)

Do this once per environment (repeat for **staging** and **production** — 2 EC2 instances total,
and either 2 small RDS instances or 2 databases on one RDS instance to save cost while learning).

## 1. Create the RDS PostgreSQL database

1. AWS Console → RDS → **Create database**
2. Engine: **PostgreSQL** (latest 16.x)
3. Template: **Free tier** (for learning) or **Dev/Test**
4. Settings:
   - DB instance identifier: `sample-app-staging-db` (and later `sample-app-prod-db`)
   - Master username: `postgres`
   - Master password: set and save it securely
5. Instance: `db.t3.micro` is fine for a demo
6. Storage: default (20 GB gp3) is fine
7. Connectivity:
   - VPC: default VPC (or your own if you have one)
   - Public access: **No** (best practice — EC2 reaches it privately inside the VPC)
   - VPC security group: create new, name it `rds-sg`
   - Availability Zone: any
8. Additional configuration: initial database name → `appdb`
9. Create database. Wait ~5–10 minutes until status is "Available".
10. Copy the **Endpoint** (e.g. `sample-app-staging-db.xxxxxx.us-east-1.rds.amazonaws.com`) — you'll need it as `PGHOST`.

Repeat for a second RDS instance/database for production (or reuse the same instance with a
second database name like `appdb_prod` if you just want to save cost while testing).

## 2. Create Security Groups

- `rds-sg` (attached to RDS): Inbound rule — PostgreSQL (5432) from **source = the EC2 security group** (`ec2-sg`), not from `0.0.0.0/0`.
- `ec2-sg` (attached to EC2 instances): Inbound rules —
  - SSH (22) from **your IP only**
  - HTTP (80) from anywhere (if using a load balancer/ALB in front) — otherwise
  - Custom TCP (3000) from anywhere, or better, from the ALB's security group only.

This is the "appropriate rules" version of what Terraform would otherwise encode.

## 3. Launch EC2 instances (repeat for staging and production)

1. EC2 → **Launch instance**
2. Name: `sample-app-staging` (then `sample-app-prod`)
3. AMI: Amazon Linux 2023
4. Instance type: `t3.micro` (free tier eligible)
5. Key pair: create/download a new key pair (or reuse one) — you'll paste this into
   the GitHub secret `EC2_SSH_PRIVATE_KEY`
6. Network settings: same VPC as your RDS, **public subnet** (so GitHub Actions can SSH into it),
   security group: `ec2-sg`
7. Advanced → User data (bootstraps Docker automatically on first boot):

```bash
#!/bin/bash
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /opt/sample-todo-app
```

8. Launch. Note the instance's **Public IPv4 address** — this becomes
   `STAGING_EC2_HOST` or `PROD_EC2_HOST` in GitHub secrets.

## 4. Put the per-environment DB config on each EC2 instance

SSH into the instance once manually:

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
sudo mkdir -p /opt/sample-todo-app
sudo tee /opt/sample-todo-app/.env > /dev/null << 'ENVEOF'
PGHOST=<RDS_ENDPOINT_FOR_THIS_ENV>
PGPORT=5432
PGUSER=postgres
PGPASSWORD=<the master password you set>
PGDATABASE=appdb
PGSSLMODE=require
PORT=3000
ENVEOF
```

Copy `deploy/deploy.sh` onto the box too (or let the first CD run do it — but simplest is
to copy it manually once):

```bash
scp -i your-key.pem deploy/deploy.sh ec2-user@<EC2_PUBLIC_IP>:/opt/sample-todo-app/deploy.sh
```

That's it — from here on, GitHub Actions handles every future deploy by SSH-ing in and
running `deploy.sh <new-image>`.

## 5. (Optional) Put a Load Balancer in front

1. EC2 → Load Balancers → Create **Application Load Balancer**
2. Listeners: HTTP 80 → forward to a target group pointing at port 3000 on your EC2 instance(s)
3. Health check path: `/health`
4. Point your domain (Route 53 or elsewhere) at the ALB's DNS name.

This gives you a stable URL/HTTPS termination point instead of hitting the EC2 public IP directly,
and lets you later add a second EC2 instance per environment for zero-downtime rolling deploys.
