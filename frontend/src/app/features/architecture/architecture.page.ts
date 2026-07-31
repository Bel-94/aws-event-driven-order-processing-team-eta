import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface ArchService {
  id: string;
  name: string;
  icon: string;
  summary: string;
  detail: string;
}

@Component({
  selector: 'app-architecture-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './architecture.page.html',
})
export class ArchitecturePage {
  readonly activeId = signal<string | null>('amplify');

  readonly services: ArchService[] = [
    {
      id: 'amplify',
      name: 'AWS Amplify Hosting',
      icon: 'rocket_launch',
      summary: 'Builds and hosts the FreshBasket Angular SPA.',
      detail:
        'Amplify connects to the repo (or accepts a local build), runs ng build, and publishes the static app. It provisions HTTPS and a CloudFront distribution for you—no hand-rolled bucket policy or CDN wiring for the demo.',
    },
    {
      id: 'cloudfront',
      name: 'Amazon CloudFront',
      icon: 'public',
      summary: 'CDN edge layer Amplify attaches to the site.',
      detail:
        'Shoppers hit CloudFront first: TLS at the edge, cached JS/CSS/HTML near the user, and Shield Standard DDoS protection. Amplify manages this distribution; FreshBasket still calls API Gateway separately for orders.',
    },
    {
      id: 'cognito',
      name: 'Amazon Cognito',
      icon: 'shield_person',
      summary: 'Sign-up, sign-in, and JWTs for the SPA.',
      detail:
        'User pools issue ID tokens consumed by API Gateway authorizers. Sessions stay in the browser; no credentials touch Lambda handlers directly.',
    },
    {
      id: 'apigateway',
      name: 'API Gateway',
      icon: 'hub',
      summary: 'HTTPS front door for order intake.',
      detail:
        'Routes POST /orders to the intake Lambda with throttling, request validation, and Cognito JWT verification before compute runs.',
    },
    {
      id: 'lambda',
      name: 'AWS Lambda',
      icon: 'bolt',
      summary: 'Short-lived handlers for intake and consumers.',
      detail:
        'Intake validates carts and writes DynamoDB, then publishes OrderPlaced. Separate functions drain SQS for payment, inventory, and notifications.',
    },
    {
      id: 'eventbridge',
      name: 'Amazon EventBridge',
      icon: 'account_tree',
      summary: 'Event bus for decoupled fan-out.',
      detail:
        'One published event triggers multiple rules. Adding a consumer does not require redeploying checkout—only a new rule and queue subscription.',
    },
    {
      id: 'dynamodb',
      name: 'Amazon DynamoDB',
      icon: 'database',
      summary: 'Order records and idempotent writes.',
      detail:
        'Order items stay hot-path fast. Consumers update payment, inventory, and notification fields without coupling to the checkout request.',
    },
    {
      id: 'sqs',
      name: 'Amazon SQS',
      icon: 'queue',
      summary: 'Buffers work for each downstream team.',
      detail:
        'Payment retries, inventory holds, and email sends each get their own queue and DLQ. A slow consumer never blocks the others.',
    },
    {
      id: 'ses',
      name: 'Amazon SES',
      icon: 'mail',
      summary: 'Sends order confirmation email to the shopper.',
      detail:
        'The Notification Lambda calls SES after OrderPlaced. Checkout already finished—email latency or failure never blocks the basket, and poison messages land in the DLQ.',
    },
    {
      id: 'cloudwatch',
      name: 'Amazon CloudWatch',
      icon: 'monitoring',
      summary: 'Logs, metrics, and alarms.',
      detail:
        'Structured logs from every Lambda, queue depth alarms, and dashboards for ops during peak grocery hours.',
    },
  ];

  /**
   * Hosting path judges should hear first:
   * Browser → Amplify Hosting (CloudFront CDN) → static Angular app
   * Then API calls leave the SPA for API Gateway (not through Amplify).
   */
  readonly flow = [
    'Browser',
    'Amplify Hosting',
    'CloudFront (CDN)',
    'Angular SPA',
    'API Gateway',
    'Lambda (intake)',
    'DynamoDB',
    'EventBridge',
    'SQS',
    'SES email',
    'Consumers',
  ];

  select(id: string): void {
    this.activeId.update((current) => (current === id ? null : id));
  }

  activeService(): ArchService | undefined {
    const id = this.activeId();
    return this.services.find((s) => s.id === id);
  }
}
