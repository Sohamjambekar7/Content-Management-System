import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // EASEContent AI Photo & Video Creative Studio - requires authentication.
  {
    path: 'editor',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/media-studio/media-studio.component').then(
        (m) => m.MediaStudioComponent
      ),
  },

  // Public home pages.
  {
    path: '',
    loadChildren: () =>
      import('./public/public.module').then((m) => m.PublicModule),
  },

  // Login and registration pages.
  {
    path: 'auth',
    loadChildren: () =>
      import('./public/features/auth/auth.module').then((m) => m.AuthModule),
  },

  // Protected EASEContent workspace.
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./admin/admin.module').then((m) => m.AdminModule),
  },

  // Unknown URLs return to the public home page.
  {
    path: '**',
    redirectTo: '',
  },
];
