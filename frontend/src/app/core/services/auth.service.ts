import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { IUser } from '../interfaces/models/user.model.interface';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export interface Session { accessToken: string; refreshToken: string; user: IUser; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly baseUrl = `${environment.BACKEND_API_URL}/api/auth`;
  session?: Session;

  constructor() {
    try {
      const raw = localStorage.getItem('session');
      if (raw) {
        const parsed = JSON.parse(raw) as Session;
        if (parsed?.accessToken && parsed?.refreshToken && parsed?.user) this.session = parsed;
        else localStorage.removeItem('session');
      }
    } catch { localStorage.removeItem('session'); }
  }

  login(credentials: { email: string; password: string }): Observable<Session> {
    return this.http.post<Session>(`${this.baseUrl}/login`, credentials).pipe(
      tap(session => {
        this.session = session;
        localStorage.setItem('session', JSON.stringify(session));
        void this.router.navigate(['/admin']);
      })
    );
  }

  refreshSession(): Observable<{ accessToken: string; refreshToken: string }> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) throw new Error('No refresh token is available.');
    return this.http.post<{ accessToken: string; refreshToken: string }>(`${this.baseUrl}/refresh_token`, { refreshToken }).pipe(
      tap(tokens => {
        if (!this.session) return;
        this.session = { ...this.session, ...tokens };
        localStorage.setItem('session', JSON.stringify(this.session));
      })
    );
  }

  logout(): void {
    const refreshToken = this.session?.refreshToken;
    this.session = undefined;
    localStorage.removeItem('session');
    if (refreshToken) this.http.post(`${this.baseUrl}/logout`, { refreshToken }).subscribe({ error: () => undefined });
    void this.router.navigate(['/auth/login']);
  }

  register(payload: { name: string; email: string; password: string }) {
    return this.http.post(`${this.baseUrl}/register`, payload);
  }
  forgotPassword(email: string) { return this.http.post(`${this.baseUrl}/forgot-password`, { email }); }
  resetPassword(payload: { token: string; password: string }) { return this.http.post(`${this.baseUrl}/reset-password`, payload); }
}
