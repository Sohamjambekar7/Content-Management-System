<<<<<<< HEAD

=======
>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { PhotoEditorComponent } from './photo-editor/photo-editor.component';

export const routes: Routes = [
<<<<<<< HEAD
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
=======
  { path: 'editor', component: PhotoEditorComponent },
  { path: '', loadChildren: () => import('./public/public.module').then(m => m.PublicModule) },
  { 
    path: 'admin', 
    canActivate:[authGuard],
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) 
  },
  {
    path: 'auth',
    loadChildren: () => import('./public/features/auth/auth.module').then(m => m.AuthModule)

>>>>>>> b81d3aa8a92a0385597fdca72d5caa61bcf19784
  }
];
