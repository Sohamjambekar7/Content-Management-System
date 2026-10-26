
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { PhotoEditorComponent } from './photo-editor/photo-editor.component';

export const routes: Routes = [
  // After login, send users to the editing studio.
  {
    path: 'editor',
    component: PhotoEditorComponent,
    canActivate: [authGuard]
  },

  // Keep existing public pages and login/register routes.
  {
    path: '',
    loadChildren: () =>
      import('./public/public.module').then(m => m.PublicModule)
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./public/features/auth/auth.module').then(m => m.AuthModule)
  },

  // Keep the existing protected CMS admin area.
  {
    path: 'admin',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./admin/admin.module').then(m => m.AdminModule)
  },

  // Unknown URLs return to the public home page.
  {
    path: '**',
    redirectTo: ''
  }
];
