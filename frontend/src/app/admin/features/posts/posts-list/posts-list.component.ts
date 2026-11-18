import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../../../core/services/auth.service';
import { PostService } from '../../../../core/services/post.service';
import { IPost } from '../../../../core/interfaces/models/post.model.interface';
import {
  YouTubePublishRecord,
  YouTubeService,
  YouTubeStatus,
} from '../../../../services/youtube.service';

@Component({
  selector: 'app-posts-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './posts-list.component.html',
  styleUrl: './posts-list.component.scss',
})
export class PostsListComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly postService = inject(PostService);
  private readonly youtubeService = inject(YouTubeService);

  activeSection: 'posts' | 'publisher' = 'posts';

  // CMS Posts
  posts: IPost[] = [];
  loadingPosts = false;

  // Quick YouTube Publisher
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  youtubeTitle = '';
  youtubeDescription = '';
  youtubePrivacy: 'private' | 'unlisted' | 'public' = 'private';

  busy = false;
  uploadProgress = 0;
  status: 'idle' | 'success' | 'error' | 'info' = 'idle';
  statusMessage = '';

  youtubeStatus: YouTubeStatus | null = null;
  checkingYouTube = false;
  connectingYouTube = false;
  youtubeHistory: YouTubePublishRecord[] = [];

  private objectUrl: string | null = null;

  get sessionEmail(): string {
    return this.authService.session?.user?.email || '';
  }

  get youtubeConnected(): boolean {
    return Boolean(this.youtubeStatus?.connected);
  }

  get isVideo(): boolean {
    return Boolean(this.selectedFile?.type.startsWith('video/'));
  }

  get canSubmit(): boolean {
    return (
      Boolean(this.selectedFile) &&
      this.isVideo &&
      this.youtubeConnected &&
      this.youtubeTitle.trim().length > 0 &&
      this.youtubeTitle.trim().length <= 100 &&
      !this.busy
    );
  }

  ngOnInit(): void {
    this.loadPosts();
    this.checkYouTubeStatus();
    this.loadYouTubeHistory();
    this.loadDraft();
  }

  loadPosts(): void {
    this.loadingPosts = true;
    this.postService
      .getPosts({ mine: true })
      .pipe(finalize(() => (this.loadingPosts = false)))
      .subscribe({
        next: (posts) => (this.posts = posts),
        error: () => undefined,
      });
  }

  deletePost(id: number): void {
    if (!confirm('Delete this post permanently?')) return;
    this.postService.deletePost(id).subscribe({
      next: () => {
        this.posts = this.posts.filter((p) => p.id !== id);
      },
      error: (err) => {
        this.setStatus('error', err?.error?.message || 'Could not delete post.');
      },
    });
  }

  checkYouTubeStatus(): void {
    this.checkingYouTube = true;
    this.youtubeService
      .getStatus()
      .pipe(finalize(() => (this.checkingYouTube = false)))
      .subscribe({
        next: (status) => {
          this.youtubeStatus = status;
        },
        error: () => {
          this.youtubeStatus = null;
          this.setStatus('error', 'Could not verify YouTube connection status.');
        },
      });
  }

  loadYouTubeHistory(): void {
    this.youtubeService.getHistory().subscribe({
      next: (res) => (this.youtubeHistory = res.history || []),
      error: () => undefined,
    });
  }

  connectYouTube(): void {
    this.connectingYouTube = true;
    this.youtubeService
      .requestConnectUrl('/admin/posts')
      .pipe(finalize(() => (this.connectingYouTube = false)))
      .subscribe({
        next: ({ authUrl }) => {
          window.location.href = authUrl;
        },
        error: (err) => {
          this.setStatus(
            'error',
            err?.error?.message || 'Unable to start YouTube OAuth authorization.'
          );
        },
      });
  }

  disconnectYouTube(): void {
    this.youtubeService.disconnect().subscribe({
      next: () => {
        this.checkYouTubeStatus();
        this.setStatus('info', 'YouTube account disconnected.');
      },
      error: () => undefined,
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.clearPreview();

    if (!file) {
      this.selectedFile = null;
      return;
    }

    if (!file.type.startsWith('video/')) {
      this.selectedFile = null;
      input.value = '';
      this.setStatus('error', 'Choose a video file (MP4, WebM, or MOV) for YouTube upload.');
      return;
    }

    this.selectedFile = file;
    this.objectUrl = URL.createObjectURL(file);
    this.previewUrl = this.objectUrl;
    if (!this.youtubeTitle) {
      this.youtubeTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
    }
    this.setStatus('idle', '');
  }

  saveDraft(): void {
    try {
      localStorage.setItem(
        'easecontent-youtube-draft',
        JSON.stringify({
          youtubeTitle: this.youtubeTitle,
          youtubeDescription: this.youtubeDescription,
          youtubePrivacy: this.youtubePrivacy,
        })
      );
      this.setStatus('success', 'Draft saved locally in this browser.');
    } catch {
      this.setStatus('error', 'Could not save draft.');
    }
  }

  loadDraft(): void {
    try {
      const raw = localStorage.getItem('easecontent-youtube-draft');
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (typeof draft.youtubeTitle === 'string') this.youtubeTitle = draft.youtubeTitle;
      if (typeof draft.youtubeDescription === 'string') {
        this.youtubeDescription = draft.youtubeDescription;
      }
      if (['private', 'unlisted', 'public'].includes(draft.youtubePrivacy)) {
        this.youtubePrivacy = draft.youtubePrivacy;
      }
    } catch {
      // ignore invalid draft
    }
  }

  publish(): void {
    if (!this.canSubmit || !this.selectedFile) {
      this.setStatus('error', 'Select a video, enter a title, and connect YouTube first.');
      return;
    }

    this.busy = true;
    this.uploadProgress = 5;
    this.setStatus('info', 'Uploading video to your YouTube channel…');

    this.youtubeService
      .uploadVideoWithProgress(
        this.selectedFile,
        this.youtubeTitle.trim(),
        this.youtubeDescription.trim(),
        this.youtubePrivacy
      )
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploadProgress = Math.min(92, Math.round((event.loaded / event.total) * 90));
          } else if (event.type === HttpEventType.Response && event.body) {
            this.uploadProgress = 100;
            this.setStatus(
              'success',
              event.body.videoUrl
                ? `Uploaded to YouTube: ${event.body.videoUrl}`
                : event.body.message
            );
            this.loadYouTubeHistory();
          }
        },
        error: (err) => {
          this.uploadProgress = 0;
          this.setStatus('error', err?.error?.message || 'YouTube upload failed.');
          this.checkYouTubeStatus();
        },
      });
  }

  clearMedia(): void {
    this.clearPreview();
    this.selectedFile = null;
    this.setStatus('idle', '');
  }

  private setStatus(status: 'idle' | 'success' | 'error' | 'info', message: string): void {
    this.status = status;
    this.statusMessage = message;
  }

  private clearPreview(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.previewUrl = null;
  }

  ngOnDestroy(): void {
    this.clearPreview();
  }
}
