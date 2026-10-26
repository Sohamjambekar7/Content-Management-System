<<<<<<< HEAD

import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import {
  ActivatedRoute,
  Router,
  RouterModule
} from '@angular/router';

import { AuthService } from '../../../../core/services/auth.service';
=======
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { ActivatedRoute, RouterModule } from '@angular/router';
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
<<<<<<< HEAD
    ReactiveFormsModule,
    CommonModule,
    RouterModule
=======
    ReactiveFormsModule, CommonModule, RouterModule
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
<<<<<<< HEAD
  fb = inject(FormBuilder);
  authService = inject(AuthService);
  route = inject(ActivatedRoute);
  router = inject(Router);

=======

  fb = inject(FormBuilder);
  authService = inject(AuthService)
  route = inject(ActivatedRoute);
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
  successMessage = '';
  errorMessage = '';
  isSubmitting = false;

  constructor() {
    this.route.queryParams.subscribe(params => {
<<<<<<< HEAD
      if (params['registered'] === 'true') {
        this.successMessage =
          'Account created. Check your email to confirm it before signing in.';
      }

      if (params['reset'] === 'success') {
        this.successMessage =
          'Password updated. You can now sign in.';
      }
=======
      if (params['registered'] === 'true') this.successMessage = 'Account created. Check your email to confirm it before signing in.';
      if (params['reset'] === 'success') this.successMessage = 'Password updated. You can now sign in.';
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
    });
  }

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

<<<<<<< HEAD
  submit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;

=======

  submit() {
    if (this.form.invalid || this.isSubmitting) return;
    this.errorMessage = '';
    this.isSubmitting = true;
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
    this.authService.login({
      email: this.form.value.email!,
      password: this.form.value.password!
    }).subscribe({
<<<<<<< HEAD
      next: () => {
        this.isSubmitting = false;

        // Successful login: open the editing studio.
        this.router.navigate(['/editor']);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage =
          err?.error?.message ||
          'Unable to sign in. Check your details and try again.';
      }
    });
  }
=======
      next: () => { this.isSubmitting = false; },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err?.error?.message || 'Unable to sign in. Check your details and try again.';
      }
    });
  }

>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
}
