import { Injectable, signal } from '@angular/core';
import { ToastMessage } from '../models';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastMessage[]>([]);

  success(title: string, body?: string): void {
    this.push('success', title, body);
  }

  error(title: string, body?: string): void {
    this.push('error', title, body);
  }

  info(title: string, body?: string): void {
    this.push('info', title, body);
  }

  dismiss(id: string): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(type: ToastMessage['type'], title: string, body?: string): void {
    const id = crypto.randomUUID();
    this.toasts.update((list) => [...list, { id, type, title, body }]);
    setTimeout(() => this.dismiss(id), 4200);
  }
}
