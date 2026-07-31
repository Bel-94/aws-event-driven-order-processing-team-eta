import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminMetrics,
  CheckoutPayload,
  OrderRecord,
  TimelineStep,
} from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { CartService } from './cart.service';

const ORDERS_KEY = 'freshbasket.orders';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);

  readonly placing = signal(false);
  readonly activeOrder = signal<OrderRecord | null>(null);
  readonly orders = signal<OrderRecord[]>(this.readOrders());

  async placeOrder(
    details: Omit<CheckoutPayload, 'customerId' | 'items' | 'currency'>,
  ): Promise<OrderRecord> {
    const user = this.auth.user();
    if (!user) throw new Error('Sign in to place an order.');

    const items = this.cart.items();
    if (!items.length) throw new Error('Your cart is empty.');

    this.placing.set(true);
    try {
      const payload: CheckoutPayload = {
        customerId: user.id,
        deliveryAddress: details.deliveryAddress,
        phone: details.phone,
        instructions: details.instructions,
        paymentMethod: details.paymentMethod,
        currency: 'USD',
        items: items.map((i) => ({
          sku: i.product.id.replace('prod_', 'SKU-').toUpperCase(),
          productName: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.price,
        })),
        customerEmail: user.email,
      };

      let order: OrderRecord;

      if (environment.useLiveApi) {
        // Live path: API Gateway → Order Intake Lambda → DynamoDB + EventBridge
        const response = await firstValueFrom(
          this.api.post<{
            orderId: string;
            status: string;
            totalAmount: number;
            currency: string;
            createdAt: string;
            eventPublished: boolean;
          }>(environment.ordersPath, {
            customerId: payload.customerId,
            customerEmail: payload.customerEmail,
            items: payload.items,
            currency: payload.currency,
          }),
        );

        order = this.buildOrder(response.orderId, payload, {
          totalAmount: response.totalAmount,
          createdAt: response.createdAt,
          eventPublished: response.eventPublished,
        });
      } else {
        await delay(900);
        order = this.buildOrder(`ord_${crypto.randomUUID()}`, payload, {
          totalAmount: this.cart.total(),
          createdAt: new Date().toISOString(),
          eventPublished: true,
        });
      }

      this.cart.clear();
      this.activeOrder.set(order);
      this.orders.update((list) => [order, ...list]);
      this.persistOrders();
      this.simulateEventPipeline(order.orderId);
      return order;
    } finally {
      this.placing.set(false);
    }
  }

  getOrder(orderId: string): OrderRecord | undefined {
    return this.orders().find((o) => o.orderId === orderId);
  }

  /**
   * Simulates asynchronous consumers updating independently —
   * mirrors EventBridge → SQS → Payment / Inventory / Notification.
   */
  private simulateEventPipeline(orderId: string): void {
    const schedule: Array<{ at: number; mutate: (o: OrderRecord) => OrderRecord }> = [
      {
        at: 800,
        mutate: (o) =>
          patchTimeline(o, 'accepted', 'completed', {
            paymentStatus: undefined,
          }),
      },
      {
        at: 1600,
        mutate: (o) =>
          patchTimeline(
            { ...o, eventPublished: true, status: 'Processing' },
            'eventbridge',
            'completed',
          ),
      },
      {
        at: 2800,
        mutate: (o) =>
          patchTimeline({ ...o, paymentStatus: 'PROCESSED' }, 'payment', 'completed'),
      },
      {
        at: 4000,
        mutate: (o) =>
          patchTimeline({ ...o, inventoryStatus: 'RESERVED' }, 'inventory', 'completed'),
      },
      {
        at: 5200,
        mutate: (o) =>
          patchTimeline(
            { ...o, notificationStatus: 'SENT', status: 'Completed' },
            'notification',
            'completed',
          ),
      },
    ];

    for (const step of schedule) {
      setTimeout(() => this.applyOrderUpdate(orderId, step.mutate), step.at);
    }
  }

  private applyOrderUpdate(orderId: string, mutate: (o: OrderRecord) => OrderRecord): void {
    this.orders.update((list) =>
      list.map((o) => {
        if (o.orderId !== orderId) return o;
        const next = mutate(activateNext(o));
        if (this.activeOrder()?.orderId === orderId) {
          this.activeOrder.set(next);
        }
        return next;
      }),
    );
    this.persistOrders();
  }

  private buildOrder(
    orderId: string,
    payload: CheckoutPayload,
    meta: { totalAmount: number; createdAt: string; eventPublished: boolean },
  ): OrderRecord {
    const delivery = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return {
      orderId,
      status: 'Pending',
      totalAmount: meta.totalAmount,
      currency: payload.currency,
      createdAt: meta.createdAt,
      estimatedDelivery: delivery.toISOString(),
      eventPublished: meta.eventPublished,
      items: payload.items,
      timeline: initialTimeline(),
    };
  }

  adminMetrics(): AdminMetrics {
    const orders = this.orders();
    const today = new Date().toDateString();
    const todays = orders.filter((o) => new Date(o.createdAt).toDateString() === today);
    const pending = orders.filter((o) => o.status === 'Pending' || o.status === 'Processing');
    const revenue = orders
      .filter((o) => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const counts = {
      Pending: orders.filter((o) => o.status === 'Pending').length,
      Processing: orders.filter((o) => o.status === 'Processing').length,
      Completed: orders.filter((o) => o.status === 'Completed').length,
      Cancelled: orders.filter((o) => o.status === 'Cancelled').length,
    };

    return {
      todaysOrders: todays.length || orders.length,
      pendingOrders: pending.length,
      revenue: revenue || 1284.5,
      inventoryAlerts: 3,
      statusDistribution: [
        { label: 'Pending', value: counts.Pending || 2, color: '#A3A8A4' },
        { label: 'Processing', value: counts.Processing || 5, color: '#2F6B4F' },
        { label: 'Completed', value: counts.Completed || 18, color: '#1B7A4E' },
        { label: 'Cancelled', value: counts.Cancelled || 1, color: '#B45309' },
      ],
      recentOrders: (orders.length ? orders : seedOrders()).slice(0, 8),
      revenueByDay: [
        { day: 'Mon', amount: 420 },
        { day: 'Tue', amount: 510 },
        { day: 'Wed', amount: 380 },
        { day: 'Thu', amount: 640 },
        { day: 'Fri', amount: 720 },
        { day: 'Sat', amount: 890 },
        { day: 'Sun', amount: 610 },
      ],
    };
  }

  private persistOrders(): void {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(this.orders()));
  }

  private readOrders(): OrderRecord[] {
    try {
      const raw = localStorage.getItem(ORDERS_KEY);
      return raw ? (JSON.parse(raw) as OrderRecord[]) : seedOrders();
    } catch {
      return seedOrders();
    }
  }
}

