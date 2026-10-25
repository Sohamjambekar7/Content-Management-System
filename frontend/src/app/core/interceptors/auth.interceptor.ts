import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAuthEndpoint = req.url.includes('/api/auth/');
  const token = auth.session?.accessToken;
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(catchError((error: HttpErrorResponse) => {
    if (error.status !== 401 || !auth.session || isAuthEndpoint) return throwError(() => error);
    return auth.refreshSession().pipe(
      switchMap(tokens => next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }))),
      catchError(refreshError => {
        auth.logout();
        return throwError(() => refreshError);
      })
    );
  }));
};
