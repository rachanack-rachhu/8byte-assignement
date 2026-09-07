#!/bin/bash
# Runs ON the EC2 instance (invoked via SSH from GitHub Actions).
# Usage: deploy.sh <full-image-ref>
# Example: deploy.sh ghcr.io/yourorg/sample-todo-app:abc123

set -euo pipefail

IMAGE_REF="$1"
CONTAINER_NAME="sample-todo-app"
ENV_FILE="/opt/sample-todo-app/.env"   # holds PGHOST/PGUSER/PGPASSWORD etc. for THIS environment (staging or prod).....

echo "==> Logging into GHCR"
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

echo "==> Pulling new image: $IMAGE_REF"
docker pull "$IMAGE_REF"

echo "==> Stopping old container (if any)"
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo "==> Starting new container"
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file "$ENV_FILE" \
  "$IMAGE_REF"

echo "==> Pruning old images"
docker image prune -f

echo "==> Deployment complete: $IMAGE_REF"
