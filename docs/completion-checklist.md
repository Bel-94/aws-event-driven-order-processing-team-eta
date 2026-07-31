# Path to completion — solo finish checklist

Use this when you are driving the remaining Week 3 work yourself.

## 1. Code on branch `bel-week3-finish` (this PR)

- [x] WAF + Shield notes (`infrastructure/waf.yaml`, `docs/waf-shield.md`)
- [x] DynamoDB CMK wiring (`UseCustomerManagedKey`)
- [x] Consumers attach secrets policy + env secret ARNs
- [x] Payment/Notification load secrets at runtime
- [x] IAM before/after review (`docs/PERMISSIONS.md`)

Merge this branch to `main` before a clean deploy.

## 2. Deploy order

```text
data_security
  -> dynamodb          (UseCustomerManagedKey=true)
  -> cognito
  -> sqs-dlq
  -> consumers         (AttachSecretsPolicy=true, needs data_security + sqs)
  -> eventbridge       (needs consumer ARNs + sqs)
  -> lambda-order-intake
  -> api-gateway       (needs lambda + cognito)
  -> waf               (needs api id + stage)
  -> observability     (optional / anytime after lambdas exist)
  -> inspector         (anytime; CAPABILITY_NAMED_IAM)
```

Guides:

- `docs/eventbridge-deployment.md`
- `docs/auth-api-security.md`
- `docs/sqs-dlq-inspector-deployment.md`
- `docs/waf-shield.md`

## 3. Upload Lambda code (with node_modules)

Order intake, payment, inventory, notification — `npm install --omit=dev` then zip `index.js` + `node_modules`.

## 4. E2E proof

1. Cognito token → `POST /orders` → 201  
2. DynamoDB shows payment / inventory / notification statuses  
3. Break Notification → message lands in DLQ  
4. Show WAF association + CloudWatch dashboard + Inspector console  

## 5. Presentation

Problem → live happy path → DLQ failure → security controls (Cognito, WAF, KMS/Secrets, IAM before/after, Inspector) → tradeoffs / next steps.
