import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AiEditorService } from './ai-editor.service';

type EditorTab = 'photo' | 'video';
@Component({
  selector: 'app-ai-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ai-editor.component.html',
  styleUrl: './ai-editor.component.scss'
})
export class AiEditorComponent implements OnDestroy {
  private readonly api = inject(AiEditorService);
  @ViewChild('photoCanvas') photoCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('videoCanvas') videoCanvas?: ElementRef<HTMLCanvasElement>;
  tab: EditorTab = 'photo';
  modelStatus = 'AI tools load only when you start them. Processing runs locally in your browser.';
  modelLoading = false;
  modelProgress = 0;
  modelError = '';
  private bgPipeline: any;
  private originalImage?: HTMLImageElement;
  photoName = '';
  brightness = 100;
  contrast = 100;
  sharpness = 0;
  crop = 100;
  photoBusy = false;
  photoError = '';
  videoUrl = '';
  videoFile?: File;
  videoStart = 0;
  videoEnd = 0;
  videoDuration = 0;
  videoRatio: '9:16' | '16:9' = '9:16';
  videoBusy = false;
  videoError = '';
  shareMessage = '';
  showShareModal = false;
  title = '';
  description = '';
  tags = '';
  category = 'Entertainment';
  private videoElement?: HTMLVideoElement;
  private lastExportBlob?: Blob;
  private frameRequest = 0;

  async loadPhoto(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    this.photoError = ''; this.photoName = file.name;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.originalImage = img;
      this.drawPhoto();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { this.photoError = 'Could not read this image.'; URL.revokeObjectURL(url); };
    img.src = url;
  }

  drawPhoto(): void {
    const img = this.originalImage, canvas = this.photoCanvas?.nativeElement;
    if (!img || !canvas) return;
    const scale = Math.max(0.1, Math.min(1, this.crop / 100));
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.filter = `brightness(${this.brightness}%) contrast(${this.contrast}%)`;
    ctx.drawImage(img, (img.naturalWidth-canvas.width)/2, (img.naturalHeight-canvas.height)/2, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    if (this.sharpness > 0) {
      const image = ctx.getImageData(0,0,canvas.width,canvas.height);
      const src = new Uint8ClampedArray(image.data); const amount = this.sharpness / 100;
      for (let y=1;y<canvas.height-1;y++) for (let x=1;x<canvas.width-1;x++) {
        const i=(y*canvas.width+x)*4;
        for(let c=0;c<3;c++) image.data[i+c]=Math.max(0,Math.min(255,src[i+c]*(1+4*amount)-amount*(src[i-4+c]+src[i+4+c]+src[i-canvas.width*4+c]+src[i+canvas.width*4+c])));
      }
      ctx.putImageData(image,0,0);
    }
  }

  async removeBackground(): Promise<void> {
    const canvas = this.photoCanvas?.nativeElement;
    if (!canvas || !this.originalImage) { this.photoError = 'Upload a photo first.'; return; }
    this.modelLoading = true; this.modelProgress = 4; this.modelError = ''; this.photoError = '';
    this.modelStatus = 'Preparing the background-removal model. The model is cached by your browser after its first download.';
    try {
      if (!this.bgPipeline) {
        const transformers = await import('@huggingface/transformers');
        this.bgPipeline = await transformers.pipeline('background-removal', 'briaai/RMBG-1.4', {
          progress_callback: (event: any) => { if (typeof event?.progress === 'number') this.modelProgress = Math.max(4, Math.min(96, Math.round(event.progress))); }
        } as any);
      }
      this.modelProgress = 98;
      const result = await this.bgPipeline(this.originalImage);
      const first = Array.isArray(result) ? result[0] : result;
      const src = first?.toBlob ? first : first?.image;
      if (src instanceof Blob) {
        const bitmap = await createImageBitmap(src);
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap,0,0);
      } else if (src && typeof src === 'object' && 'data' in src) {
        const imageData = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
        canvas.width = src.width; canvas.height = src.height; canvas.getContext('2d')?.putImageData(imageData,0,0);
      } else {
        throw new Error('The model returned an unsupported image format. Try again in a supported browser.');
      }
      this.modelStatus = 'Background removal complete. Processing stayed in this browser.';
    } catch (error) {
      this.photoError = 'Background removal could not start. Check browser WebGPU/WASM support and your connection for the first model download.';
      this.modelStatus = 'Local AI is unavailable right now. Standard canvas editing and export still work.';
      this.modelError = error instanceof Error ? error.message : String(error);
    } finally { this.modelLoading = false; this.modelProgress = 100; }
  }

