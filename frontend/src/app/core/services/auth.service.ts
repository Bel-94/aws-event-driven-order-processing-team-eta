import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthSession, UserProfile } from '../models';

const STORAGE_KEY = 'freshbasket.auth';

/**
 * Cognito-backed auth for production / live API.
 * Sign-up → email verification code → sign-in.
 * Falls back to a local placeholder session only when useLiveApi is false.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sessionSignal = signal<AuthSession | null>(this.readStored());

  readonly session = this.sessionSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.sessionSignal()?.idToken);
  readonly user = computed(() => this.sessionSignal()?.user ?? null);
  readonly idToken = computed(() => this.sessionSignal()?.idToken ?? null);

  async signIn(email: string, password: string): Promise<UserProfile> {
    if (!email.includes('@') || password.length < 6) {
      throw new Error('Check your email and password, then try again.');
    }

    if (!environment.useLiveApi) {
      return this.signInPlaceholder(email, password);
    }

    const result = await cognitoCall('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: environment.cognito.userPoolClientId,
      AuthParameters: {
        USERNAME: email.trim().toLowerCase(),
        PASSWORD: password,
      },
    });

    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      throw new Error('This account still needs a permanent password. Contact the demo host.');
    }
    if (result.ChallengeName) {
      throw new Error(
        `Cognito requires an extra step (${result.ChallengeName}). Confirm your email first if you just signed up.`,
      );
    }

    const auth = result.AuthenticationResult;
    if (!auth?.IdToken) {
      throw new Error('Sign-in failed. Check your FreshBasket email and password.');
    }

    const claims = decodeJwt(auth.IdToken);
    const normalizedEmail = email.trim().toLowerCase();
    const user: UserProfile = {
      id: (typeof claims?.['sub'] === 'string' && claims['sub']) || `cust_${normalizedEmail}`,
      name:
        (typeof claims?.['name'] === 'string' && claims['name']) ||
        deriveName(normalizedEmail),
      email: (typeof claims?.['email'] === 'string' && claims['email']) || normalizedEmail,
      phone: '+254 712 000 000',
      addresses: ['12 Riverside Drive, Westlands, Nairobi'],
    };

    this.persist({
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
      user,
    });
    return user;
  }

  /**
   * Starts Cognito SignUp. Cognito emails a verification code (COGNITO_DEFAULT).
   * Returns whether the user is already confirmed (unusual for email signup).
   */
  async signUp(
    name: string,
    email: string,
    password: string,
  ): Promise<{ userConfirmed: boolean; email: string }> {
    if (!name.trim() || !email.includes('@') || password.length < 8) {
      throw new Error('Enter a name, valid email, and password (8+ characters).');
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('Password needs upper, lower, and a number (Cognito policy).');
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!environment.useLiveApi) {
      await delay(500);
      return { userConfirmed: true, email: normalizedEmail };
    }

    let result: any;
    try {
      result = await cognitoCall('SignUp', {
        ClientId: environment.cognito.userPoolClientId,
        Username: normalizedEmail,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: normalizedEmail },
          { Name: 'name', Value: name.trim() },
        ],
      });
    } catch (err) {
      // Existing pools may not allow the standard "name" attribute — retry email-only.
      const message = err instanceof Error ? err.message : '';
      if (!/attribute|schema|name/i.test(message)) throw err;
      result = await cognitoCall('SignUp', {
        ClientId: environment.cognito.userPoolClientId,
        Username: normalizedEmail,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: normalizedEmail }],
      });
    }

    return {
      userConfirmed: !!result.UserConfirmed,
      email: normalizedEmail,
    };
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    if (!environment.useLiveApi) return;
    await cognitoCall('ConfirmSignUp', {
      ClientId: environment.cognito.userPoolClientId,
      Username: email.trim().toLowerCase(),
      ConfirmationCode: code.trim(),
    });
  }

  async resendConfirmationCode(email: string): Promise<void> {
    if (!environment.useLiveApi) return;
    await cognitoCall('ResendConfirmationCode', {
      ClientId: environment.cognito.userPoolClientId,
      Username: email.trim().toLowerCase(),
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!email.includes('@')) {
      throw new Error('Enter the email on your FreshBasket account.');
    }
    if (!environment.useLiveApi) {
      await delay(400);
      return;
    }
    await cognitoCall('ForgotPassword', {
      ClientId: environment.cognito.userPoolClientId,
      Username: email.trim().toLowerCase(),
    });
  }

  signOut(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.sessionSignal.set(null);
  }

  updateProfile(patch: Partial<UserProfile>): void {
    const current = this.sessionSignal();
    if (!current) return;
    this.persist({
      ...current,
      user: { ...current.user, ...patch },
    });
  }

  private async signInPlaceholder(email: string, _password: string): Promise<UserProfile> {
    await delay(450);
    const user: UserProfile = {
      id: 'cust_demo_001',
      name: deriveName(email),
      email: email.trim().toLowerCase(),
      phone: '+254 712 000 000',
      addresses: ['12 Riverside Drive, Westlands, Nairobi'],
    };
    this.persist({
      accessToken: `access_${crypto.randomUUID()}`,
      idToken: `id_${crypto.randomUUID()}`,
      expiresAt: Date.now() + 60 * 60 * 1000,
      user,
    });
    return user;
  }

  private persist(session: AuthSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.sessionSignal.set(session);
  }

  private readStored(): AuthSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed.expiresAt < Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

async function cognitoCall(target: string, body: Record<string, unknown>): Promise<any> {
  const region = environment.cognito.region;
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = String(payload.message || payload.__type || 'Authentication request failed.');
    throw new Error(humanizeCognitoError(raw));
  }
  return payload;
}

function humanizeCognitoError(raw: string): string {
  const msg = raw.replace(/^.*Exception:\s*/i, '');
  if (/UsernameExistsException/i.test(raw) || /already exists/i.test(msg)) {
    return 'An account with this email already exists. Sign in, or confirm it if you have a code.';
  }
  if (/UserNotConfirmedException/i.test(raw) || /not confirmed/i.test(msg)) {
    return 'Confirm your email with the code we sent, then sign in.';
  }
  if (/CodeMismatchException/i.test(raw) || /Invalid verification code/i.test(msg)) {
    return 'That verification code is incorrect. Check the email and try again.';
  }
  if (/ExpiredCodeException/i.test(raw)) {
    return 'That code expired. Tap Resend code and try again.';
  }
  if (/InvalidPasswordException/i.test(raw)) {
    return 'Password needs at least 8 characters with upper, lower, and a number.';
  }
  if (/LimitExceededException/i.test(raw) || /Attempt limit/i.test(msg)) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return msg;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function deriveName(email: string): string {
  const local = email.split('@')[0] ?? 'Shopper';
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
