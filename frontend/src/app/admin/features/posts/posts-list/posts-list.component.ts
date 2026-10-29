
import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import {
  YouTubeService,
  YouTubeStatus
} from '../../../../services/youtube.service';

/**
 * Social publishing UI for the existing /admin/posts route.
 * YouTube OAuth and video uploads use the backend /api/youtube routes.
 */
@Component({
  selector: 'app-posts-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './posts-list.component.html',
  styleUrl: './posts-list.component.scss'
})
export class PostsListComponent implements OnInit, OnDestroy {
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

  youtubeConnected = false;
  checkingYouTube = false;

  private objectUrl: string | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly youtubeService: YouTubeService
  ) {}

  ngOnInit(): void {
    this.checkYouTubeStatus();

    // Restore saved form fields if a draft exists.
    this.loadDraft();
  }

  get isVideo(): boolean {
    return !!this.selectedFile?.type.startsWith('video/');
  }

  get isImage(): boolean {
    return !!this.selectedFile?.type.startsWith('image/');
  }

  get canSubmit(): boolean {
    return !!this.selectedFile &&
      (this.publishInstagram || this.publishYouTube) &&
      !this.busy &&
      (this.isImage || this.isVideo);
  }

  checkYouTubeStatus(): void {
    this.checkingYouTube = true;

    this.youtubeService.getStatus()
      .pipe(finalize(() => {
        this.checkingYouTube = false;
      }))
      .subscribe({
        next: (status: YouTubeStatus) => {
          this.youtubeConnected = status.connected;
        },
        error: () => {
          this.youtubeConnected = false;
          this.setStatus(
            'error',
            'Could not check YouTube connection. Make sure the backend is running.'
          );
        }
      });
  }

  connectYouTube(): void {
    this.youtubeService.connect();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.clearPreview();

    if (!file) {
      this.selectedFile = null;
      return;
    }

    if (!file.type.startsWith('image/') &&
        !file.type.startsWith('video/')) {
      this.selectedFile = null;
      input.value = '';
      this.setStatus('error', 'Choose an image or video file.');
      return;
    }

    this.selectedFile = file;
    this.objectUrl = URL.createObjectURL(file);
    this.previewUrl = this.objectUrl;

    if (!this.youtubeTitle) {
      this.youtubeTitle = file.name
        .replace(/\.[^.]+$/, '')
        .slice(0, 100);
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
      localStorage.setItem(
        'cms-social-publisher-draft',
        JSON.stringify(draft)
      );

      this.setStatus(
        'success',
        'Draft saved in this browser. The media file itself is not saved in the draft.'
      );
    } catch {
      this.setStatus(
        'error',
        'Could not save the draft in this browser.'
      );
    }
  }

  loadDraft(): void {
    try {
      const raw = localStorage.getItem('cms-social-publisher-draft');

      if (!raw) {
        return;
      }

      const draft = JSON.parse(raw);

      this.caption =
        typeof draft.caption === 'string' ? draft.caption : '';

      this.youtubeTitle =
        typeof draft.youtubeTitle === 'string'
          ? draft.youtubeTitle
          : '';

      this.youtubeDescription =
        typeof draft.youtubeDescription === 'string'
          ? draft.youtubeDescription
          : '';

      this.youtubePrivacy = [
        'private',
        'unlisted',
        'public'
      ].includes(draft.youtubePrivacy)
        ? draft.youtubePrivacy
        : 'private';

      this.publishInstagram = draft.publishInstagram !== false;
      this.publishYouTube = draft.publishYouTube === true;
    } catch {
      this.setStatus('error', 'The saved draft could not be read.');
    }
  }

  publish(): void {
    if (!this.canSubmit || !this.selectedFile) {
      this.setStatus(
        'error',
        'Select an image or video and at least one destination before publishing.'
      );
      return;
    }

    if (this.publishInstagram && !this.isImage && !this.isVideo) {
      this.setStatus(
        'error',
        'Instagram requires a supported image or video.'
      );
      return;
    }

    if (this.publishYouTube && !this.isVideo) {
      this.setStatus(
        'error',
        'YouTube publishing requires a video file.'
      );
      return;
    }

    if (this.publishYouTube && !this.youtubeTitle.trim()) {
      this.setStatus('error', 'Enter a YouTube video title.');
      return;
    }

    if (this.publishYouTube && !this.youtubeConnected) {
      this.setStatus(
        'error',
        'Connect your YouTube account before publishing.'
      );
      return;
    }

    this.busy = true;
    this.setStatus('info', 'Sending media to the publishing server…');

    // Use the implemented YouTube upload endpoint when YouTube is selected.
    if (this.publishYouTube && !this.publishInstagram) {
      this.youtubeService.uploadVideo(
        this.selectedFile,
        this.youtubeTitle.trim(),
        this.youtubeDescription,
        this.youtubePrivacy
      ).pipe(
        finalize(() => {
          this.busy = false;
        })
      ).subscribe({
        next: (response) => {
          if (response.success) {
            this.setStatus(
              'success',
              response.videoUrl
                ? `YouTube upload successful: ${response.videoUrl}`
                : response.message
            );
          } else {
            this.setStatus(
              'error',
              response.message || 'YouTube upload was not confirmed.'
            );
          }
        },
        error: (error) => {
          const message = error?.error?.message;

          this.setStatus(
            'error',
            message
              ? `YouTube upload failed: ${message}`
              : 'YouTube upload failed. Check the backend terminal.'
          );

          this.checkYouTubeStatus();
        }
      });

      return;
    }

    // The combined Instagram/YouTube endpoint must be implemented separately.
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

    this.http.post<any>(this.publishEndpoint, body).pipe(
      finalize(() => {
        this.busy = false;
      })
    ).subscribe({
      next: (response) => {
        const results = response?.results;

        if (response?.success === true) {
          this.setStatus(
            'success',
            response.message || 'The server confirmed the publishing request.'
          );
        } else if (results) {
          const summary = Object.entries(results)
            .map(([platform, result]: [string, any]) =>
              `${platform}: ${
                result?.success
                  ? 'published'
                  : (result?.message || 'failed')
              }`
            )
            .join(' · ');

          this.setStatus(
            'info',
            summary || 'The server did not confirm successful publication.'
          );
        } else {
          this.setStatus(
            'info',
            response?.message ||
              'Server response received. Verify the platform status.'
          );
        }
      },
      error: (error) => {
        const serverMessage = error?.error?.message || error?.message;

        if (error?.status === 404) {
          this.setStatus(
            'error',
            'Publishing API endpoint not found. The combined publishing endpoint is not implemented yet.'
          );
        } else if (error?.status === 401 || error?.status === 403) {
          this.setStatus(
            'error',
            'The server rejected this request. Check your login and platform authorization.'
          );
        } else {
          this.setStatus(
            'error',
            serverMessage
              ? `Publishing failed: ${serverMessage}`
              : 'Publishing failed. Check that the backend is running and inspect its logs.'
          );
        }
      }
    });
  }

  clearMedia(): void {
    this.clearPreview();
    this.selectedFile = null;
    this.setStatus('idle', '');
  }

  private setStatus(
    status: 'idle' | 'success' | 'error' | 'info',
    message: string
  ): void {
    this.status = status;
    this.statusMessage = message;
  }

  private clearPreview(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = null;
    this.previewUrl = null;
  }

  ngOnDestroy(): void {
    this.clearPreview();
  }
}
