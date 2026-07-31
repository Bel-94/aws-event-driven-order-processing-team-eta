import { Injectable, computed, signal } from '@angular/core';
import { CartItem, Product } from '../models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly itemsSignal = signal<CartItem[]>(this.read());
  readonly drawerOpen = signal(false);

  readonly items = this.itemsSignal.asReadonly();
  readonly count = computed(() =>
    this.itemsSignal().reduce((sum, item) => sum + item.quantity, 0),
  );
  readonly subtotal = computed(() =>
    this.itemsSignal().reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  );
  readonly deliveryFee = computed(() => (this.subtotal() >= 35 || this.subtotal() === 0 ? 0 : 3.99));
  readonly total = computed(() => this.subtotal() + this.deliveryFee());

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  toggleDrawer(): void {
    this.drawerOpen.update((v) => !v);
  }

  add(product: Product, quantity = 1): void {
    if (product.availability === 'Out of stock') return;
    this.itemsSignal.update((items) => {
      const existing = items.find((i) => i.product.id === product.id);
      if (existing) {
        return items.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i,
        );
      }
      return [...items, { product, quantity }];
    });
    this.persist();
    this.openDrawer();
  }

  setQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }
    this.itemsSignal.update((items) =>
      items.map((i) => (i.product.id === productId ? { ...i, quantity } : i)),
    );
    this.persist();
  }

  remove(productId: string): void {
    this.itemsSignal.update((items) => items.filter((i) => i.product.id !== productId));
    this.persist();
  }

  clear(): void {
    this.itemsSignal.set([]);
    this.persist();
  }

  private persist(): void {
    localStorage.setItem('freshbasket.cart', JSON.stringify(this.itemsSignal()));
  }

  private read(): CartItem[] {
    try {
      const raw = localStorage.getItem('freshbasket.cart');
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  }
}
