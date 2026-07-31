import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderService } from '../../core/services/order.service';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './admin.page.html',
})
export class AdminPage {
  private readonly orderService = inject(OrderService);

  readonly metrics = computed(() => {
    this.orderService.orders();
    return this.orderService.adminMetrics();
  });

  readonly revenueMax = computed(() =>
    Math.max(...this.metrics().revenueByDay.map((d) => d.amount), 1),
  );

  readonly statusTotal = computed(() =>
    this.metrics().statusDistribution.reduce((s, d) => s + d.value, 0),
  );

  barHeight(amount: number, max: number): number {
    return Math.round((amount / max) * 100);
  }

  statusWidth(value: number, total: number): number {
    if (total === 0) return 0;
    return (value / total) * 100;
  }
}
