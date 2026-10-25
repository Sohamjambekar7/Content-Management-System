import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable } from 'rxjs';

export interface EditorProject {
  id?: number; name: string; mediaType: 'photo' | 'video'; metadata: Record<string, unknown>;
  createdAt?: string; updatedAt?: string;
}
export interface ExportRecord {
  id?: number; projectId?: number | null; format: string; width?: number; height?: number;
  durationSeconds?: number; platform?: string; metadata?: Record<string, unknown>;
}
@Injectable({ providedIn: 'root' })
export class AiEditorService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.BACKEND_API_URL}/editor`;
  projects(): Observable<EditorProject[]> { return this.http.get<EditorProject[]>(`${this.base}/projects`); }
  createProject(project: EditorProject): Observable<EditorProject> { return this.http.post<EditorProject>(`${this.base}/projects`, project); }
  updateProject(id: number, project: Partial<EditorProject>): Observable<EditorProject> { return this.http.patch<EditorProject>(`${this.base}/projects/${id}`, project); }
  recordExport(record: ExportRecord): Observable<ExportRecord> { return this.http.post<ExportRecord>(`${this.base}/exports`, record); }
}
