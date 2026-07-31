# WAF & Shield Standard

Protects the orders API at the edge (Week 3).

## What this stack does

| Control | Detail |
|---|---|
| **AWS WAF** | Regional Web ACL on the API Gateway stage (`infrastructure/waf.yaml`) |
| **SQLi rule group** | `AWSManagedRulesSQLiRuleSet` — blocks common SQL injection patterns |
| **Core rule set** | `AWSManagedRulesCommonRuleSet` — broad OWASP-style protections including XSS-class attacks |
| **Known bad inputs** | `AWSManagedRulesKnownBadInputsRuleSet` — extra signatures for probing / injection |
| **Shield Standard** | Automatic DDoS baseline for API Gateway — no CloudFormation resource required |

## Deploy (after API Gateway exists)

```bash
aws cloudformation deploy \
  --template-file infrastructure/waf.yaml \
  --stack-name order-processing-waf \
  --parameter-overrides \
    Environment=dev \
    ProjectName=order-processing \
    ApiStackProjectName=order-processing \
    StageName=dev
```

## Presentation talking points

1. Cognito authenticates *who*; WAF filters *malicious payloads* before they hit Lambda.
2. Managed rule groups are AWS-maintained — good default for a learner/demo account.
3. Shield Standard is always on for AWS edge services; Shield Advanced is paid and out of scope.
4. Check blocked requests: WAF console → Web ACLs → sample requests / CloudWatch metrics.

## Caveat

Managed CRS rules can occasionally block legitimate large JSON bodies. If a valid order is blocked during the demo, check WAF sampled requests and temporarily set a rule to Count mode for troubleshooting.
