# FreshBasket frontend

Angular 20 SPA for the event-driven grocery checkout demo.

## Live URL

**https://main.d1lubsio53fudu.amplifyapp.com**

Amplify app id: `d1lubsio53fudu` (us-east-1). Hosting uses Amplify + CloudFront HTTPS.

### Demo login (Cognito + SES)

| Field | Value |
| --- | --- |
| Email | `ntinyaribelinda@gmail.com` |
| Password | `DemoPass1!` |

Sign out first if you still have an old local session, then sign in with that account, place an order, and check your inbox for the FreshBasket confirmation (SES).

Other emails only work for SES delivery after you verify them in Amazon SES (sandbox rule).

## Run locally

```bash
cd frontend
npm install
npm start
```

Open http://localhost:4200

Demo account (placeholder auth): any email + password (6+ characters).

## Connect to live API Gateway

In `src/environments/environment.ts` (or development):

```ts
useLiveApi: true,
apiBaseUrl: 'https://YOUR_API.execute-api.us-east-1.amazonaws.com/dev',
```

Replace placeholder `AuthService` with Cognito (Amplify Auth or `initiate-auth`) using the pool/client IDs already in the environment file.

## Deployment story (Amplify Hosting + CloudFront)

Primary path for this project:

```
Browser
  → AWS Amplify Hosting (CI/CD + static hosting)
    → Amazon CloudFront (CDN Amplify attaches: HTTPS, edge cache)
      → FreshBasket Angular SPA
        → App calls API Gateway
          → Lambda / EventBridge / SQS / DynamoDB
```

Amplify is how we **host** the website. CloudFront is the **CDN** Amplify puts in front of it (lower latency, HTTPS, caching, global edge). The order API is a separate origin (API Gateway)—not routed through Amplify.

### Deploy with Amplify Console

1. Push the repo (or this `frontend/` app) to GitHub.
2. Amplify Console → **Host web app** → connect the repo.
3. Set the app root to `frontend` (monorepo).
4. Build settings:

```yaml
version: 1
applications:
  - appRoot: frontend
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: dist/frontend/browser
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
```

5. Add SPA rewrite: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>` → `/index.html` (200), or use Amplify’s “Rewrites and redirects” SPA template.
6. After deploy, copy the Amplify/CloudFront URL into `environment.amplify.appUrl` / `cloudFront.distributionDomain`.

### Optional: Amplify CLI

```bash
cd frontend
npx amplify configure   # once per machine
# Hosting → Amplify Hosting (or connect via Console as above)
```

## Judge walkthrough

1. Landing — business problem + resilient checkout  
2. Shop → cart → checkout  
3. Order success — **Event Timeline** (EventBridge fan-out)  
4. Architecture — Amplify Hosting → CloudFront → API pipeline  
5. Admin — ops view of orders  
