
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PostsRoutingModule } from './posts-routing.module';
import { PostsListComponent } from './posts-list/posts-list.component';
import { PostEditorComponent } from './post-editor/post-editor.component';

@NgModule({
  imports: [
    CommonModule,
    PostsRoutingModule,
    PostsListComponent,
    PostEditorComponent
  ]
})
export class PostsModule {}
