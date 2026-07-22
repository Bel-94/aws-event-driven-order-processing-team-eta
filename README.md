# Event-Driven Order Processing on AWS

A serverless, event-driven order processing system built on AWS. The goal is to understand how real-world systems decouple work using events instead of direct, sequential function calls — without needing to manage any servers.


---

## The Problem

Traditional order processing is often built as one big application: a customer places an order, and a single server does everything in sequence — validate the order, charge the card, update inventory, send a confirmation — all in one function call.

This creates a few common problems:

- **Slow response times** — the customer waits on every step, even slow ones like sending an email
- **Fragile failures** — if one step breaks (e.g. inventory update), the whole transaction can fail or need complex rollback logic
- **Wasted cost** — a server has to keep running 24/7 even if there are only a handful of orders a day
- **Poor scaling** — scaling means scaling the *entire* app, even if only one part (like payments) is under load

## The Solution: Event-Driven Architecture

Instead of one process doing everything, an order triggers an **event**. Independent components ("consumers") listen for that event and each do their own job — without knowing about each other or depending on each other's implementation. This is called **loose coupling**, and it's the core idea this project is built around.

If the notification service is slow or fails, it doesn't block payment processing or inventory updates. Each piece can scale, fail, and recover independently.

---

## Architecture

```
Customer
   |
   v
API Gateway  (POST /orders)
   |
   v
Lambda: Order Intake
   |  - validates request
   |  - writes order to DynamoDB (status: PENDING)
   |  - publishes "OrderPlaced" event
   v
EventBridge  (event bus)
   |
   |------------------|------------------|
   v                  v                  v
Lambda:            Lambda:            Lambda:
Payment            Inventory          Notification
(simulated)         Update             (via SQS buffer)
   |                  |                  |
   v                  v                  v
        DynamoDB (order status updates)
```

### Services Used, and Why

| Service | Role | Why this one |
|---|---|---|
| **API Gateway** | Entry point for order requests | Avoids running/managing our own web server |
| **Lambda** | Runs all our processing code | No servers to patch or scale manually; pay only per invocation |
| **EventBridge** | Central event bus routing events to consumers | Purpose-built for one event triggering multiple independent consumers, with routing rules |
| **DynamoDB** | Stores orders and their status | Serverless-native, scales automatically, pairs naturally with Lambda |
| **SQS** *(week 3)* | Buffers events before the notification consumer | Prevents lost events if a consumer is slow or temporarily failing |

**Deliberately not used (yet):**
- **Step Functions** — powerful for complex workflows, but adds orchestration syntax on top of everything else we're learning. Noted as a future improvement.
- **SNS** — good for simple pub/sub, but EventBridge better fits multiple event *types* (`OrderPlaced`, `PaymentProcessed`, `OrderShipped`) with different routing rules.

### Deployment Approach

Most resources start in the **AWS Console** so the team can see and understand each piece as it is created. **API Gateway (Week 1)** is an exception: it is defined in **CloudFormation** (`infrastructure/api-gateway.yaml`) so the entry point is reviewable, repeatable, and easy to share via stack outputs. Broader IaC (SAM/CloudFormation for Lambda, DynamoDB, EventBridge, SQS) remains a natural next step (see Week 3 / Future Improvements).

Architecture roadmap: [`docs/architecture-roadmap.png`](docs/architecture-roadmap.png) · Week 1 slice: [`docs/week-1-architecture.png`](docs/week-1-architecture.png)

---

## Project Timeline

### Week 1 — Foundation & Design
**Goal:** Get one thin slice working end-to-end.
- Design the event flow and architecture diagram
- Set up API Gateway (`infrastructure/api-gateway.yaml`) + order-intake Lambda
- Set up DynamoDB orders table
- Demo: API call → Lambda → DynamoDB write

**Presentation 1:** Architecture diagram, live demo of placing an order, explanation of the problem event-driven design solves.

### Week 2 — Event Routing & Consumers
**Goal:** Build the event-driven core of the system.
- Set up EventBridge event bus and rules
- Order-intake Lambda now publishes an `OrderPlaced` event instead of doing everything itself
- Build consumer Lambdas: payment (simulated), inventory update, notification
- Each consumer independently updates order status in DynamoDB

**Presentation 2:** Live demo of one event triggering multiple independent processes; explanation of loose coupling and why it matters.

### Week 3 — Resilience & Wrap-Up
**Goal:** Add production-style thinking and finish the story.
- Add SQS buffer before the notification consumer
- Demonstrate a simulated failure and recovery (retry / DLQ concept)
- Review and tighten IAM permissions (least privilege)
- Final polish: simple frontend or Postman collection for the demo

**Presentation 3:** Full end-to-end demo, failure scenario demo, retrospective on lessons learned and what we'd add with more time (Step Functions, real payment gateway, CloudFormation).

---

## Team & Roles



*(Roles are merged/split depending on team size — see `/docs/roles.md` for detail.)*

---

## Repository Structure

```
.
├── README.md
├── docs/
│   ├── architecture-roadmap.png   # 3-week architecture roadmap
│   ├── week-1-architecture.png    # Week 1 thin slice
│   ├── roles.md
│   └── event-schema.md
├── lambdas/
│   ├── order-intake/
│   │   └── index.js (or .py)
│   ├── payment-processor/
│   │   └── index.js
│   ├── inventory-update/
│   │   └── index.js
│   └── notification/
│       └── index.js
├── infrastructure/
│   ├── api-gateway.yaml  # Week 1 — CloudFormation for POST /orders
│   └── notes.md          # API Gateway ownership + deploy steps
└── postman/
    └── order-processing.postman_collection.json
```

---

## Status

🚧 In progress — see [Project Timeline](#project-timeline) above for current week.

## Future Improvements

- Migrate manual console setup to CloudFormation or AWS SAM
- Replace simulated payment step with a real (sandboxed) payment gateway
- Introduce Step Functions for more complex order workflows
- Add a proper frontend instead of Postman-only testing