  exportPhoto(format: 'image/png' | 'image/jpeg'): void {
    const canvas = this.photoCanvas?.nativeElement; if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) { this.photoError = 'Could not export this image.'; return; }
      this.download(blob, `${this.baseName(this.photoName)}.${format === 'image/png' ? 'png' : 'jpg'}`);
    }, format, format === 'image/jpeg' ? 0.92 : undefined);
  }

  loadVideo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !['video/mp4','video/webm'].includes(file.type)) { this.videoError = 'Choose an MP4 or WebM video.'; return; }
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
    this.videoFile = file; this.videoUrl = URL.createObjectURL(file); this.videoError = '';
    this.title = this.baseName(file.name);
  }
  onVideoMetadata(video: HTMLVideoElement): void {
    this.videoElement = video; this.videoDuration = video.duration || 0; this.videoEnd = this.videoDuration;
    this.drawVideoFrame();
  }
  drawVideoFrame(): void {
    const video = this.videoElement, canvas = this.videoCanvas?.nativeElement;
    if (!video || !canvas || !video.videoWidth) return;
    const [rw,rh] = this.videoRatio === '9:16' ? [9,16] : [16,9];
    const targetRatio=rw/rh, sourceRatio=video.videoWidth/video.videoHeight;
    canvas.width=this.videoRatio==='9:16'?720:1280; canvas.height=this.videoRatio==='9:16'?1280:720;
    const ctx=canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle='#080b12';ctx.fillRect(0,0,canvas.width,canvas.height);
    let sx=0,sy=0,sw=video.videoWidth,sh=video.videoHeight;
    if(sourceRatio>targetRatio){sw=sh*targetRatio;sx=(video.videoWidth-sw)/2;}else{sh=sw/targetRatio;sy=(video.videoHeight-sh)/2;}
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  }
  setRatio(ratio: '9:16'|'16:9'): void { this.videoRatio=ratio; this.drawVideoFrame(); }
  async exportVideo(): Promise<void> {
    const video=this.videoElement, canvas=this.videoCanvas?.nativeElement;
    if (!video || !canvas || !this.videoFile) { this.videoError='Upload a video first.';return; }
    const start=Math.max(0,this.videoStart), end=Math.min(this.videoDuration,this.videoEnd);
    if(end<=start){this.videoError='End time must be after start time.';return;}
    const stream=canvas.captureStream(30);
    const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';
    const recorder=new MediaRecorder(stream,{mimeType:mime}); const chunks:BlobPart[]=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{this.lastExportBlob=new Blob(chunks,{type:'video/webm'});this.download(this.lastExportBlob,`${this.baseName(this.videoFile!.name)}-${this.videoRatio.replace(':','x')}.webm`);stream.getTracks().forEach(t=>t.stop());this.videoBusy=false;};
    this.videoBusy=true; video.pause(); video.currentTime=start;
    await new Promise<void>(resolve=>{video.onseeked=()=>resolve();});
    recorder.start();
    const render=()=>{ if(video.currentTime>=end || video.ended){recorder.stop();video.pause();return;} this.drawVideoFrame(); this.frameRequest=requestAnimationFrame(render); };
    video.play().then(render).catch(()=>{recorder.stop();this.videoError='Playback was blocked. Press play on the preview and try export again.';});
  }
  async shareVideo(): Promise<void> {
    const video=this.videoFile;
    if(!video){this.videoError='Upload a video first.';return;}
    const file=new File([video], `${this.baseName(video.name)}.webm`, {type:video.type || 'video/webm'});
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))) {
      try { await navigator.share({files:[file],title:this.title || 'My video',text:this.description || 'Created with the video editor'}); this.shareMessage='Share sheet opened. Choose Instagram or YouTube if installed and supported.'; }
      catch { this.shareMessage='Sharing cancelled or unsupported. Use the optimized download and upload in the social app.'; }
    } else { this.showShareModal=true; this.shareMessage='Desktop browsers cannot publish directly to Instagram Reels or YouTube Shorts from this page. Download your export, then upload it in the platform.'; }
  }
  downloadSocialVideo(): void {
    this.showShareModal=false;
    if(this.videoFile) {
      const blob=this.lastExportBlob ?? this.videoFile;
      this.download(blob,`${this.baseName(this.videoFile.name)}-social-upload.${blob.type==='video/mp4'?'mp4':'webm'}`);
    }
    this.shareMessage='Downloaded. Review the platform preview and publish from Instagram or YouTube.';
  }
  private download(blob: Blob,name:string): void { const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  private baseName(name:string):string{return (name||'edited-media').replace(/\.[^/.]+$/,'').replace(/[^a-z0-9-_]+/gi,'-').slice(0,80)||'edited-media';}
  ngOnDestroy():void { if(this.videoUrl)URL.revokeObjectURL(this.videoUrl);cancelAnimationFrame(this.frameRequest); }
}
