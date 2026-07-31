import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.page.html',
})
export class LandingPage {
  readonly heroImage =
    'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=2400&q=80';

  readonly features = [
    {
      icon: 'bolt',
      title: 'Fast Checkout',
      body: 'Place your order in seconds. The intake path stays lean while everything else runs asynchronously.',
    },
    {
      icon: 'inventory_2',
      title: 'Real-Time Inventory',
      body: 'Stock updates arrive independently from payment—no single bottleneck when demand spikes.',
    },
    {
      icon: 'lock',
      title: 'Secure Payments',
      body: 'Card, M-Pesa, or cash on delivery. Each method is handled by its own resilient consumer.',
    },
    {
      icon: 'cloud',
      title: 'Cloud Powered',
      body: 'Built on AWS with EventBridge and queues so one slow service never blocks your basket.',
    },
  ];

  readonly flowSteps = [
    { label: 'You checkout', detail: 'Browser sends the cart to API Gateway.' },
    { label: 'Order saved', detail: 'Lambda validates and writes to DynamoDB.' },
    { label: 'Event published', detail: 'OrderPlaced fans out on EventBridge.' },
    { label: 'Parallel work', detail: 'Payment, inventory, and notifications each consume from SQS.' },
    { label: 'You stay informed', detail: 'Status updates stream back without blocking checkout.' },
  ];

  readonly testimonials = [
    {
      quote:
        'Same-day delivery actually means same day. I love watching the order timeline update while I put away the milk.',
      name: 'Amara Okonkwo',
      role: 'Westlands, Nairobi',
    },
    {
      quote:
        'Peak-hour checkout used to freeze on other apps. FreshBasket feels instant even when the city is busy.',
      name: 'James Mwangi',
      role: 'Karen',
    },
    {
      quote:
        'The produce quality is consistent, and I trust that my payment went through before picking is done.',
      name: 'Sarah Chen',
      role: 'Kilimani',
    },
  ];
}
