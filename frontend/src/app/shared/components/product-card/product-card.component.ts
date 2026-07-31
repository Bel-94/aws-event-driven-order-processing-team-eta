import { CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Product } from '../../../core/models';
import { CartService } from '../../../core/services/cart.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './product-card.component.html',
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Output() added = new EventEmitter<Product>();

  private readonly cart = inject(CartService);
  private readonly toast = inject(ToastService);

  add(): void {
    if (this.product.availability === 'Out of stock') return;
    this.cart.add(this.product);
    this.toast.success('Added to cart', this.product.name);
    this.added.emit(this.product);
  }
}
