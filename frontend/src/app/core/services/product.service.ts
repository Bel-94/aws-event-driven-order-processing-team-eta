import { Injectable, signal } from '@angular/core';
import { Product, ProductCategory } from '../models';
import { PRODUCT_CATALOG, PRODUCT_CATEGORIES } from '../data/products.data';

export type ProductSort = 'featured' | 'price-asc' | 'price-desc' | 'rating';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly catalog = signal<Product[]>(PRODUCT_CATALOG);
  readonly categories = PRODUCT_CATEGORIES;

  readonly loading = signal(false);

  async list(options?: {
    query?: string;
    category?: ProductCategory | 'All';
    sort?: ProductSort;
  }): Promise<Product[]> {
    this.loading.set(true);
    await delay(280);
    try {
      let items = [...this.catalog()];
      const q = options?.query?.trim().toLowerCase();
      if (q) {
        items = items.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        );
      }
      if (options?.category && options.category !== 'All') {
        items = items.filter((p) => p.category === options.category);
      }
      switch (options?.sort) {
        case 'price-asc':
          items.sort((a, b) => a.price - b.price);
          break;
        case 'price-desc':
          items.sort((a, b) => b.price - a.price);
          break;
        case 'rating':
          items.sort((a, b) => b.rating - a.rating);
          break;
        default:
          break;
      }
      return items;
    } finally {
      this.loading.set(false);
    }
  }

  getById(id: string): Product | undefined {
    return this.catalog().find((p) => p.id === id);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
