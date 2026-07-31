# Email notifications (Amazon SES)

FreshBasket sends order confirmation email from the **Notification** consumer after `OrderPlaced`.

```
Checkout → Intake Lambda → DynamoDB + EventBridge
                              ↓
                         SQS (notification)
                              ↓
                    Notification Lambda
                              ↓
                         Amazon SES  →  customer inbox
                              ↓
                    DynamoDB notificationStatus=SENT
```

Checkout never waits on SES. If email fails, SQS retries then the DLQ holds the message.

## Demo setup (SES sandbox)

New accounts start in the SES **sandbox**: From and To must be verified identities.

1. Verify the address you will use for the demo (same inbox for From + To is easiest):

```powershell
aws ses verify-email-identity --email-address YOUR_EMAIL --region us-east-1
```

2. Open the AWS verification email and click the link.

3. Confirm:

```powershell
aws ses list-identities --region us-east-1
aws ses get-identity-verification-attributes --identities YOUR_EMAIL --region us-east-1
```

4. Update the consumers stack with that address:

```powershell
aws cloudformation update-stack `
  --stack-name order-processing-consumers `
  --template-body file://infrastructure/consumers.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameters `
    ParameterKey=AttachSecretsPolicy,ParameterValue=true `
    ParameterKey=NotificationFromEmail,ParameterValue=YOUR_EMAIL `
    ParameterKey=NotificationDefaultToEmail,ParameterValue=YOUR_EMAIL
```

5. Upload the Notification (+ Order Intake) Lambda zips after `npm install --omit=dev`.

6. Place an order with `customerEmail` set to that verified address (FreshBasket passes the signed-in user’s email when `useLiveApi: true`).

## Talking points for judges

- Notification is a **separate** consumer — email outage does not roll back payment or inventory.
- SES is the AWS-native email channel; credentials/config can sit in Secrets Manager (`fromEmail` / `defaultRecipient`).
- Failures are visible in the Notification **DLQ** and CloudWatch logs (`SES email sent` / error message).
- DynamoDB stores `notificationChannel=email`, `notificationTo`, and `notificationMessageId` for audit.

## Production next step

Request SES production access so you can email any customer domain, then use a domain identity (`orders@freshbasket.com`) instead of a personal inbox.
