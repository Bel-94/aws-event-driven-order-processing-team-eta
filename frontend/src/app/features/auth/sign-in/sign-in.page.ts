import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-sign-in-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './sign-in.page.html',
})
export class SignInPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);
    try {
      const user = await this.auth.signIn(email, password);
      this.toast.success(`Welcome, ${user.name}`, 'Your basket is ready when you are.');
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/shop';
      await this.router.navigateByUrl(returnUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.';
      this.toast.error('Could not sign in', message);
    } finally {
      this.submitting.set(false);
    }
  }
}
