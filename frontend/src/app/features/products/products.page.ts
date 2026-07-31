import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '../../core/models';
import { ProductService, ProductSort } from '../../core/services/product.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [FormsModule, ProductCardComponent],
  templateUrl: './products.page.html',
})
export class ProductsPage {
  private readonly productService = inject(ProductService);

  readonly categories = ['All', ...this.productService.categories] as const;
  readonly loading = this.productService.loading;

  readonly query = signal('');
  readonly category = signal<(typeof this.categories)[number]>('All');
  readonly sort = signal<ProductSort>('featured');
  readonly products = signal<Product[]>([]);

  constructor() {
    effect(() => {
      const q = this.query();
      const cat = this.category();
      const sort = this.sort();
      void this.refresh(q, cat, sort);
    });
  }

  setCategory(cat: (typeof this.categories)[number]): void {
    this.category.set(cat);
  }

  private async refresh(
    query: string,
    category: (typeof this.categories)[number],
    sort: ProductSort,
  ): Promise<void> {
    const items = await this.productService.list({
      query,
      category,
      sort,
    });
    this.products.set(items);
  }
}
