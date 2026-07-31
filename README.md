# Event-Driven Order Processing on AWS

A serverless order processing system built on AWS. The project explores how event-driven architecture works in practice - how services communicate through events rather than calling each other directly, and why that makes a system easier to scale, maintain, and recover from failure.

The project runs across three weeks, with each week building on the previous week.

---

## Why event-driven

The typical approach to order processing is one function that does everything in sequence: validate, charge, update stock, send a confirmation. That works until something slows down or breaks. A slow email step holds up the whole order. A bug in inventory can roll back a payment. You are also running a server around the clock regardless of how much traffic you actually have.

With an event-driven approach, the system stores the order and fires a single event. From that point, separate services react independently. Payment does not wait on notifications. Inventory does not care what payment is doing. Each part can fail and retry on its own without taking down anything else. That independence is what this project is about.

---

## Architecture

![Architecture Diagram](images/new_architecture.png)

---

## Weekly breakdown

### Week 1 - Foundation

![Week 1 Architecture](images/new_week_one.png)

The first week focused on getting the core order flow working end to end. A customer sends a request, the system validates it, and the order lands in the database.

**What was built**

API Gateway exposes the `POST /orders` endpoint. The Order Intake Lambda receives the request, validates it, and writes the order to DynamoDB with a status of `PENDING`. IAM permissions are scoped so the Lambda can only write to that specific table.

**Quick start**

Deploy the stacks in this order from CloudShell:

```bash
# 1. DynamoDB
aws cloudformation deploy \
  --template-file infrastructure/dynamodb.yaml \
  --stack-name order-processing-db \
  --parameter-overrides Environment=dev

# 2. Lambda
aws cloudformation deploy \
  --template-file infrastructure/lambda-order-intake.yaml \
  --stack-name order-processing-lambda \
  --parameter-overrides Environment=dev DynamoDBStackName=order-processing-db \
  --capabilities CAPABILITY_NAMED_IAM

# Upload function code
zip -j order-intake.zip lambdas/order-intake/index.js
aws lambda update-function-code \
  --function-name order-intake-dev \
  --zip-file fileb://order-intake.zip

# 3. API Gateway
LAMBDA_ARN=$(aws cloudformation describe-stacks \
  --stack-name order-processing-lambda \
  --query "Stacks[0].Outputs[?OutputKey=='OrderIntakeFunctionArn'].OutputValue" \
  --output text)

aws cloudformation deploy \
  --template-file infrastructure/api-gateway.yaml \
  --stack-name order-processing-api \
  --parameter-overrides ProjectName=order-processing StageName=dev OrderIntakeFunctionArn=$LAMBDA_ARN
```

Full deployment steps and testing guide: [`docs/lambda-order-intake-deployment.md`](docs/lambda-order-intake-deployment.md)

---

### Week 2 - Event-Driven Architecture

![Week 2 Architecture](images/new_week_two.png)

The second week introduced EventBridge and transformed the system from a simple request-response flow into a proper event-driven architecture. Security foundations were also added this week.

**What was built**

EventBridge was introduced as the event bus. The Order Intake Lambda now publishes an `OrderPlaced` event after writing to DynamoDB instead of handling everything itself. Three independent consumer Lambdas were added - Payment Processing, Inventory Management, and Notification Service - each reacting to the same event and updating their own status on the order record in DynamoDB.

On the security side, Cognito handles user authentication on the API. KMS encrypts data at rest in DynamoDB. Secrets Manager holds any credentials the Lambdas need at runtime. API Gateway was configured with HTTPS enforcement, request validation, and rate limiting. CloudTrail and CloudWatch were enabled for auditing and monitoring.

**Infrastructure and code**

- Event schema: [`docs/event-schema.md`](docs/event-schema.md)
- EventBridge bus and rules: `infrastructure/eventbridge.yaml`
- Consumer Lambdas stack: `infrastructure/consumers.yaml`
- Consumer Lambda code: `lambdas/payment-processor/`, `lambdas/inventory-update/`, `lambdas/notification/`
- Auth and API security: `infrastructure/cognito.yaml`, [`docs/auth-api-security.md`](docs/auth-api-security.md)
- EventBridge deployment guide: [`docs/eventbridge-deployment.md`](docs/eventbridge-deployment.md)

---

### Week 3 - Production Readiness

![Week 3 Architecture](images/new_week_three.png)

The final week focused on resilience and hardening the system for production workloads.

**What was built**

SQS was added as a buffer between EventBridge and the Notification Lambda. Instead of EventBridge calling the Lambda directly, it now puts the event onto a queue. The Lambda reads from the queue in batches. If a message fails after three attempts, SQS moves it to a Dead Letter Queue automatically so nothing is silently lost. IAM policies were reviewed and tightened across all functions.

Amazon Inspector was enabled to continuously scan the Lambda function packages for known vulnerabilities in their dependencies. Scans run automatically whenever a new function version is deployed. AWS WAF was added to protect the API against common web attacks, and Shield Standard provides baseline DDoS protection.

**Infrastructure and code**

- SQS queue and DLQ: `infrastructure/sqs-dlq.yaml`
- Inspector enablement: `infrastructure/inspector.yaml`
- WAF + Shield notes: `infrastructure/waf.yaml`, [`docs/waf-shield.md`](docs/waf-shield.md)
- Data security wiring: CMK on DynamoDB + secrets attach on consumers (`dynamodb.yaml`, `consumers.yaml`, `data_security.yaml`)
- Updated EventBridge (routes Notification to SQS): `infrastructure/eventbridge.yaml`
- Updated consumers stack (Notification Lambda reads from SQS): `infrastructure/consumers.yaml`
- Updated Notification Lambda code: `lambdas/notification/index.js`
- IAM before/after review: [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)
- Solo finish checklist: [`docs/completion-checklist.md`](docs/completion-checklist.md)
- Full SQS/DLQ/Inspector deploy guide: [`docs/sqs-dlq-inspector-deployment.md`](docs/sqs-dlq-inspector-deployment.md)

---

## Services across all three weeks

| Week | Services added |
|---|---|
| 1 | API Gateway, Lambda, DynamoDB, IAM |
| 2 | EventBridge, Consumer Lambdas, Cognito, KMS, Secrets Manager, CloudTrail, CloudWatch |
| 3 | SQS, Dead Letter Queue, Inspector, WAF, Shield Standard |

---

## Repository structure

```
.
├── docs/
│   ├── lambda-order-intake-deployment.md
│   ├── eventbridge-deployment.md
│   ├── auth-api-security.md
│   ├── sqs-dlq-inspector-deployment.md
│   ├── event-schema.md
│   ├── PERMISSIONS.md
│   └── schemas/
│       └── order-placed.schema.json
├── images/
│   ├── new_architecture.png
│   ├── new_week_one.png
│   ├── new_week_two.png
│   └── new_week_three.png
├── lambdas/
│   ├── order-intake/
│   │   └── index.js
│   ├── payment-processor/
│   │   └── index.js
│   ├── inventory-update/
│   │   └── index.js
│   └── notification/
│       └── index.js
└── infrastructure/
    ├── dynamodb.yaml
    ├── lambda-order-intake.yaml
    ├── api-gateway.yaml
    ├── eventbridge.yaml
    ├── consumers.yaml
    ├── sqs-dlq.yaml
    ├── inspector.yaml
    ├── cognito.yaml
    ├── data_security.yaml
    ├── observability.yaml
    ├── team-access.yaml
    └── parameters.example.txt
```

---

## Challenges

We will update this section as and when we face challenges with the project.
