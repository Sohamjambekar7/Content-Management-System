import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

export type FilterPreset =
  | 'none'
  | 'vivid'
  | 'cinematic'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'bw'
  | 'noir';

export type AspectRatioPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface PhotoEditOptions {
  aspectRatio?: AspectRatioPreset;
  cropZoom?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  exposure?: number;
  sharpness?: number;
  filterPreset?: FilterPreset;
  aiEnhance?: boolean;
  captionText?: string;
  captionPosition?: 'top' | 'center' | 'bottom';
  captionColor?: string;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

export interface VideoEditOptions {
  startTime?: number;
  endTime?: number;
  speed?: number;
  aspectRatio?: Exclude<AspectRatioPreset, '4:3'>;
  fitMode?: 'crop' | 'pad';
  brightness?: number;
  contrast?: number;
  saturation?: number;
  exposure?: number;
  sharpness?: number;
  filterPreset?: FilterPreset;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  volume?: number;
  muted?: boolean;
  normalizeAudio?: boolean;
  subtitles?: SubtitleCue[];
  subtitlePosition?: 'top' | 'center' | 'bottom';
}

export interface MediaJobRecord {
  id: string;
  projectId: number | null;
  mediaType: 'photo' | 'video';
  jobType: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stage: string;
  originalFileName?: string | null;
  outputMimeType?: string | null;
  outputUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  options?: Record<string, unknown>;
  resultMetadata?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaJobEvent {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  stage: string;
  outputUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number | null;
  resultMetadata?: Record<string, unknown>;
  errorMessage?: string | null;
}

export interface EditorProject {
  id?: number;
  name: string;
  mediaType: 'photo' | 'video';
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExportRecord {
  id?: number;
  projectId?: number | null;
  format: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  platform?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AiCopyResponse {
  success: boolean;
  suggestedTitle: string;
  suggestedDescription: string;
  hashtags: string[];
  provider: 'gemini' | 'heuristic';
}

@Injectable({ providedIn: 'root' })
export class AiEditorService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly editorBase = `${environment.BACKEND_API_URL}/api/editor`;
  private readonly mediaBase = `${environment.BACKEND_API_URL}/api/media`;

  projects(): Observable<EditorProject[]> {
    return this.http.get<EditorProject[]>(`${this.editorBase}/projects`);
  }

  createProject(project: EditorProject): Observable<EditorProject> {
    return this.http.post<EditorProject>(`${this.editorBase}/projects`, project);
  }

  updateProject(id: number, project: Partial<EditorProject>): Observable<EditorProject> {
    return this.http.patch<EditorProject>(`${this.editorBase}/projects/${id}`, project);
  }

  deleteProject(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.editorBase}/projects/${id}`);
  }

  listExports(): Observable<ExportRecord[]> {
    return this.http.get<ExportRecord[]>(`${this.editorBase}/exports`);
  }

  recordExport(record: ExportRecord): Observable<ExportRecord> {
    return this.http.post<ExportRecord>(`${this.editorBase}/exports`, record);
  }

  submitPhotoJob(
    file: File,
    options: PhotoEditOptions,
    projectId?: number | null
  ): Observable<{ success: boolean; job: MediaJobRecord }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify(options));
    if (projectId) formData.append('projectId', String(projectId));
    return this.http.post<{ success: boolean; job: MediaJobRecord }>(
      `${this.mediaBase}/jobs/photo`,
      formData
    );
  }

  submitVideoJob(
    file: File,
    options: VideoEditOptions,
    projectId?: number | null
  ): Observable<{ success: boolean; job: MediaJobRecord }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify(options));
    if (projectId) formData.append('projectId', String(projectId));
    return this.http.post<{ success: boolean; job: MediaJobRecord }>(
      `${this.mediaBase}/jobs/video`,
      formData
    );
  }

  submitAiVideoAnalysis(
    file: File,
    mode: 'smart-trim' | 'highlights' | 'auto-caption',
    topic?: string
  ): Observable<{ success: boolean; job: MediaJobRecord }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    if (topic) formData.append('topic', topic);
    return this.http.post<{ success: boolean; job: MediaJobRecord }>(
      `${this.mediaBase}/ai/analyze`,
      formData
    );
  }

  generateAiCopy(payload: {
    topic: string;
    mediaType: 'photo' | 'video';
    durationSeconds?: number;
    captionHints?: string[];
    tone?: string;
  }): Observable<AiCopyResponse> {
    return this.http.post<AiCopyResponse>(`${this.mediaBase}/ai/copy`, payload);
  }

  listJobs(): Observable<{ success: boolean; jobs: MediaJobRecord[] }> {
    return this.http.get<{ success: boolean; jobs: MediaJobRecord[] }>(`${this.mediaBase}/jobs`);
  }

  getJob(jobId: string): Observable<{ success: boolean; job: MediaJobRecord }> {
    return this.http.get<{ success: boolean; job: MediaJobRecord }>(
      `${this.mediaBase}/jobs/${jobId}`
    );
  }

  deleteJob(jobId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.mediaBase}/jobs/${jobId}`);
  }

  getJobOutputUrl(jobId: string, download = false): string {
    const token = this.auth.session?.accessToken || '';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (download) params.set('download', '1');
    return `${this.mediaBase}/jobs/${jobId}/output?${params.toString()}`;
  }

  watchJobEvents(jobId: string): Observable<MediaJobEvent> {
    return new Observable<MediaJobEvent>((observer) => {
      const token = this.auth.session?.accessToken || '';
      const url = `${this.mediaBase}/jobs/${jobId}/events?token=${encodeURIComponent(token)}`;
      const source = new EventSource(url);

      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as MediaJobEvent;
          observer.next(parsed);
          if (
            parsed.status === 'completed' ||
            parsed.status === 'failed' ||
            parsed.status === 'cancelled'
          ) {
            source.close();
            observer.complete();
          }
        } catch {
          // ignore keepalive/malformed frames
        }
      };

      source.onerror = () => {
        source.close();
        // Fall back to one-shot HTTP poll if SSE drops
        this.getJob(jobId).subscribe({
          next: (res) => {
            observer.next({
              jobId: res.job.id,
              status: res.job.status,
              progress: res.job.progress,
              stage: res.job.stage,
              outputUrl: res.job.outputUrl,
              width: res.job.width,
              height: res.job.height,
              durationSeconds: res.job.durationSeconds,
              fileSizeBytes: res.job.fileSizeBytes,
              resultMetadata: res.job.resultMetadata,
              errorMessage: res.job.errorMessage,
            });
            observer.complete();
          },
          error: (err) => observer.error(err),
        });
      };

      return () => {
        source.close();
      };
    });
  }
}
