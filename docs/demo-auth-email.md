# Seamless demo auth & email

## What judges should experience

1. **Create account** with any email → Cognito emails a **verification code**
2. Enter the code → **Welcome, [Name]**
3. Place an order → success page says **order & delivery details sent to [email]**
4. Inbox receives **FreshBasket order confirmed** (Amazon SES via Notification Lambda)

## How the pieces split

| Email | Service | Works for any inbox? |
| --- | --- | --- |
| Signup verification code | **Amazon Cognito** (default email) | Yes — Cognito sends the code |
| Order confirmation | **Amazon SES** (Notification Lambda) | Yes only after SES **production access**; until then only verified identities |

## Demo tip while SES is still in sandbox

- Cognito signup still looks seamless for any guest email.
- For the **order email** during the live talk, either:
  - use a pre-verified address (`codesrunner@gmail.com`, `ntinyaribelinda@gmail.com`), or
  - click the SES verify link for a guest’s email once (one-time), or
  - wait until AWS approves SES production access (request already submitted).

## Demo accounts (pre-provisioned)

| Email | Password |
| --- | --- |
| `codesrunner@gmail.com` | `DemoPass1!` |
| `ntinyaribelinda@gmail.com` | `DemoPass1!` |

Site: https://main.d1lubsio53fudu.amplifyapp.com
