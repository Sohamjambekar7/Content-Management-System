import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule, CommonModule, RouterModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  fb = inject(FormBuilder);
  authService = inject(AuthService)
  route = inject(ActivatedRoute);
  successMessage = '';
  errorMessage = '';
  isSubmitting = false;

  constructor() {
    this.route.queryParams.subscribe(params => {
      if (params['registered'] === 'true') this.successMessage = 'Account created. Check your email to confirm it before signing in.';
      if (params['reset'] === 'success') this.successMessage = 'Password updated. You can now sign in.';
    });
  }

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });


  submit() {
    if (this.form.invalid || this.isSubmitting) return;
    this.errorMessage = '';
    this.isSubmitting = true;
    this.authService.login({
      email: this.form.value.email!,
      password: this.form.value.password!
    }).subscribe({
      next: () => { this.isSubmitting = false; },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err?.error?.message || 'Unable to sign in. Check your details and try again.';
      }
    });
  }

}
