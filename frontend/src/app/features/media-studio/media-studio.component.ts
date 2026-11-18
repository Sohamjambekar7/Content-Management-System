import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Canvas, FabricImage, IText, Rect, filters as FabricFilters } from 'fabric';
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { AuthService } from '../../core/services/auth.service';
import {
  AiEditorService,
  AspectRatioPreset,
  EditorProject,
  FilterPreset,
  MediaJobRecord,
  PhotoEditOptions,
  SubtitleCue,
  VideoEditOptions,
} from '../ai-editor/ai-editor.service';
import {
  YouTubePublishRecord,
  YouTubeService,
  YouTubeStatus,
} from '../../services/youtube.service';

type StudioTab = 'photo' | 'video' | 'history';

interface HighlightClip {
  id: number;
  label: string;
  start: number;
  end: number;
  score: number;
}

@Component({
  selector: 'app-media-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './media-studio.component.html',
  styleUrl: './media-studio.component.scss',
})
export class MediaStudioComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly authService = inject(AuthService);
  private readonly studioService = inject(AiEditorService);
  private readonly youtubeService = inject(YouTubeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('photoCanvas') photoCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoPlayer') videoPlayerRef?: ElementRef<HTMLVideoElement>;

  activeTab: StudioTab = 'photo';
  projectName = 'Untitled EASEContent Project';
  activeProjectId: number | null = null;
  bannerNotice = '';
  bannerType: 'info' | 'success' | 'error' | 'warning' = 'info';

  // ---------------- Photo Editor State ----------------
  private fabricCanvas?: Canvas;
  private originalPhotoEl: HTMLImageElement | null = null;
  private photoObjectUrl: string | null = null;
  private segmenter: ImageSegmenter | null = null;
  private destroyed = false;

  photoFile: File | null = null;
  photoBusy = false;
  photoStatus = 'Upload a JPG, PNG, or WebP photo to start editing.';
  photoAiProgress = 0;

  photoOpts: Required<PhotoEditOptions> = {
    aspectRatio: 'original',
    cropZoom: 100,
    rotation: 0,
    flipH: false,
    flipV: false,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    sharpness: 0,
    filterPreset: 'none',
    aiEnhance: false,
    captionText: '',
    captionPosition: 'bottom',
    captionColor: '#ffffff',
    format: 'png',
    quality: 92,
  };

  photoRenderJob: MediaJobRecord | null = null;
  photoRenderedPreviewUrl: string | null = null;

  // ---------------- Video Editor State ----------------
  videoFile: File | null = null;
  videoPreviewUrl: string | null = null;
  videoDuration = 0;
  videoCurrentTime = 0;
  videoStatus = 'Upload an MP4, WebM, or MOV video to edit, enhance, and publish to YouTube.';
  videoBusy = false;

  videoOpts: Required<VideoEditOptions> = {
    startTime: 0,
    endTime: 0,
    speed: 1,
    aspectRatio: '16:9',
    fitMode: 'crop',
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    sharpness: 0,
    filterPreset: 'none',
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    volume: 100,
    muted: false,
    normalizeAudio: false,
    subtitles: [],
    subtitlePosition: 'bottom',
  };

  newSubtitleText = '';
  aiVideoBusy = false;
  aiVideoProgress = 0;
  aiVideoStage = '';
  aiVideoSummary = '';
  aiHighlights: HighlightClip[] = [];

  videoRenderJob: MediaJobRecord | null = null;
  videoRenderedPreviewUrl: string | null = null;

  // ---------------- YouTube Publish Modal State ----------------
  showYouTubeModal = false;
  youtubeStatus: YouTubeStatus | null = null;
  checkingYouTube = false;
  connectingYouTube = false;
  youtubeTitle = '';
  youtubeDescription = '';
  youtubePrivacy: 'private' | 'unlisted' | 'public' = 'private';
  youtubeSourceMode: 'rendered' | 'original' = 'rendered';
  youtubeUploading = false;
  youtubeUploadProgress = 0;
  youtubeUploadError = '';
  youtubeUploadResult: {
    videoId?: string | null;
    videoUrl?: string | null;
    privacyStatus?: string;
    channelTitle?: string | null;
  } | null = null;
  generatingAiCopy = false;

  // ---------------- Workspace History State ----------------
  projects: EditorProject[] = [];
  jobs: MediaJobRecord[] = [];
  youtubeHistory: YouTubePublishRecord[] = [];

  readonly filterPresets: Array<{ id: FilterPreset; label: string }> = [
    { id: 'none', label: 'Original' },
    { id: 'vivid', label: 'Vivid' },
    { id: 'cinematic', label: 'Cinematic' },
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'vintage', label: 'Vintage' },
    { id: 'bw', label: 'B&W' },
    { id: 'noir', label: 'Noir' },
  ];

  readonly photoRatios: AspectRatioPreset[] = ['original', '16:9', '9:16', '1:1', '4:5', '4:3'];
  readonly videoRatios: Array<Exclude<AspectRatioPreset, '4:3'>> = [
    '16:9',
    '9:16',
    '1:1',
    '4:5',
    'original',
  ];
  readonly quickHashtags = ['#EASEContent', '#Shorts', '#ContentCreator', '#Tutorial', '#Vlog'];

  private subscriptions = new Subscription();

  get sessionEmail(): string {
    return this.authService.session?.user?.email || '';
  }

  get activeSubtitleText(): string {
    const t = this.videoCurrentTime;
    const match = this.videoOpts.subtitles.find((c) => t >= c.start && t <= c.end);
    return match ? match.text : '';
  }

  get liveVideoCssFilter(): string {
    return this.buildCssFilter(
      this.videoOpts.brightness,
      this.videoOpts.contrast,
      this.videoOpts.saturation,
      this.videoOpts.exposure,
      this.videoOpts.filterPreset
    );
  }

  get canPublishVideoToYouTube(): boolean {
    const hasRendered = Boolean(this.videoRenderJob?.status === 'completed');
    const hasSource = Boolean(this.videoFile);
    return (
      Boolean(this.youtubeStatus?.connected) &&
      !this.youtubeUploading &&
      this.youtubeTitle.trim().length > 0 &&
      this.youtubeTitle.trim().length <= 100 &&
      ((this.youtubeSourceMode === 'rendered' && hasRendered) ||
        (this.youtubeSourceMode === 'original' && hasSource))
    );
  }

  ngOnInit(): void {
    this.refreshYouTubeStatus();
    this.loadWorkspaceHistory();

    this.subscriptions.add(
      this.route.queryParams.subscribe((params) => {
        const yt = params['youtube'];
        if (!yt) return;

        this.activeTab = 'video';
        this.showYouTubeModal = true;
        this.refreshYouTubeStatus();

        if (yt === 'connected') {
          const channel = params['channel'] ? ` (${params['channel']})` : '';
          this.setBanner(
            'success',
            `YouTube account verified and connected for ${this.sessionEmail}${channel}.`
          );
        } else if (yt === 'email_mismatch') {
          const expected = params['expected'] || this.sessionEmail;
          const actual = params['actual'] || 'a different Google account';
          this.setBanner(
            'error',
            `Account mismatch: You signed in to Google as ${actual}, which does not match your EASEContent login email (${expected}). Re-authorize using ${expected}.`
          );
        } else if (yt === 'denied') {
          this.setBanner('warning', 'YouTube authorization was cancelled.');
        } else {
          this.setBanner('error', 'Could not complete YouTube authorization. Please try again.');
        }

        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      })
    );
  }

  ngAfterViewInit(): void {
    this.initPhotoCanvas();
  }

  switchTab(tab: StudioTab): void {
    this.activeTab = tab;
    if (tab === 'photo') {
      setTimeout(() => {
        if (!this.fabricCanvas) {
          this.initPhotoCanvas();
        }
        if (this.originalPhotoEl) {
          this.renderPhotoToCanvas(this.originalPhotoEl);
        }
      });
    } else if (tab === 'history') {
      this.loadWorkspaceHistory();
    }
  }

  private initPhotoCanvas(): void {
    if (!this.photoCanvasRef?.nativeElement) return;
    if (this.fabricCanvas) {
      this.fabricCanvas.dispose();
    }
    this.fabricCanvas = new Canvas(this.photoCanvasRef.nativeElement, {
      width: 860,
      height: 540,
      backgroundColor: '#0f172a',
      preserveObjectStacking: true,
      selection: true,
    });
    this.fabricCanvas.renderAll();
  }

  // ==================== PHOTO EDITING ====================

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.photoStatus = 'Choose a JPG, PNG, or WebP image.';
      input.value = '';
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      this.photoStatus = 'Please choose an image smaller than 25 MB.';
      input.value = '';
      return;
    }

    this.photoFile = file;
    this.projectName = this.baseName(file.name);
    this.photoRenderedPreviewUrl = null;
    this.photoRenderJob = null;

    if (this.photoObjectUrl) {
      URL.revokeObjectURL(this.photoObjectUrl);
    }
    const url = URL.createObjectURL(file);
    this.photoObjectUrl = url;

    const img = new Image();
    img.onload = () => {
      if (this.destroyed || this.photoObjectUrl !== url) return;
      this.originalPhotoEl = img;
      this.resetPhotoAdjustments(false);
      this.renderPhotoToCanvas(img);
      this.photoStatus = `Loaded ${file.name} (${img.naturalWidth}×${img.naturalHeight}).`;
    };
    img.onerror = () => {
      this.photoStatus = 'Could not read this image file.';
    };
    img.src = url;
    input.value = '';
  }

  private renderPhotoToCanvas(img: HTMLImageElement): void {
    if (!this.fabricCanvas) this.initPhotoCanvas();
    const canvas = this.fabricCanvas;
    if (!canvas) return;

    // Preserve user-added text/shape overlays while refreshing the base image
    const overlays = canvas.getObjects().filter((obj) => obj.type !== 'image');
    canvas.clear();
    canvas.backgroundColor = '#0f172a';

    // Compute cropped/transformed offscreen raster for accurate aspect ratio & zoom preview
    const offscreen = this.buildProcessedPhotoCanvas(img);
    const fabricImg = new FabricImage(offscreen, {
      selectable: false,
      evented: false,
      objectCaching: false,
    });

    const scale = Math.min(820 / offscreen.width, 500 / offscreen.height, 1);
    fabricImg.scale(scale);
    fabricImg.set({
      left: (canvas.width! - offscreen.width * scale) / 2,
      top: (canvas.height! - offscreen.height * scale) / 2,
    });

    canvas.add(fabricImg);
    canvas.sendObjectToBack(fabricImg);
    overlays.forEach((o) => canvas.add(o));
    canvas.requestRenderAll();
  }

  private buildProcessedPhotoCanvas(img: HTMLImageElement): HTMLCanvasElement {
    const rot = ((this.photoOpts.rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const baseW = swap ? img.naturalHeight : img.naturalWidth;
    const baseH = swap ? img.naturalWidth : img.naturalHeight;

    // Step 1: rotate + flip onto temp canvas
    const transformed = document.createElement('canvas');
    transformed.width = baseW;
    transformed.height = baseH;
    const tCtx = transformed.getContext('2d')!;
    tCtx.translate(baseW / 2, baseH / 2);
    tCtx.rotate((rot * Math.PI) / 180);
    tCtx.scale(this.photoOpts.flipH ? -1 : 1, this.photoOpts.flipV ? -1 : 1);
    tCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    // Step 2: zoom + aspect ratio crop
    const zoomFactor = Math.max(0.2, Math.min(1, this.photoOpts.cropZoom / 100));
    let cropW = baseW * zoomFactor;
    let cropH = baseH * zoomFactor;
    const targetRatio = this.getRatioNumber(this.photoOpts.aspectRatio);
    if (targetRatio) {
      if (cropW / cropH > targetRatio) {
        cropW = cropH * targetRatio;
      } else {
        cropH = cropW / targetRatio;
      }
    }

    const outW = Math.max(1, Math.round(cropW));
    const outH = Math.max(1, Math.round(cropH));
    const sx = Math.round((baseW - outW) / 2);
    const sy = Math.round((baseH - outH) / 2);

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d')!;
    ctx.filter = this.buildCssFilter(
      this.photoOpts.brightness,
      this.photoOpts.contrast,
      this.photoOpts.saturation,
      this.photoOpts.exposure,
      this.photoOpts.filterPreset
    );
    ctx.drawImage(transformed, sx, sy, outW, outH, 0, 0, outW, outH);
    ctx.filter = 'none';

    if (this.photoOpts.sharpness > 0 && outW * outH <= 2_400_000) {
      const imageData = ctx.getImageData(0, 0, outW, outH);
      const src = new Uint8ClampedArray(imageData.data);
      const amt = (this.photoOpts.sharpness / 100) * 0.6;
      for (let y = 1; y < outH - 1; y++) {
        for (let x = 1; x < outW - 1; x++) {
          const i = (y * outW + x) * 4;
          for (let c = 0; c < 3; c++) {
            imageData.data[i + c] = Math.max(
              0,
              Math.min(
                255,
                src[i + c] * (1 + 4 * amt) -
                  amt * (src[i - 4 + c] + src[i + 4 + c] + src[i - outW * 4 + c] + src[i + outW * 4 + c])
              )
            );
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    return out;
  }

  applyPhotoAdjustments(): void {
    if (!this.originalPhotoEl) return;
    this.renderPhotoToCanvas(this.originalPhotoEl);
  }

  rotatePhoto(delta: number): void {
    if (!this.originalPhotoEl) return;
    this.photoOpts.rotation = (((this.photoOpts.rotation + delta) % 360) + 360) % 360;
    this.renderPhotoToCanvas(this.originalPhotoEl);
    this.photoStatus = `Rotated photo to ${this.photoOpts.rotation}°.`;
  }

  toggleFlip(axis: 'h' | 'v'): void {
    if (!this.originalPhotoEl) return;
    if (axis === 'h') this.photoOpts.flipH = !this.photoOpts.flipH;
    else this.photoOpts.flipV = !this.photoOpts.flipV;
    this.renderPhotoToCanvas(this.originalPhotoEl);
  }

  setPhotoFilter(preset: FilterPreset): void {
    this.photoOpts.filterPreset = preset;
    this.applyPhotoAdjustments();
  }

  setPhotoRatio(ratio: AspectRatioPreset): void {
    this.photoOpts.aspectRatio = ratio;
    this.applyPhotoAdjustments();
  }

  resetPhotoAdjustments(redraw = true): void {
    this.photoOpts = {
      ...this.photoOpts,
      aspectRatio: 'original',
      cropZoom: 100,
      rotation: 0,
      flipH: false,
      flipV: false,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      exposure: 0,
      sharpness: 0,
      filterPreset: 'none',
      aiEnhance: false,
    };
    if (redraw && this.originalPhotoEl) {
      this.renderPhotoToCanvas(this.originalPhotoEl);
      this.photoStatus = 'Photo adjustments reset to original.';
    }
  }

  addTextOverlay(): void {
    if (!this.fabricCanvas) return;
    const text = new IText(this.photoOpts.captionText.trim() || 'EASEContent Caption', {
      left: 160,
      top: 120,
      fontSize: 34,
      fill: this.photoOpts.captionColor || '#ffffff',
      fontFamily: 'Inter, Arial, sans-serif',
      fontWeight: 'bold',
      stroke: '#0f172a',
      strokeWidth: 1,
      editable: true,
    });
    this.fabricCanvas.add(text);
    this.fabricCanvas.setActiveObject(text);
    this.fabricCanvas.requestRenderAll();
    this.photoStatus = 'Caption added to canvas. Drag to position or double-click to edit.';
  }

  addAccentShape(): void {
    if (!this.fabricCanvas) return;
    const rect = new Rect({
      left: 140,
      top: 140,
      width: 220,
      height: 110,
      rx: 12,
      ry: 12,
      fill: 'rgba(79, 70, 229, 0.25)',
      stroke: '#6366f1',
      strokeWidth: 3,
    });
    this.fabricCanvas.add(rect);
    this.fabricCanvas.setActiveObject(rect);
    this.fabricCanvas.requestRenderAll();
    this.photoStatus = 'Shape added. Drag corners to resize.';
  }

  deleteSelectedOverlay(): void {
    if (!this.fabricCanvas) return;
    const selected = this.fabricCanvas.getActiveObjects().filter((o) => o.type !== 'image');
    if (selected.length === 0) {
      this.photoStatus = 'Select a text or shape overlay to delete.';
      return;
    }
    selected.forEach((o) => this.fabricCanvas?.remove(o));
    this.fabricCanvas.discardActiveObject();
    this.fabricCanvas.requestRenderAll();
    this.photoStatus = 'Overlay removed.';
  }

  private async getSegmenter(): Promise<ImageSegmenter> {
    if (!this.segmenter) {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      this.segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    }
    return this.segmenter;
  }

  async applyAiBackgroundBlur(): Promise<void> {
    if (!this.originalPhotoEl || this.photoBusy) return;
    this.photoBusy = true;
    this.photoAiProgress = 15;
    this.photoStatus = 'Loading MediaPipe AI portrait segmentation model…';
    let mask: ReturnType<ImageSegmenter['segment']>['categoryMask'] = undefined;

    try {
      const segmenter = await this.getSegmenter();

      this.photoAiProgress = 55;
      this.photoStatus = 'Segmenting subject and blurring background…';
      const img = this.originalPhotoEl;
      const scale = Math.min(1, 960 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      source.getContext('2d')!.drawImage(img, 0, 0, width, height);

      const segResult = segmenter.segment(source);
      mask = segResult.categoryMask;
      if (!mask) throw new Error('Segmentation mask unavailable.');

      const maskData = mask.getAsUint8Array();
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const mCtx = maskCanvas.getContext('2d')!;
      const pixels = mCtx.createImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(mask.width - 1, Math.floor((x * mask.width) / width));
          const sy = Math.min(mask.height - 1, Math.floor((y * mask.height) / height));
          const idx = (y * width + x) * 4;
          const fg = maskData[sy * mask.width + sx] > 0;
          pixels.data[idx] = 255;
          pixels.data[idx + 1] = 255;
          pixels.data[idx + 2] = 255;
          pixels.data[idx + 3] = fg ? 255 : 0;
        }
      }
      mCtx.putImageData(pixels, 0, 0);

      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const outCtx = out.getContext('2d')!;
      outCtx.filter = 'blur(12px)';
      outCtx.drawImage(source, 0, 0);
      outCtx.filter = 'none';

      const fgCanvas = document.createElement('canvas');
      fgCanvas.width = width;
      fgCanvas.height = height;
      const fgCtx = fgCanvas.getContext('2d')!;
      fgCtx.drawImage(source, 0, 0);
      fgCtx.globalCompositeOperation = 'destination-in';
      fgCtx.drawImage(maskCanvas, 0, 0);
      outCtx.drawImage(fgCanvas, 0, 0);

      await this.replaceOriginalPhotoFromDataUrl(out.toDataURL('image/png'));
      this.photoAiProgress = 100;
      this.photoStatus = 'AI portrait background blur applied.';
    } catch (err) {
      console.error('AI background blur failed:', err);
      this.photoStatus = 'AI background blur unavailable (check internet/WebGL support).';
    } finally {
      mask?.close();
      this.photoBusy = false;
    }
  }

  async applyAiBackgroundRemoval(): Promise<void> {
    if (!this.originalPhotoEl || this.photoBusy) return;
    this.photoBusy = true;
    this.photoAiProgress = 20;
    this.photoStatus = 'Loading MediaPipe AI portrait segmentation model…';
    let mask: ReturnType<ImageSegmenter['segment']>['categoryMask'] = undefined;

    try {
      const segmenter = await this.getSegmenter();
      this.photoAiProgress = 60;
      this.photoStatus = 'Segmenting subject and removing background…';
      const img = this.originalPhotoEl;
      const scale = Math.min(1, 960 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));

      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      source.getContext('2d')!.drawImage(img, 0, 0, width, height);

      const segResult = segmenter.segment(source);
      mask = segResult.categoryMask;
      if (!mask) throw new Error('Segmentation mask unavailable.');

      const maskData = mask.getAsUint8Array();
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const mCtx = maskCanvas.getContext('2d')!;
      const pixels = mCtx.createImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.min(mask.width - 1, Math.floor((x * mask.width) / width));
          const sy = Math.min(mask.height - 1, Math.floor((y * mask.height) / height));
          const idx = (y * width + x) * 4;
          const fg = maskData[sy * mask.width + sx] > 0;
          pixels.data[idx] = 255;
          pixels.data[idx + 1] = 255;
          pixels.data[idx + 2] = 255;
          pixels.data[idx + 3] = fg ? 255 : 0;
        }
      }
      mCtx.putImageData(pixels, 0, 0);

      const fgCanvas = document.createElement('canvas');
      fgCanvas.width = width;
      fgCanvas.height = height;
      const fgCtx = fgCanvas.getContext('2d')!;
      fgCtx.drawImage(source, 0, 0);
      fgCtx.globalCompositeOperation = 'destination-in';
      fgCtx.drawImage(maskCanvas, 0, 0);

      await this.replaceOriginalPhotoFromDataUrl(fgCanvas.toDataURL('image/png'));
      this.photoAiProgress = 100;
      this.photoStatus = 'AI background removed cleanly in-browser.';
    } catch (err) {
      console.error('AI background removal failed:', err);
      this.photoStatus = 'AI background removal unavailable (check internet/WebGL support).';
    } finally {
      mask?.close();
      this.photoBusy = false;
    }
  }

  private async replaceOriginalPhotoFromDataUrl(dataUrl: string): Promise<void> {
    const updated = new Image();
    await new Promise<void>((resolve, reject) => {
      updated.onload = () => resolve();
      updated.onerror = () => reject(new Error('Failed to load processed image.'));
      updated.src = dataUrl;
    });
    this.originalPhotoEl = updated;
    this.renderPhotoToCanvas(updated);
  }

  exportPhotoInstant(): void {
    if (!this.fabricCanvas) return;
    this.fabricCanvas.discardActiveObject();
    this.fabricCanvas.requestRenderAll();

    const format = this.photoOpts.format;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const dataUrl = this.fabricCanvas.toDataURL({
      format: format === 'webp' ? 'webp' : format,
      quality: this.photoOpts.quality / 100,
      multiplier: 2,
    });

    const link = document.createElement('a');
    link.download = `${this.baseName(this.projectName)}.${ext}`;
    link.href = dataUrl;
    link.click();

    this.photoStatus = `Exported ${ext.toUpperCase()} (${this.photoOpts.quality}% quality).`;
    this.studioService
      .recordExport({
        projectId: this.activeProjectId,
        format,
        platform: 'local-download',
        metadata: { ...this.photoOpts },
      })
      .subscribe({ error: () => undefined });
  }

  renderPhotoOnWorker(aiEnhance = false): void {
    if (!this.photoFile || this.photoBusy) return;
    this.photoBusy = true;
    this.photoOpts.aiEnhance = aiEnhance;
    this.photoRenderedPreviewUrl = null;
    this.photoStatus = aiEnhance
      ? 'Submitting AI Smart Enhance job to EASEContent media worker…'
      : 'Submitting high-res photo render job…';

    this.studioService.submitPhotoJob(this.photoFile, this.photoOpts, this.activeProjectId).subscribe({
      next: ({ job }) => {
        this.photoRenderJob = job;
        this.subscriptions.add(
          this.studioService.watchJobEvents(job.id).subscribe({
            next: (evt) => {
              this.photoRenderJob = {
                ...job,
                status: evt.status,
                progress: evt.progress,
                stage: evt.stage,
                width: evt.width,
                height: evt.height,
                fileSizeBytes: evt.fileSizeBytes,
                errorMessage: evt.errorMessage,
              };
              this.photoStatus = `${evt.stage} (${evt.progress}%)`;

              if (evt.status === 'completed') {
                this.photoBusy = false;
                this.photoRenderedPreviewUrl = this.studioService.getJobOutputUrl(job.id);
                this.photoStatus = 'Server photo render complete. Preview or download below.';
                this.loadWorkspaceHistory();
              } else if (evt.status === 'failed') {
                this.photoBusy = false;
                this.photoStatus = evt.errorMessage || 'Photo rendering failed.';
              }
            },
            error: () => {
              this.photoBusy = false;
              this.photoStatus = 'Lost real-time job stream; check History tab for job status.';
            },
          })
        );
      },
      error: (err) => {
        this.photoBusy = false;
        this.photoStatus = err?.error?.message || 'Could not queue photo render job.';
      },
    });
  }

  // ==================== VIDEO EDITING ====================

  onVideoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      this.videoStatus = 'Select a valid MP4, WebM, or MOV video file.';
      input.value = '';
      return;
    }

    if (this.videoPreviewUrl) {
      URL.revokeObjectURL(this.videoPreviewUrl);
    }

    this.videoFile = file;
    this.videoPreviewUrl = URL.createObjectURL(file);
    this.projectName = this.baseName(file.name);
    this.youtubeTitle = this.baseName(file.name).replace(/[-_]+/g, ' ').slice(0, 100);
    this.videoRenderJob = null;
    this.videoRenderedPreviewUrl = null;
    this.aiHighlights = [];
    this.aiVideoSummary = '';
    this.videoStatus = `Loaded ${file.name}. Configure trim, framing, audio, captions, or run AI helpers.`;
    input.value = '';
  }

  onVideoMetadataLoaded(video: HTMLVideoElement): void {
    this.videoDuration = Number((video.duration || 0).toFixed(2));
    this.videoOpts.startTime = 0;
    this.videoOpts.endTime = this.videoDuration;
    this.syncPlayerAudio();
  }

  onVideoTimeUpdate(video: HTMLVideoElement): void {
    this.videoCurrentTime = Number(video.currentTime.toFixed(2));
    if (this.videoOpts.endTime > 0 && video.currentTime >= this.videoOpts.endTime && !video.paused) {
      video.pause();
      video.currentTime = this.videoOpts.startTime;
    }
  }

  syncPlayerAudio(): void {
    const player = this.videoPlayerRef?.nativeElement;
    if (!player) return;
    player.muted = this.videoOpts.muted;
    player.volume = Math.min(1, Math.max(0, this.videoOpts.volume / 100));
    player.playbackRate = this.videoOpts.speed;
  }

  setTrimPoint(which: 'start' | 'end'): void {
    const t = Number(this.videoCurrentTime.toFixed(2));
    if (which === 'start') {
      this.videoOpts.startTime = Math.min(t, Math.max(0, this.videoOpts.endTime - 0.5));
    } else {
      this.videoOpts.endTime = Math.max(t, Math.min(this.videoDuration, this.videoOpts.startTime + 0.5));
    }
  }

  applyHighlightRange(clip: HighlightClip): void {
    this.videoOpts.startTime = clip.start;
    this.videoOpts.endTime = clip.end;
    const player = this.videoPlayerRef?.nativeElement;
    if (player) {
      player.currentTime = clip.start;
    }
    this.videoStatus = `Applied highlight "${clip.label}" (${clip.start}s – ${clip.end}s).`;
  }

  addSubtitleCue(): void {
    const text = this.newSubtitleText.trim();
    if (!text) return;
    const start = Number(this.videoCurrentTime.toFixed(2));
    const end = Number(Math.min(this.videoDuration || start + 4, start + 3.5).toFixed(2));
    this.videoOpts.subtitles = [...this.videoOpts.subtitles, { start, end, text }];
    this.newSubtitleText = '';
  }

  removeSubtitleCue(index: number): void {
    this.videoOpts.subtitles = this.videoOpts.subtitles.filter((_, i) => i !== index);
  }

  runAiVideoHelper(mode: 'smart-trim' | 'highlights' | 'auto-caption'): void {
    if (!this.videoFile || this.aiVideoBusy) return;
    this.aiVideoBusy = true;
    this.aiVideoProgress = 10;
    this.aiVideoStage = `Queueing AI ${mode}…`;
    this.aiVideoSummary = '';

    this.studioService.submitAiVideoAnalysis(this.videoFile, mode, this.projectName).subscribe({
      next: ({ job }) => {
        this.subscriptions.add(
          this.studioService.watchJobEvents(job.id).subscribe({
            next: (evt) => {
              this.aiVideoProgress = evt.progress;
              this.aiVideoStage = evt.stage;
              if (evt.status === 'completed') {
                this.aiVideoBusy = false;
                const data = (evt.resultMetadata || {}) as Record<string, any>;
                this.aiVideoSummary = String(data['summary'] || 'AI analysis finished.');

                if (mode === 'smart-trim') {
                  if (typeof data['recommendedStart'] === 'number') {
                    this.videoOpts.startTime = data['recommendedStart'];
                  }
                  if (typeof data['recommendedEnd'] === 'number') {
                    this.videoOpts.endTime = data['recommendedEnd'];
                  }
                } else if (mode === 'highlights' && Array.isArray(data['highlights'])) {
                  this.aiHighlights = data['highlights'] as HighlightClip[];
                } else if (mode === 'auto-caption') {
                  if (Array.isArray(data['captions'])) {
                    this.videoOpts.subtitles = data['captions'] as SubtitleCue[];
                  }
                  if (typeof data['suggestedTitle'] === 'string' && !this.youtubeTitle) {
                    this.youtubeTitle = data['suggestedTitle'].slice(0, 100);
                  }
                  if (typeof data['suggestedDescription'] === 'string' && !this.youtubeDescription) {
                    this.youtubeDescription = data['suggestedDescription'];
                  }
                }
              } else if (evt.status === 'failed') {
                this.aiVideoBusy = false;
                this.aiVideoSummary = evt.errorMessage || 'AI analysis failed.';
              }
            },
            error: () => {
              this.aiVideoBusy = false;
              this.aiVideoSummary = 'Lost connection to AI analysis job.';
            },
          })
        );
      },
      error: (err) => {
        this.aiVideoBusy = false;
        this.aiVideoSummary = err?.error?.message || 'Could not start AI analysis.';
      },
    });
  }

  renderVideoOnWorker(): void {
    if (!this.videoFile || this.videoBusy) return;
    if (this.videoOpts.endTime <= this.videoOpts.startTime) {
      this.videoStatus = 'End time must be greater than start time.';
      return;
    }

    this.videoBusy = true;
    this.videoRenderedPreviewUrl = null;
    this.videoStatus = 'Submitting video timeline to async FFmpeg worker…';

    this.studioService.submitVideoJob(this.videoFile, this.videoOpts, this.activeProjectId).subscribe({
      next: ({ job }) => {
        this.videoRenderJob = job;
        this.subscriptions.add(
          this.studioService.watchJobEvents(job.id).subscribe({
            next: (evt) => {
              this.videoRenderJob = {
                ...job,
                status: evt.status,
                progress: evt.progress,
                stage: evt.stage,
                width: evt.width,
                height: evt.height,
                durationSeconds: evt.durationSeconds,
                fileSizeBytes: evt.fileSizeBytes,
                errorMessage: evt.errorMessage,
              };
              this.videoStatus = `${evt.stage} (${evt.progress}%)`;

              if (evt.status === 'completed') {
                this.videoBusy = false;
                this.videoRenderedPreviewUrl = this.studioService.getJobOutputUrl(job.id);
                this.youtubeSourceMode = 'rendered';
                this.videoStatus =
                  'Video render complete! Preview your final MP4 below or publish directly to YouTube.';
                this.loadWorkspaceHistory();
              } else if (evt.status === 'failed') {
                this.videoBusy = false;
                this.videoStatus = evt.errorMessage || 'Video render failed.';
              }
            },
            error: () => {
              this.videoBusy = false;
              this.videoStatus = 'Real-time progress stream interrupted. Refresh History to check status.';
            },
          })
        );
      },
      error: (err) => {
        this.videoBusy = false;
        this.videoStatus = err?.error?.message || 'Failed to enqueue video render job.';
      },
    });
  }

  getJobDownloadUrl(jobId: string): string {
    return this.studioService.getJobOutputUrl(jobId, true);
  }

  // ==================== PROJECT PERSISTENCE ====================

  saveStudioProject(): void {
    const mediaType: 'photo' | 'video' = this.activeTab === 'video' ? 'video' : 'photo';
    const payload: EditorProject = {
      name: (this.projectName || 'Untitled EASEContent Project').trim().slice(0, 160),
      mediaType,
      metadata:
        mediaType === 'photo'
          ? { photoOpts: this.photoOpts }
          : { videoOpts: this.videoOpts, youtubeTitle: this.youtubeTitle, youtubeDescription: this.youtubeDescription },
    };

    const request = this.activeProjectId
      ? this.studioService.updateProject(this.activeProjectId, payload)
      : this.studioService.createProject(payload);

    request.subscribe({
      next: (saved) => {
        this.activeProjectId = saved.id ?? null;
        this.setBanner('success', `Saved project "${saved.name}" to EASEContent.`);
        this.loadWorkspaceHistory();
      },
      error: (err) => {
        this.setBanner('error', err?.error?.message || 'Could not save project metadata.');
      },
    });
  }

  loadWorkspaceHistory(): void {
    this.studioService.projects().subscribe({
      next: (list) => (this.projects = list),
      error: () => undefined,
    });
    this.studioService.listJobs().subscribe({
      next: (res) => (this.jobs = res.jobs || []),
      error: () => undefined,
    });
    this.youtubeService.getHistory().subscribe({
      next: (res) => (this.youtubeHistory = res.history || []),
      error: () => undefined,
    });
  }

  // ==================== YOUTUBE PUBLISHING (EMAIL-BOUND) ====================

  openYouTubePublishModal(): void {
    this.showYouTubeModal = true;
    this.youtubeUploadError = '';
    this.youtubeUploadResult = null;
    this.youtubeUploadProgress = 0;

    if (this.videoRenderJob?.status === 'completed') {
      this.youtubeSourceMode = 'rendered';
    } else if (this.videoFile) {
      this.youtubeSourceMode = 'original';
    }

    if (!this.youtubeTitle.trim() && this.projectName) {
      this.youtubeTitle = this.projectName.replace(/[-_]+/g, ' ').slice(0, 100);
    }

    this.refreshYouTubeStatus();
  }

  closeYouTubeModal(): void {
    if (this.youtubeUploading) return;
    this.showYouTubeModal = false;
  }

  refreshYouTubeStatus(): void {
    this.checkingYouTube = true;
    this.youtubeService.getStatus().subscribe({
      next: (status) => {
        this.youtubeStatus = status;
        this.checkingYouTube = false;
      },
      error: () => {
        this.checkingYouTube = false;
      },
    });
  }

  connectYouTubeAccount(): void {
    this.connectingYouTube = true;
    this.youtubeUploadError = '';
    this.youtubeService.requestConnectUrl('/editor').subscribe({
      next: ({ authUrl }) => {
        window.location.href = authUrl;
      },
      error: (err) => {
        this.connectingYouTube = false;
        this.youtubeUploadError =
          err?.error?.message || 'Could not start YouTube OAuth flow. Verify server OAuth settings.';
      },
    });
  }

  disconnectYouTubeAccount(): void {
    this.youtubeService.disconnect().subscribe({
      next: () => {
        this.refreshYouTubeStatus();
        this.setBanner('info', 'YouTube account disconnected.');
      },
      error: () => undefined,
    });
  }

  appendHashtag(tag: string): void {
    if (this.youtubeDescription.includes(tag)) return;
    const spacer = this.youtubeDescription.trim().length > 0 ? '\n' : '';
    this.youtubeDescription = `${this.youtubeDescription}${spacer}${tag}`.slice(0, 5000);
  }

  generateAiYouTubeCopy(): void {
    this.generatingAiCopy = true;
    this.studioService
      .generateAiCopy({
        topic: this.youtubeTitle.trim() || this.projectName || 'My EASEContent Video',
        mediaType: 'video',
        durationSeconds: this.videoDuration || undefined,
        captionHints: this.videoOpts.subtitles.map((c) => c.text),
      })
      .subscribe({
        next: (res) => {
          this.generatingAiCopy = false;
          this.youtubeTitle = res.suggestedTitle.slice(0, 100);
          this.youtubeDescription = res.suggestedDescription.slice(0, 5000);
        },
        error: () => {
          this.generatingAiCopy = false;
        },
      });
  }

  publishToYouTube(): void {
    if (!this.canPublishVideoToYouTube) return;

    this.youtubeUploading = true;
    this.youtubeUploadError = '';
    this.youtubeUploadResult = null;
    this.youtubeUploadProgress = 12;

    const cleanTitle = this.youtubeTitle.trim();
    const cleanDesc = this.youtubeDescription.trim();

    if (this.youtubeSourceMode === 'rendered' && this.videoRenderJob?.status === 'completed') {
      // Server streams rendered MP4 straight to YouTube Data API v3
      this.youtubeUploadProgress = 45;
      this.youtubeService
        .publishRenderedJob({
          mediaJobId: this.videoRenderJob.id,
          title: cleanTitle,
          description: cleanDesc,
          privacyStatus: this.youtubePrivacy,
          projectId: this.activeProjectId,
        })
        .subscribe({
          next: (res) => {
            this.youtubeUploading = false;
            this.youtubeUploadProgress = 100;
            this.youtubeUploadResult = {
              videoId: res.videoId,
              videoUrl: res.videoUrl,
              privacyStatus: res.privacyStatus,
              channelTitle: res.channelTitle,
            };
            this.setBanner('success', 'Video published directly to YouTube!');
            this.loadWorkspaceHistory();
          },
          error: (err) => this.handleYouTubeUploadError(err),
        });
      return;
    }

    if (!this.videoFile) {
      this.youtubeUploading = false;
      this.youtubeUploadError = 'Select or render a video first.';
      return;
    }

    this.youtubeService
      .uploadVideoWithProgress(
        this.videoFile,
        cleanTitle,
        cleanDesc,
        this.youtubePrivacy,
        this.activeProjectId
      )
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.youtubeUploadProgress = Math.min(92, Math.round((event.loaded / event.total) * 90));
          } else if (event.type === HttpEventType.Response && event.body) {
            this.youtubeUploading = false;
            this.youtubeUploadProgress = 100;
            this.youtubeUploadResult = {
              videoId: event.body.videoId,
              videoUrl: event.body.videoUrl,
              privacyStatus: event.body.privacyStatus,
              channelTitle: event.body.channelTitle,
            };
            this.setBanner('success', 'Video published directly to YouTube!');
            this.loadWorkspaceHistory();
          }
        },
        error: (err) => this.handleYouTubeUploadError(err),
      });
  }

  private handleYouTubeUploadError(err: any): void {
    this.youtubeUploading = false;
    this.youtubeUploadProgress = 0;
    const code = err?.error?.code;
    this.youtubeUploadError =
      err?.error?.message || 'YouTube upload failed. Check your connection and try again.';
    if (code === 'YOUTUBE_REAUTH_REQUIRED' || code === 'YOUTUBE_EMAIL_MISMATCH') {
      this.refreshYouTubeStatus();
    }
  }

  // ==================== HELPERS ====================

  private buildCssFilter(
    brightness: number,
    contrast: number,
    saturation: number,
    exposure: number,
    preset: FilterPreset
  ): string {
    let b = 100 + brightness + exposure * 0.6;
    let c = 100 + contrast;
    let s = 100 + saturation;
    let extra = '';

    switch (preset) {
      case 'vivid':
        c += 12;
        s += 35;
        break;
      case 'cinematic':
        c += 18;
        s -= 14;
        b -= 4;
        break;
      case 'warm':
        extra = ' sepia(18%)';
        s += 12;
        break;
      case 'cool':
        extra = ' hue-rotate(12deg)';
        s += 8;
        break;
      case 'vintage':
        extra = ' sepia(42%)';
        c -= 6;
        break;
      case 'bw':
        s = 0;
        break;
      case 'noir':
        s = 0;
        c += 38;
        b -= 6;
        break;
    }

    return `brightness(${Math.max(20, Math.round(b))}%) contrast(${Math.max(20, Math.round(c))}%) saturate(${Math.max(0, Math.round(s))}%)${extra}`;
  }

  private getRatioNumber(ratio: AspectRatioPreset): number | null {
    switch (ratio) {
      case '16:9':
        return 16 / 9;
      case '9:16':
        return 9 / 16;
      case '1:1':
        return 1;
      case '4:5':
        return 4 / 5;
      case '4:3':
        return 4 / 3;
      default:
        return null;
    }
  }

  private setBanner(type: 'info' | 'success' | 'error' | 'warning', message: string): void {
    this.bannerType = type;
    this.bannerNotice = message;
  }

  private baseName(name: string): string {
    return (name || 'easecontent-media').replace(/\.[^/.]+$/, '').slice(0, 80);
  }

  formatBytes(bytes?: number | null): string {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscriptions.unsubscribe();
    this.segmenter?.close();
    this.fabricCanvas?.dispose();
    if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
    if (this.videoPreviewUrl) URL.revokeObjectURL(this.videoPreviewUrl);
  }
}
