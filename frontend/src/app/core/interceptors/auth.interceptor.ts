import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/** Attaches Cognito-style Bearer token when present. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).idToken();
  if (!token) return next(req);
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
