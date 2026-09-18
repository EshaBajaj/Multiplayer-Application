# Cloud Deployment & DevOps Guide: AWS, GCP & Docker

This document outlines the cloud deployment architecture and procedures for the **ROXSTAR Audio Engine & Multiplayer Elimination Platform** (Section E).

---

## 1. Containerization Architecture

The ROXSTAR backend is packaged as an optimized, multi-stage Alpine Docker container:
- **Base image:** `node:20-alpine`
- **Builder stage:** Compiles native extensions with `g++` and `make`, resolves dependencies, then trims development packages via `npm prune --omit=dev`.
- **Runtime stage:** Runs under least-privilege non-root `USER node`.
- **Healthcheck:** Probes `/health` every 30 seconds with automatic container restarts upon consecutive failures.

### Local Multi-Container Run
```bash
# 1. Clone repository
git clone https://github.com/ayush-init/Andriod-App.git
cd Andriod-App

# 2. Run backend & PostgreSQL with a single command
docker compose up --build -d

# 3. Check health and logs
docker compose ps
docker compose logs -f backend
```

---

## 2. Deployment on Google Cloud Platform (GCP Cloud Run)

GCP Cloud Run provides auto-scaling serverless containers with built-in WebSocket support and managed TLS/SSL certificates.

### Prerequisites:
- `gcloud` CLI installed and authenticated
- Google Cloud Artifact Registry configured

### Step 1: Build & Submit Image to Artifact Registry
```bash
# Set environment variables
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export REPO_NAME="roxstar-containers"
export IMAGE_NAME="roxstar-backend"

# Authenticate Docker with Google Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push container
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest ./backend
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest
```

### Step 2: Deploy to Cloud Run
```bash
gcloud run deploy roxstar-backend \
  --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --port 5000 \
  --min-instances 1 \
  --max-instances 10 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 3600 \
  --session-affinity \
  --set-env-vars "NODE_ENV=production,PORT=5000,DB_SSL=true" \
  --set-secrets "DATABASE_URL=ROXSTAR_DATABASE_URL:latest"
```

> [!NOTE]
> `--timeout 3600` and `--session-affinity` are critical for maintaining continuous WebSocket connections for real-time room sessions and elimination spin cycles.

---

## 3. Deployment on Amazon Web Services (AWS ECS / Fargate)

AWS Elastic Container Service (ECS) with AWS Fargate provides serverless container execution behind an Application Load Balancer (ALB).

### Architecture Overview:
1. **Application Load Balancer (ALB):** Terminates HTTPS (Port 443) using AWS Certificate Manager (ACM) SSL certificates. Supports HTTP/1.1 WebSocket upgrades with sticky sessions.
2. **AWS Fargate Service:** Runs tasks defined with CPU: 0.5 vCPU and RAM: 1 GB.
3. **AWS EFS (Elastic File System):** Mounted to `/usr/src/app/uploads` across task replicas to provide shared persistent storage for uploaded audio takes.
4. **Amazon Aurora Serverless / RDS PostgreSQL:** Relational database storage with SSL enforcement.

### Step 1: Push Image to AWS ECR
```bash
# Authenticate AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag roxstar-backend:latest <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/roxstar-backend:latest
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/roxstar-backend:latest
```

### Step 2: Fargate Task Definition Example (task-definition.json)
```json
{
  "family": "roxstar-backend-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "roxstar-backend",
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/roxstar-backend:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 5000,
          "hostPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "5000" },
        { "name": "DB_SSL", "value": "true" }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<AWS_ACCOUNT_ID>:secret:RoxstarDbUrl"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:5000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      }
    }
  ]
}
```

---

## 4. Monitoring, Logging & Reliability

- **Structured Logs:** Winston logger emits JSON logs with timestamps, request IDs, and error traces.
- **Docker Health Checks:** Monitors Node.js event loop and database connectivity via `/health`.
- **Zero-Downtime Rolling Restarts:** Kubernetes / Cloud Run / ECS ensure active WebSocket rooms drain before tasks terminate.
