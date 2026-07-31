import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CartDrawerComponent } from '../shared/components/cart-drawer/cart-drawer.component';
import { FooterComponent } from '../shared/components/footer/footer.component';
import { HeaderComponent } from '../shared/components/header/header.component';
import { ToastHostComponent } from '../shared/components/toast-host/toast-host.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, CartDrawerComponent, ToastHostComponent],
  templateUrl: './shell.component.html',
})
export class ShellComponent {}
