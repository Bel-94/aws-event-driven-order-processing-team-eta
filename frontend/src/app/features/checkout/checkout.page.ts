import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PaymentMethod } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OrderService } from '../../core/services/order.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-checkout-page',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, RouterLink],
  templateUrl: './checkout.page.html',
})
export class CheckoutPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  readonly cart = inject(CartService);
  private readonly orders = inject(OrderService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly placing = this.orders.placing;

  readonly paymentMethods: Array<{ value: PaymentMethod; label: string; icon: string }> = [
    { value: 'card', label: 'Card', icon: 'credit_card' },
    { value: 'mpesa', label: 'M-Pesa', icon: 'phone_android' },
    { value: 'cod', label: 'Cash on delivery', icon: 'payments' },
  ];

  readonly form = this.fb.nonNullable.group({
    deliveryAddress: ['', Validators.required],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    instructions: [''],
    paymentMethod: ['card' as PaymentMethod, Validators.required],
  });

  constructor() {
    const user = this.auth.user();
    if (user) {
      this.form.patchValue({
        deliveryAddress: user.addresses[0] ?? '',
        phone: user.phone ?? '',
      });
    }
  }

  async submit(): Promise<void> {
    if (this.cart.items().length === 0) {
      this.toast.error('Cart is empty', 'Add items before checkout.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    try {
      const order = await this.orders.placeOrder({
        deliveryAddress: raw.deliveryAddress,
        phone: raw.phone,
        instructions: raw.instructions || undefined,
        paymentMethod: raw.paymentMethod,
      });
      this.toast.success(
        'Order placed',
        `Confirmation will be emailed to ${this.auth.user()?.email}. Order ${order.orderId}`,
      );
      await this.router.navigate(['/orders', order.orderId, 'success']);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed.';
      this.toast.error('Could not place order', message);
    }
  }
}
