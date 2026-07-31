import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  readonly auth = inject(AuthService);
  readonly cart = inject(CartService);

  readonly links = [
    { path: '/shop', label: 'Shop' },
    { path: '/architecture', label: 'Architecture' },
    { path: '/orders', label: 'Orders', auth: true },
    { path: '/admin', label: 'Ops', auth: true },
  ];
}
