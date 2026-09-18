# Cloud Deployment & Infrastructure Guide - AWS & GCP

## Option A: Google Cloud Run Deployment (Recommended for Express & WebSockets)

```bash
# 1. Authenticate with Google Cloud
gcloud auth login
gcloud config set project [YOUR_GCP_PROJECT_ID]

# 2. Build image with Cloud Build
gcloud builds submit --tag gcr.io/[YOUR_GCP_PROJECT_ID]/roxstar-backend:v1 -f infrastructure/Dockerfile .

# 3. Deploy container with environment variables
gcloud run deploy roxstar-backend \
  --image gcr.io/[YOUR_GCP_PROJECT_ID]/roxstar-backend:v1 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=5000 \
  --port 5000
```

## Option B: AWS Elastic Container Service (ECS Fargate) Deployment

```bash
# 1. Login to Amazon ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com

# 2. Build & tag Docker image
docker build -f infrastructure/Dockerfile -t roxstar-backend .
docker tag roxstar-backend:latest [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/roxstar-backend:latest

# 3. Push to ECR repository
docker push [ACCOUNT_ID].dkr.ecr.us-east-1.amazonaws.com/roxstar-backend:latest
```

## Environment Variables Configuration

| Variable Name | Production Value | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP & WebSocket server port |
| `NODE_ENV` | `production` | Enables production optimizations |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/roxstar_db` | Postgres Connection String |
| `UPLOADS_DIR` | `/app/public/uploads` | Audio draft storage folder |
