import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface YouTubeStatus {
  success?: boolean;
  connected: boolean;
  status: 'connected' | 'not_connected' | 'mismatch' | 'expired' | 'revoked';
  needsReauth: boolean;
  sessionEmail: string;
  connectedEmail: string | null;
  channelId: string | null;
  channelTitle: string | null;
  reason?: string;
}

export interface YouTubeConnectResponse {
  success: boolean;
  authUrl: string;
  expectedEmail: string;
}

export interface YouTubePublishRecord {
  id: number;
  userId: number;
  userEmail: string;
  projectId: number | null;
  mediaJobId: string | null;
  videoId: string | null;
  videoUrl: string | null;
  title: string;
  description: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  channelId: string | null;
  channelTitle: string | null;
  status: 'uploading' | 'published' | 'failed';
  errorMessage?: string | null;
  createdAt: string;
}

export interface YouTubeUploadResponse {
  success: boolean;
  message: string;
  videoId?: string | null;
  videoUrl?: string | null;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  channelTitle?: string | null;
  publishRecord?: YouTubePublishRecord;
}

@Injectable({
  providedIn: 'root',
})
export class YouTubeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.BACKEND_API_URL}/api/youtube`;

  getStatus(): Observable<YouTubeStatus> {
    return this.http.get<YouTubeStatus>(`${this.apiUrl}/status`);
  }

  requestConnectUrl(returnPath = '/editor'): Observable<YouTubeConnectResponse> {
    return this.http.post<YouTubeConnectResponse>(`${this.apiUrl}/connect-url`, {
      returnPath,
    });
  }

  disconnect(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/disconnect`,
      {}
    );
  }

  uploadVideo(
    video: File,
    title: string,
    description: string,
    privacyStatus: 'private' | 'unlisted' | 'public' = 'private',
    projectId?: number | null
  ): Observable<YouTubeUploadResponse> {
    const formData = new FormData();
    formData.append('video', video);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('privacyStatus', privacyStatus);
    if (projectId) formData.append('projectId', String(projectId));

    return this.http.post<YouTubeUploadResponse>(`${this.apiUrl}/upload`, formData);
  }

  uploadVideoWithProgress(
    video: File,
    title: string,
    description: string,
    privacyStatus: 'private' | 'unlisted' | 'public' = 'private',
    projectId?: number | null
  ): Observable<HttpEvent<YouTubeUploadResponse>> {
    const formData = new FormData();
    formData.append('video', video);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('privacyStatus', privacyStatus);
    if (projectId) formData.append('projectId', String(projectId));

    return this.http.post<YouTubeUploadResponse>(`${this.apiUrl}/upload`, formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  publishRenderedJob(payload: {
    mediaJobId: string;
    title: string;
    description: string;
    privacyStatus: 'private' | 'unlisted' | 'public';
    projectId?: number | null;
  }): Observable<YouTubeUploadResponse> {
    return this.http.post<YouTubeUploadResponse>(`${this.apiUrl}/upload`, payload);
  }

  getHistory(): Observable<{ success: boolean; history: YouTubePublishRecord[] }> {
    return this.http.get<{ success: boolean; history: YouTubePublishRecord[] }>(
      `${this.apiUrl}/history`
    );
  }
}
