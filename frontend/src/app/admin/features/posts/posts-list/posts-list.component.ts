import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

/**
 * Social publishing UI for the existing /admin/posts route.
 *
 * IMPORTANT: The server endpoint below must be implemented by the backend and
 * must perform the real Meta/YouTube OAuth/API publishing workflow. This UI
 * intentionally reports server errors instead of pretending a post was published.
 */
@Component({
  selector: 'app-posts-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './posts-list.component.html',
  styleUrl: './posts-list.component.scss'
})
export class PostsListComponent implements OnDestroy {
  /** Change this to match the API prefix configured by your Express server. */
  private readonly publishEndpoint = '/api/social-publishing/publish';

  selectedFile: File | null = null;
  previewUrl: string | null = null;
  caption = '';
  youtubeTitle = '';
  youtubeDescription = '';
  youtubePrivacy: 'private' | 'unlisted' | 'public' = 'private';
  publishInstagram = true;
  publishYouTube = false;
  busy = false;
  status: 'idle' | 'success' | 'error' | 'info' = 'idle';
  statusMessage = '';
  private objectUrl: string | null = null;

  constructor(private readonly http: HttpClient) {}

  get isVideo(): boolean {
    return !!this.selectedFile?.type.startsWith('video/');
  }

  get isImage(): boolean {
    return !!this.selectedFile?.type.startsWith('image/');
  }

  get canSubmit(): boolean {
    return !!this.selectedFile && (this.publishInstagram || this.publishYouTube) &&
      !this.busy && (this.isImage || this.isVideo);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.clearPreview();

    if (!file) {
      this.selectedFile = null;
      return;
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      this.selectedFile = null;
      input.value = '';
      this.setStatus('error', 'Choose an image or video file.');
      return;
    }

    // Instagram's supported formats and account eligibility are validated by
    // the server/platform API. This client-side check is only a basic guard.
    this.selectedFile = file;
    this.objectUrl = URL.createObjectURL(file);
    this.previewUrl = this.objectUrl;
    if (!this.youtubeTitle) {
      this.youtubeTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 100);
    }
    this.setStatus('idle', '');
  }

  async saveDraft(): Promise<void> {
    const draft = {
      caption: this.caption,
      youtubeTitle: this.youtubeTitle,
      youtubeDescription: this.youtubeDescription,
      youtubePrivacy: this.youtubePrivacy,
      publishInstagram: this.publishInstagram,
      publishYouTube: this.publishYouTube,
      fileName: this.selectedFile?.name ?? null,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem('cms-social-publisher-draft', JSON.stringify(draft));
      this.setStatus('success', 'Draft saved in this browser. The media file itself is not saved in the draft.');
    } catch {
      this.setStatus('error', 'Could not save the draft in this browser.');
    }
  }

  loadDraft(): void {
    try {
      const raw = localStorage.getItem('cms-social-publisher-draft');
      if (!raw) {
        this.setStatus('info', 'No saved draft was found in this browser.');
        return;
      }
      const draft = JSON.parse(raw);
      this.caption = typeof draft.caption === 'string' ? draft.caption : '';
      this.youtubeTitle = typeof draft.youtubeTitle === 'string' ? draft.youtubeTitle : '';
      this.youtubeDescription = typeof draft.youtubeDescription === 'string' ? draft.youtubeDescription : '';
      this.youtubePrivacy = ['private', 'unlisted', 'public'].includes(draft.youtubePrivacy) ? draft.youtubePrivacy : 'private';
      this.publishInstagram = draft.publishInstagram !== false;
      this.publishYouTube = draft.publishYouTube === true;
      this.setStatus('info', 'Draft fields restored. Please select the media file again before publishing.');
    } catch {
      this.setStatus('error', 'The saved draft could not be read.');
    }
  }

  publish(): void {
    if (!this.canSubmit || !this.selectedFile) {
      this.setStatus('error', 'Select an image or video and at least one destination before publishing.');
      return;
    }
    if (this.publishInstagram && !this.isImage && !this.isVideo) {
      this.setStatus('error', 'Instagram requires a supported image or video.');
      return;
    }
    if (this.publishYouTube && !this.isVideo) {
      this.setStatus('error', 'YouTube publishing requires a video file.');
      return;
    }
    if (this.publishYouTube && !this.youtubeTitle.trim()) {
      this.setStatus('error', 'Enter a YouTube video title.');
      return;
    }

    const body = new FormData();
    body.append('media', this.selectedFile, this.selectedFile.name);
    body.append('caption', this.caption);
    body.append('platforms', JSON.stringify({
      instagram: this.publishInstagram,
      youtube: this.publishYouTube
    }));
    body.append('youtubeTitle', this.youtubeTitle.trim());
    body.append('youtubeDescription', this.youtubeDescription);
    body.append('youtubePrivacy', this.youtubePrivacy);

    this.busy = true;
    this.setStatus('info', 'Sending media to the publishing server…');
    this.http.post<any>(this.publishEndpoint, body).pipe(
      finalize(() => this.busy = false)
    ).subscribe({
      next: (response) => {
        const results = response?.results;
        if (response?.success === true) {
          this.setStatus('success', response.message || 'The server confirmed the publishing request.');
        } else if (results) {
          const summary = Object.entries(results)
            .map(([platform, result]: [string, any]) => `${platform}: ${result?.success ? 'published' : (result?.message || 'failed')}`)
            .join(' · ');
          this.setStatus('info', summary || 'The server responded, but did not confirm a successful publication.');
        } else {
          this.setStatus('info', response?.message || 'Server response received. Verify the platform status before assuming the post is live.');
        }
      },
      error: (error) => {
        const serverMessage = error?.error?.message || error?.message;
        if (error?.status === 404) {
          this.setStatus('error', 'Publishing API endpoint not found. The frontend is ready, but the Express backend must implement POST /api/social-publishing/publish.');
        } else if (error?.status === 401 || error?.status === 403) {
          this.setStatus('error', 'The server rejected this request. Sign in again and check the backend publishing permissions/OAuth connection.');
        } else {
          this.setStatus('error', serverMessage ? `Publishing failed: ${serverMessage}` : 'Publishing failed. Check that the backend is running and inspect its logs.');
        }
      }
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
