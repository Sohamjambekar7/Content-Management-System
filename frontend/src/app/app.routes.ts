
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { PhotoEditorComponent } from './photo-editor/photo-editor.component';

export const routes: Routes = [
  // Photo/video editing studio - requires authentication.
  {
    path: 'editor',
    component: PhotoEditorComponent,
    canActivate: [authGuard]
  },

  // Public home pages.
  {
    path: '',
    loadChildren: () =>
      import('./public/public.module').then(m => m.PublicModule)
  },

  // Login and registration pages.
  {
    path: 'auth',
    loadChildren: () =>
      import('./public/features/auth/auth.module').then(m => m.AuthModule)
  },

  // Protected CMS admin area.
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