function initialTimeline(): TimelineStep[] {
  return [
    {
      id: 'accepted',
      title: 'Order Accepted',
      description: 'Intake Lambda validated the cart and wrote the order to DynamoDB.',
      status: 'active',
      service: 'API Gateway → Lambda',
    },
    {
      id: 'eventbridge',
      title: 'Published to EventBridge',
      description: 'OrderPlaced event fans out to payment, inventory, and notification.',
      status: 'pending',
      service: 'Amazon EventBridge',
    },
    {
      id: 'payment',
      title: 'Payment Processed',
      description: 'Payment consumer charged the selected method independently.',
      status: 'pending',
      service: 'Payment Lambda + SQS',
    },
    {
      id: 'inventory',
      title: 'Inventory Reserved',
      description: 'Stock reserved without blocking checkout completion.',
      status: 'pending',
      service: 'Inventory Lambda + SQS',
    },
    {
      id: 'notification',
      title: 'Notification Sent',
      description:
        'Confirmation email sent with Amazon SES; failures land in a DLQ, not the checkout path.',
      status: 'pending',
      service: 'Notification Lambda + SES + SQS',
    },
  ];
}

function activateNext(order: OrderRecord): OrderRecord {
  return order;
}

function patchTimeline(
  order: OrderRecord,
  stepId: string,
  status: TimelineStep['status'],
  extra: Partial<OrderRecord> = {},
): OrderRecord {
  const timeline = order.timeline.map((step) => {
    if (step.id === stepId) {
      return { ...step, status, timestamp: new Date().toISOString() };
    }
    if (status === 'completed' && step.status === 'pending') {
      // leave others pending so they complete independently
      return step;
    }
    return step;
  });

  // Mark the next pending step as active for visual motion
  const nextPending = timeline.find((s) => s.status === 'pending');
  const withActive = timeline.map((s) =>
    nextPending && s.id === nextPending.id ? { ...s, status: 'active' as const } : s,
  );

  return { ...order, ...extra, timeline: withActive };
}

function seedOrders(): OrderRecord[] {
  return [
    {
      orderId: 'ord_seed_1001',
      status: 'Completed',
      totalAmount: 42.35,
      currency: 'USD',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      estimatedDelivery: new Date(Date.now() - 86400000 * 2 + 7200000).toISOString(),
      paymentStatus: 'PROCESSED',
      inventoryStatus: 'RESERVED',
      notificationStatus: 'SENT',
      eventPublished: true,
      items: [
        { sku: 'SKU-MILK', productName: 'Organic Whole Milk', quantity: 2, unitPrice: 4.49 },
        { sku: 'SKU-BREAD', productName: 'Whole Wheat Bread', quantity: 1, unitPrice: 3.25 },
      ],
      timeline: initialTimeline().map((s) => ({
        ...s,
        status: 'completed',
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      })),
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
