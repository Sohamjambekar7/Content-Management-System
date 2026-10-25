import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
function matchPassword(): ValidatorFn {

  return (control: AbstractControl) => {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (password === confirmPassword) {
      return null;
    }

    return { mismatch: true };
  }

}
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent {

  token = '';
  errorMessage = '';
  isSubmitting = false;
  route = inject(ActivatedRoute)
  router = inject(Router)
  authService = inject(AuthService)
  fb = inject(FormBuilder);
  form = this.fb.group({
    password: ['', [
      Validators.required,
      Validators.minLength(6),
      Validators.maxLength(100),
      Validators.pattern('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,}$')
    ]],
    confirmPassword: ['', [
      Validators.required,
      Validators.minLength(6),
      Validators.maxLength(100),
      Validators.pattern('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{6,}$'),


    ]]
  }, {
    validators: matchPassword()
  });




  constructor() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
    });
  }

  submit() {
    if (this.form.invalid || !this.token || this.isSubmitting) return;
    this.errorMessage = ''; this.isSubmitting = true;
    this.authService.resetPassword(
      {
        token: this.token,
        password: this.form.value.password!,
      }
    ).subscribe({
      next: () => {
        this.isSubmitting = false;
        void this.router.navigate(['/auth/login'], { queryParams: { reset: 'success' } });
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err?.error?.message || 'Unable to reset the password. The link may have expired.';
      }
    })
  }



}
