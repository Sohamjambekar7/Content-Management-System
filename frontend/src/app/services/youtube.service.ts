
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface YouTubeStatus {
  connected: boolean;
}

export interface YouTubeUploadResponse {
  success: boolean;
  message: string;
  videoId?: string;
  videoUrl?: string | null;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}

@Injectable({
  providedIn: 'root'
})
export class YouTubeService {
  private readonly http = inject(HttpClient);

  private readonly apiUrl = 'http://localhost:5000/api/youtube';

  // Check whether YouTube is connected
  getStatus(): Observable<YouTubeStatus> {
    return this.http.get<YouTubeStatus>(
      `${this.apiUrl}/status`
    );
  }

  // Open Google authorization
  connect(): void {
    window.location.href = `${this.apiUrl}/connect`;
  }

  // Upload a video to YouTube
  uploadVideo(
    video: File,
    title: string,
    description: string,
    privacyStatus: 'private' | 'unlisted' | 'public' = 'private'
  ): Observable<YouTubeUploadResponse> {
    const formData = new FormData();

    formData.append('video', video);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('privacyStatus', privacyStatus);

    return this.http.post<YouTubeUploadResponse>(
      `${this.apiUrl}/upload`,
      formData
    );
  }
}
