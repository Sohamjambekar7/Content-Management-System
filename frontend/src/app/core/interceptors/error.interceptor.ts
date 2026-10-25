import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

// Keep this interceptor side-effect free. Authentication refresh/logout is handled
// by authInterceptor so a first 401 does not erase the session before refresh runs.
export const errorInterceptor: HttpInterceptorFn = (req, next) => next(req).pipe(
  catchError((error: HttpErrorResponse) => throwError(() => error))
);
