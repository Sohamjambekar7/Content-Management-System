import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    RouterModule,
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {

  fb = inject(FormBuilder);
  authService = inject(AuthService)
  message = '';
  errorMessage = '';
  isSubmitting = false;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });


  submit() {
    if (this.form.invalid || this.isSubmitting) return;
    this.message = ''; this.errorMessage = ''; this.isSubmitting = true;
    this.authService.forgotPassword(
      this.form.value.email!
    ).subscribe({
      next: () => { this.isSubmitting = false; this.message = 'If the account exists, a password reset email will be sent.'; },
      error: (err) => { this.isSubmitting = false; this.errorMessage = err?.error?.message || 'Unable to send a reset email right now.'; }
    });



  }


}
