import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-sign-up-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './sign-up.page.html',
})
export class SignUpPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly resending = signal(false);
  /** After Cognito SignUp, show the email code step. */
  readonly awaitingCode = signal(false);
  readonly pendingEmail = signal('');
  readonly pendingName = signal('');
  readonly pendingPassword = signal('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly confirmForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, password } = this.form.getRawValue();
    this.submitting.set(true);
    try {
      const result = await this.auth.signUp(name, email, password);
      if (result.userConfirmed) {
        const user = await this.auth.signIn(email, password);
        this.toast.success(`Welcome, ${user.name}`, 'Your FreshBasket account is ready.');
        await this.router.navigateByUrl('/shop');
        return;
      }
      this.pendingEmail.set(result.email);
      this.pendingName.set(name.trim());
      this.pendingPassword.set(password);
      this.awaitingCode.set(true);
      this.toast.info(
        'Check your inbox',
        `We sent a verification code to ${result.email}. Enter it below to finish signing up.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-up failed.';
      // If they already signed up but never confirmed, move them to the code step.
      if (/already exists|confirm/i.test(message)) {
        this.pendingEmail.set(email.trim().toLowerCase());
        this.pendingName.set(name.trim());
        this.pendingPassword.set(password);
        this.awaitingCode.set(true);
        this.toast.info('Confirm your email', 'Enter the code from Cognito, or resend a new one.');
      } else {
        this.toast.error('Could not create account', message);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  async confirm(): Promise<void> {
    if (this.confirmForm.invalid) {
      this.confirmForm.markAllAsTouched();
      return;
    }
    const code = this.confirmForm.controls.code.getRawValue();
    this.submitting.set(true);
    try {
      await this.auth.confirmSignUp(this.pendingEmail(), code);
      const user = await this.auth.signIn(this.pendingEmail(), this.pendingPassword());
      if (this.pendingName()) {
        this.auth.updateProfile({ name: this.pendingName() });
      }
      const displayName = this.auth.user()?.name || user.name;
      this.toast.success(`Welcome, ${displayName}`, 'You’re signed in. Start shopping whenever you’re ready.');
      await this.router.navigateByUrl('/shop');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Confirmation failed.';
      this.toast.error('Could not verify email', message);
    } finally {
      this.submitting.set(false);
    }
  }

  async resend(): Promise<void> {
    this.resending.set(true);
    try {
      await this.auth.resendConfirmationCode(this.pendingEmail());
      this.toast.success('Code resent', `Check ${this.pendingEmail()} again (and spam).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resend code.';
      this.toast.error('Resend failed', message);
    } finally {
      this.resending.set(false);
    }
  }

  backToForm(): void {
    this.awaitingCode.set(false);
  }
}
