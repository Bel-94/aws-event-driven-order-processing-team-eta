# IAM Permissions Documentation — Order Intake Lambda Execution Role

**Role name:** `order-intake-execution-role-${Environment}`
**Defined in:** `infrastructure/lambda-order-intake.yaml`

| Permission | Why it's needed | Scope |
|---|---|---|
| `dynamodb:PutItem` | The Order Intake function writes new orders to the table with status `PENDING`. Week 1 scope is create-only — no updates or reads happen here. | Restricted to the exact Orders table ARN, imported via cross-stack reference from the `order-processing-db` stack — not `*` |
| `logs:CreateLogGroup` | Required so CloudWatch can create a log group on the function's first invocation | Via AWS-managed `AWSLambdaBasicExecutionRole` |
| `logs:CreateLogStream` | Creates a new log stream per execution environment | Via AWS-managed `AWSLambdaBasicExecutionRole` |
| `logs:PutLogEvents` | Writes actual log output for debugging/monitoring | Via AWS-managed `AWSLambdaBasicExecutionRole` |

## PoLP decisions

- **No `UpdateItem`, `DeleteItem`, `GetItem`, `Scan`, or `Query`** — the function only creates new orders in Week 1. `UpdateItem` is explicitly planned for Week 2 when consumers need it (see inline comment in the template), and will be added at that time rather than granted preemptively.
- **Resource-scoped, not wildcarded** — the DynamoDB permission is locked to one specific table ARN via `Fn::ImportValue`, not `Resource: "*"`. Even if this function were compromised, it could not write to any other table.
- **Trust policy restricts `AssumeRole` to `lambda.amazonaws.com` only** — no other AWS service or account can assume this role.

## Known tradeoff

`AWSLambdaBasicExecutionRole` (AWS-managed) scopes logging permissions to `arn:aws:logs:*:*:*` — i.e., *any* log group, not just this function's own. This is standard AWS practice for Lambda logging and is low-risk (log write access alone isn't typically exploitable), but a stricter PoLP implementation could replace it with an inline policy scoped only to this function's specific log group, matching the pattern used for the DynamoDB permission above.