import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { EventTimelineComponent } from '../../../shared/components/event-timeline/event-timeline.component';

@Component({
  selector: 'app-order-success-page',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, DatePipe, EventTimelineComponent],
  templateUrl: './order-success.page.html',
})
export class OrderSuccessPage {
  private readonly route = inject(ActivatedRoute);
  private readonly orderService = inject(OrderService);
  readonly auth = inject(AuthService);

  readonly orderId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );

  readonly order = computed(() => {
    const id = this.orderId();
    if (!id) return null;
    const active = this.orderService.activeOrder();
    if (active?.orderId === id) return active;
    return this.orderService.orders().find((o) => o.orderId === id) ?? null;
  });

  readonly timeline = computed(() => this.order()?.timeline ?? []);
  readonly shopperEmail = computed(() => this.auth.user()?.email ?? '');
  readonly notificationDone = computed(() =>
    this.timeline().some((s) => s.id === 'notification' && s.status === 'completed'),
  );
}
