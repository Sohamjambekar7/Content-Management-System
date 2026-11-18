import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import logger from '../shared/logger.util';

const execFileAsync = promisify(execFile);

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
  cropZoom?: number; // 10 - 100 (100 = no zoom crop)
  rotation?: number; // 0, 90, 180, 270
  flipH?: boolean;
  flipV?: boolean;
  brightness?: number; // -100 to 100
  contrast?: number; // -100 to 100
  saturation?: number; // -100 to 100
  exposure?: number; // -100 to 100
  sharpness?: number; // 0 to 100
  filterPreset?: FilterPreset;
  aiEnhance?: boolean;
  captionText?: string;
  captionPosition?: 'top' | 'center' | 'bottom';
  captionColor?: string;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number; // 50 - 100
}

export interface VideoEditOptions {
  startTime?: number;
  endTime?: number;
  speed?: number; // 0.5 - 2.0
  aspectRatio?: Exclude<AspectRatioPreset, '4:3'>;
  fitMode?: 'crop' | 'pad';
  brightness?: number; // -100 to 100
  contrast?: number; // -100 to 100
  saturation?: number; // -100 to 100
  exposure?: number; // -100 to 100
  sharpness?: number; // 0 to 100
  filterPreset?: FilterPreset;
  fadeInSeconds?: number; // 0 - 5
  fadeOutSeconds?: number; // 0 - 5
  volume?: number; // 0 - 200 (%)
  muted?: boolean;
  normalizeAudio?: boolean;
  subtitles?: SubtitleCue[];
  subtitlePosition?: 'top' | 'center' | 'bottom';
}

export interface MediaProbeInfo {
  width: number;
  height: number;
  durationSeconds: number;
  hasAudio: boolean;
  codec?: string;
}

export interface ProcessResult {
  outputPath: string;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number | null;
  fileSizeBytes: number;
  metadata: Record<string, unknown>;
}

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

export function getMediaStorageRoot(): string {
  const root = path.resolve(process.cwd(), process.env.MEDIA_STORAGE_DIR || 'storage/media');
  fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
  fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
  return root;
}

let cachedFfmpegAvailable: boolean | null = null;

export async function checkFfmpegAvailable(): Promise<boolean> {
  if (cachedFfmpegAvailable !== null) return cachedFfmpegAvailable;
  try {
    await execFileAsync(FFMPEG_BIN, ['-version'], { timeout: 5000 });
    cachedFfmpegAvailable = true;
  } catch {
    cachedFfmpegAvailable = false;
  }
  return cachedFfmpegAvailable;
}

export async function probeMedia(filePath: string): Promise<MediaProbeInfo> {
  try {
    const { stdout } = await execFileAsync(
      FFPROBE_BIN,
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,width,height:format=duration',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 15000 }
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }>;
      format?: { duration?: string };
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    const audioStream = parsed.streams?.find((s) => s.codec_type === 'audio');
    return {
      width: Number(videoStream?.width || 0),
      height: Number(videoStream?.height || 0),
      durationSeconds: Number.parseFloat(parsed.format?.duration || '0') || 0,
      hasAudio: Boolean(audioStream),
      codec: videoStream?.codec_name,
    };
  } catch (error) {
    logger.warn('ffprobe failed; returning fallback dimensions', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return { width: 0, height: 0, durationSeconds: 0, hasAudio: false };
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getTargetDimensionsForRatio(ratio: AspectRatioPreset): [number, number] | null {
  switch (ratio) {
    case '16:9':
      return [1280, 720];
    case '9:16':
      return [720, 1280];
    case '1:1':
      return [1080, 1080];
    case '4:5':
      return [1080, 1350];
    case '4:3':
      return [1200, 900];
    default:
      return null;
  }
}

function getRatioFloat(ratio: AspectRatioPreset): number | null {
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

function buildPresetFilters(preset: FilterPreset | undefined): string[] {
  switch (preset) {
    case 'vivid':
      return ['eq=contrast=1.12:saturation=1.35:brightness=0.02'];
    case 'cinematic':
      return ['eq=contrast=1.18:saturation=0.88:brightness=-0.03', 'colorbalance=bs=0.06:rm=0.04:gh=-0.02'];
    case 'warm':
      return ['colorbalance=rs=0.08:gs=0.03:bs=-0.06', 'eq=saturation=1.12'];
    case 'cool':
      return ['colorbalance=rs=-0.06:gs=0.01:bs=0.09', 'eq=saturation=1.06'];
    case 'vintage':
      return ['colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131', 'eq=contrast=0.95:brightness=0.02'];
    case 'bw':
      return ['hue=s=0'];
    case 'noir':
      return ['hue=s=0', 'eq=contrast=1.38:brightness=-0.05'];
    default:
      return [];
  }
}

function buildToneAndSharpnessFilters(opts: {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  exposure?: number;
  sharpness?: number;
  aiEnhance?: boolean;
}): string[] {
  const filters: string[] = [];
  const rawBrightness = clamp(opts.brightness ?? 0, -100, 100);
  const rawExposure = clamp(opts.exposure ?? 0, -100, 100);
  const rawContrast = clamp(opts.contrast ?? 0, -100, 100);
  const rawSaturation = clamp(opts.saturation ?? 0, -100, 100);

  const combinedBrightness = clamp((rawBrightness + rawExposure * 0.7) / 200, -0.8, 0.8);
  const contrastVal = clamp(1 + rawContrast / 100, 0.2, 2.5);
  const saturationVal = clamp(1 + rawSaturation / 100, 0, 3);
  const gammaVal = clamp(1 + rawExposure / 250, 0.4, 2.2);

  if (
    Math.abs(combinedBrightness) > 0.005 ||
    Math.abs(contrastVal - 1) > 0.005 ||
    Math.abs(saturationVal - 1) > 0.005 ||
    Math.abs(gammaVal - 1) > 0.005
  ) {
    filters.push(
      `eq=brightness=${combinedBrightness.toFixed(3)}:contrast=${contrastVal.toFixed(3)}:saturation=${saturationVal.toFixed(3)}:gamma=${gammaVal.toFixed(3)}`
    );
  }

  const sharpness = clamp(opts.sharpness ?? 0, 0, 100);
  if (sharpness > 0) {
    const lumaAmount = (0.3 + (sharpness / 100) * 1.4).toFixed(2);
    filters.push(`unsharp=5:5:${lumaAmount}:5:5:0.0`);
  }

  if (opts.aiEnhance) {
    filters.push('hqdn3d=1.5:1.5:6:6', 'eq=contrast=1.08:saturation=1.12:gamma=1.03', 'unsharp=5:5:0.75:5:5:0.0');
  }

  return filters;
}

export function buildPhotoFilterGraph(options: PhotoEditOptions): string[] {
  const filters: string[] = [];

  // Rotation
  const rot = ((options.rotation ?? 0) % 360 + 360) % 360;
  if (rot === 90) filters.push('transpose=1');
  else if (rot === 180) filters.push('hflip', 'vflip');
  else if (rot === 270) filters.push('transpose=2');

  if (options.flipH) filters.push('hflip');
  if (options.flipV) filters.push('vflip');

  // Centered crop zoom
  const cropZoom = clamp(options.cropZoom ?? 100, 20, 100);
  if (cropZoom < 100) {
    const factor = (cropZoom / 100).toFixed(4);
    filters.push(`crop=iw*${factor}:ih*${factor}:(iw-ow)/2:(ih-oh)/2`);
  }

  // Aspect ratio crop
  const ratio = getRatioFloat(options.aspectRatio || 'original');
  if (ratio !== null) {
    const r = ratio.toFixed(5);
    filters.push(
      `crop='if(gt(a,${r}),ih*${r},iw)':'if(gt(a,${r}),ih,iw/${r})':(iw-ow)/2:(ih-oh)/2`
    );
  }

  filters.push(...buildPresetFilters(options.filterPreset));
  filters.push(...buildToneAndSharpnessFilters(options));

  if (options.captionText && options.captionText.trim()) {
    const safeText = options.captionText
      .trim()
      .slice(0, 120)
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'");
    const yExpr =
      options.captionPosition === 'top'
        ? 'h*0.08'
        : options.captionPosition === 'center'
          ? '(h-text_h)/2'
          : 'h-text_h-h*0.08';
    const color = /^#[0-9a-fA-F]{6}$/.test(options.captionColor || '')
      ? options.captionColor!
      : '#ffffff';
    filters.push(
      `drawtext=text='${safeText}':fontcolor=${color}:fontsize=max(24\\,h/22):x=(w-text_w)/2:y=${yExpr}:box=1:boxcolor=black@0.48:boxborderw=12`
    );
  }

  return filters;
}

export function buildVideoFilterGraph(
  options: VideoEditOptions,
  effectiveDuration: number,
  subtitleFilePath?: string
): string[] {
  const filters: string[] = [];

  // Aspect ratio framing
  const target = getTargetDimensionsForRatio(options.aspectRatio || 'original');
  if (target) {
    const [w, h] = target;
    if (options.fitMode === 'pad') {
      filters.push(
        `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`
      );
    } else {
      filters.push(
        `scale=${w}:${h}:force_original_aspect_ratio=increase`,
        `crop=${w}:${h}`
      );
    }
  } else {
    // Ensure even dimensions required by H.264 yuv420p
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }

  // Playback speed
  const speed = clamp(options.speed ?? 1, 0.5, 2.0);
  if (Math.abs(speed - 1) > 0.01) {
    filters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
  }

  filters.push(...buildPresetFilters(options.filterPreset));
  filters.push(...buildToneAndSharpnessFilters(options));

  // Subtitles burn-in
  if (subtitleFilePath) {
    const escaped = subtitleFilePath
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'");
    const alignment =
      options.subtitlePosition === 'top' ? 6 : options.subtitlePosition === 'center' ? 10 : 2;
    filters.push(
      `subtitles='${escaped}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Alignment=${alignment}'`
    );
  }

  // Video transitions (fade-in / fade-out)
  const scaledDuration = effectiveDuration / speed;
  const fadeIn = clamp(options.fadeInSeconds ?? 0, 0, Math.min(5, scaledDuration / 2));
  const fadeOut = clamp(options.fadeOutSeconds ?? 0, 0, Math.min(5, scaledDuration / 2));
  if (fadeIn > 0) {
    filters.push(`fade=t=in:st=0:d=${fadeIn.toFixed(2)}`);
  }
  if (fadeOut > 0 && scaledDuration > fadeOut) {
    const outStart = Math.max(0, scaledDuration - fadeOut);
    filters.push(`fade=t=out:st=${outStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`);
  }

  return filters;
}

export function buildAudioFilterGraph(options: VideoEditOptions, effectiveDuration: number): string[] {
  const filters: string[] = [];
  const speed = clamp(options.speed ?? 1, 0.5, 2.0);
  if (Math.abs(speed - 1) > 0.01) {
    filters.push(`atempo=${speed.toFixed(3)}`);
  }

  const volPct = clamp(options.volume ?? 100, 0, 200);
  if (Math.abs(volPct - 100) > 1) {
    filters.push(`volume=${(volPct / 100).toFixed(2)}`);
  }

  if (options.normalizeAudio) {
    filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  }

  const scaledDuration = effectiveDuration / speed;
  const fadeIn = clamp(options.fadeInSeconds ?? 0, 0, Math.min(5, scaledDuration / 2));
  const fadeOut = clamp(options.fadeOutSeconds ?? 0, 0, Math.min(5, scaledDuration / 2));
  if (fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(2)}`);
  }
  if (fadeOut > 0 && scaledDuration > fadeOut) {
    const outStart = Math.max(0, scaledDuration - fadeOut);
    filters.push(`afade=t=out:st=${outStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`);
  }

  return filters;
}

function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function buildSrtContent(cues: SubtitleCue[]): string {
  return cues
    .filter((cue) => cue.text.trim().length > 0 && cue.end > cue.start)
    .sort((a, b) => a.start - b.start)
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text.trim()}\n`
    )
    .join('\n');
}

export function parseSilenceDetectOutput(stderr: string): Array<{ start: number; end: number; duration: number }> {
  const segments: Array<{ start: number; end: number; duration: number }> = [];
  let currentStart: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      currentStart = Number.parseFloat(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (endMatch) {
      const end = Number.parseFloat(endMatch[1]);
      const duration = Number.parseFloat(endMatch[2]);
      const start = currentStart !== null ? currentStart : Math.max(0, end - duration);
      segments.push({ start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), duration: Number(duration.toFixed(2)) });
      currentStart = null;
    }
  }
  return segments;
}

export function parseSceneTimestamps(stderr: string): number[] {
  const timestamps: number[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(/pts_time:([0-9.]+)/);
    if (match) {
      timestamps.push(Number(Number.parseFloat(match[1]).toFixed(2)));
    }
  }
  return timestamps;
}

export async function processPhotoJob(
  inputPath: string,
  jobId: string,
  options: PhotoEditOptions,
  onProgress?: (progress: number, stage: string) => Promise<void> | void
): Promise<ProcessResult> {
  const ffmpegReady = await checkFfmpegAvailable();
  if (!ffmpegReady) {
    throw new Error('FFmpeg is required on the server to process media jobs.');
  }

  await onProgress?.(15, 'Analyzing source photo');
  const format = options.format || 'png';
  const ext = format === 'jpeg' ? 'jpg' : format;
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const outputPath = path.join(getMediaStorageRoot(), 'outputs', `${jobId}.${ext}`);

  const filters = buildPhotoFilterGraph(options);
  const args: string[] = ['-y', '-i', inputPath];

  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  const quality = clamp(options.quality ?? 92, 50, 100);
  if (format === 'jpeg') {
    const qscale = Math.max(2, Math.round(((100 - quality) / 100) * 29 + 2));
    args.push('-q:v', String(qscale));
  } else if (format === 'webp') {
    args.push('-quality', String(quality));
  }
  args.push('-frames:v', '1', outputPath);

  await onProgress?.(45, options.aiEnhance ? 'Applying AI smart enhancement & filters' : 'Rendering edited photo');
  await execFileAsync(FFMPEG_BIN, args, { timeout: 60000 });

  await onProgress?.(90, 'Validating rendered image');
  const probe = await probeMedia(outputPath);
  const stats = await fs.promises.stat(outputPath);

  return {
    outputPath,
    mimeType,
    width: probe.width,
    height: probe.height,
    durationSeconds: null,
    fileSizeBytes: stats.size,
    metadata: {
      format,
      quality,
      filterPreset: options.filterPreset || 'none',
      aiEnhance: Boolean(options.aiEnhance),
    },
  };
}

export async function processVideoJob(
  inputPath: string,
  jobId: string,
  options: VideoEditOptions,
  onProgress?: (progress: number, stage: string) => Promise<void> | void
): Promise<ProcessResult> {
  const ffmpegReady = await checkFfmpegAvailable();
  if (!ffmpegReady) {
    throw new Error('FFmpeg is required on the server to render video jobs.');
  }

  await onProgress?.(10, 'Probing source video streams');
  const probe = await probeMedia(inputPath);
  const sourceDuration = probe.durationSeconds > 0 ? probe.durationSeconds : 10;

  const startTime = clamp(options.startTime ?? 0, 0, Math.max(0, sourceDuration - 0.2));
  const rawEnd = options.endTime && options.endTime > startTime ? options.endTime : sourceDuration;
  const endTime = clamp(rawEnd, startTime + 0.2, sourceDuration);
  const effectiveDuration = Math.max(0.2, endTime - startTime);

  const storageRoot = getMediaStorageRoot();
  const outputPath = path.join(storageRoot, 'outputs', `${jobId}.mp4`);
  let subtitleFilePath: string | undefined;

  try {
    if (options.subtitles && options.subtitles.length > 0) {
      // Shift subtitle cues relative to trimmed clip start
      const shiftedCues = options.subtitles
        .map((cue) => ({
          start: Math.max(0, cue.start - startTime),
          end: Math.min(effectiveDuration, cue.end - startTime),
          text: cue.text,
        }))
        .filter((cue) => cue.end > cue.start && cue.text.trim().length > 0);

      if (shiftedCues.length > 0) {
        subtitleFilePath = path.join(storageRoot, 'tmp', `${jobId}.srt`);
        await fs.promises.writeFile(subtitleFilePath, buildSrtContent(shiftedCues), 'utf8');
      }
    }

    const videoFilters = buildVideoFilterGraph(options, effectiveDuration, subtitleFilePath);
    const audioFilters = buildAudioFilterGraph(options, effectiveDuration);

    const args: string[] = [
      '-y',
      '-ss',
      startTime.toFixed(3),
      '-i',
      inputPath,
      '-t',
      effectiveDuration.toFixed(3),
    ];

    if (videoFilters.length > 0) {
      args.push('-vf', videoFilters.join(','));
    }

    if (options.muted || !probe.hasAudio) {
      args.push('-an');
    } else {
      if (audioFilters.length > 0) {
        args.push('-af', audioFilters.join(','));
      }
      args.push('-c:a', 'aac', '-b:a', '128k');
    }

    args.push(
      '-c:v',
      'libx264',
      '-preset',
      process.env.FFMPEG_PRESET || 'veryfast',
      '-crf',
      process.env.FFMPEG_CRF || '23',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      outputPath
    );

    await onProgress?.(20, 'Transcoding & rendering video timeline');

    const speed = clamp(options.speed ?? 1, 0.5, 2.0);
    const expectedOutputUs = (effectiveDuration / speed) * 1_000_000;

    await new Promise<void>((resolve, reject) => {
      const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderrTail = '';
      let lastReported = 20;

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const match = text.match(/out_time_us=(\d+)/);
        if (match && expectedOutputUs > 0) {
          const outUs = Number.parseInt(match[1], 10);
          const pct = clamp(Math.round(20 + (outUs / expectedOutputUs) * 72), 20, 92);
          if (pct >= lastReported + 5) {
            lastReported = pct;
            void onProgress?.(pct, 'Encoding MP4 video stream');
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2500);
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}: ${stderrTail.slice(-400)}`));
      });
    });

    await onProgress?.(95, 'Finalizing rendered MP4 for preview');
    const finalProbe = await probeMedia(outputPath);
    const stats = await fs.promises.stat(outputPath);

    return {
      outputPath,
      mimeType: 'video/mp4',
      width: finalProbe.width,
      height: finalProbe.height,
      durationSeconds: Number(finalProbe.durationSeconds.toFixed(3)),
      fileSizeBytes: stats.size,
      metadata: {
        aspectRatio: options.aspectRatio || 'original',
        fitMode: options.fitMode || 'crop',
        filterPreset: options.filterPreset || 'none',
        startTime,
        endTime,
        speed,
        hasAudio: finalProbe.hasAudio,
        subtitleCount: options.subtitles?.length || 0,
      },
    };
  } finally {
    if (subtitleFilePath) {
      fs.promises.unlink(subtitleFilePath).catch(() => undefined);
    }
  }
}

export async function analyzeVideoForAi(
  inputPath: string,
  mode: 'smart-trim' | 'highlights' | 'auto-caption',
  contextTitle?: string
): Promise<Record<string, unknown>> {
  const probe = await probeMedia(inputPath);
  const duration = probe.durationSeconds > 0 ? probe.durationSeconds : 15;

  if (mode === 'smart-trim') {
    let silenceSegments: Array<{ start: number; end: number; duration: number }> = [];
    if (probe.hasAudio && (await checkFfmpegAvailable())) {
      try {
        const { stderr } = await execFileAsync(
          FFMPEG_BIN,
          ['-i', inputPath, '-af', 'silencedetect=noise=-32dB:d=0.6', '-f', 'null', '-'],
          { timeout: 45000, maxBuffer: 4 * 1024 * 1024 }
        );
        silenceSegments = parseSilenceDetectOutput(stderr);
      } catch (err) {
        logger.warn('Smart trim silence detection fell back to heuristics', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let recommendedStart = 0;
    let recommendedEnd = Number(duration.toFixed(2));

    if (silenceSegments.length > 0) {
      const first = silenceSegments[0];
      if (first.start <= 0.35 && first.end < duration - 1) {
        recommendedStart = Number(Math.max(0, first.end - 0.1).toFixed(2));
      }
      const last = silenceSegments[silenceSegments.length - 1];
      if (last.end >= duration - 0.5 && last.start > recommendedStart + 1) {
        recommendedEnd = Number(Math.min(duration, last.start + 0.15).toFixed(2));
      }
    } else if (duration > 4) {
      recommendedStart = 0.25;
      recommendedEnd = Number((duration - 0.25).toFixed(2));
    }

    const savedSeconds = Number(Math.max(0, duration - (recommendedEnd - recommendedStart)).toFixed(2));
    return {
      mode,
      durationSeconds: Number(duration.toFixed(2)),
      recommendedStart,
      recommendedEnd,
      savedSeconds,
      silenceSegments,
      summary:
        savedSeconds > 0.2
          ? `Detected ${silenceSegments.length} silent section(s). Trimming removes ${savedSeconds}s of dead air.`
          : 'Audio is tight throughout; minimal lead-in/out trim suggested.',
    };
  }

  if (mode === 'highlights') {
    let sceneTimes: number[] = [];
    if (await checkFfmpegAvailable()) {
      try {
        const { stderr } = await execFileAsync(
          FFMPEG_BIN,
          ['-i', inputPath, '-vf', "select='gt(scene,0.28)',showinfo", '-f', 'null', '-'],
          { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }
        );
        sceneTimes = parseSceneTimestamps(stderr);
      } catch (err) {
        logger.warn('Scene detection fell back to evenly spaced highlights', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const clipLen = Math.min(15, Math.max(3, Math.round(duration / 3)));
    const anchors =
      sceneTimes.length > 0
        ? sceneTimes.slice(0, 3)
        : [0, Number((duration * 0.35).toFixed(1)), Number((duration * 0.65).toFixed(1))];

    const highlights = anchors
      .map((t, idx) => {
        const start = Number(clamp(t, 0, Math.max(0, duration - 1)).toFixed(2));
        const end = Number(clamp(start + clipLen, start + 1, duration).toFixed(2));
        return {
          id: idx + 1,
          label: idx === 0 ? 'Opening Hook' : idx === 1 ? 'Peak Moment' : 'Closing Highlight',
          start,
          end,
          score: Number((0.94 - idx * 0.08).toFixed(2)),
        };
      })
      .filter((h) => h.end > h.start);

    return {
      mode,
      durationSeconds: Number(duration.toFixed(2)),
      sceneCount: sceneTimes.length,
      highlights,
      summary:
        sceneTimes.length > 0
          ? `Found ${sceneTimes.length} visual scene transitions and built ${highlights.length} highlight clip suggestions.`
          : `Built ${highlights.length} highlight intervals across your ${duration.toFixed(1)}s video.`,
    };
  }

  // auto-caption mode
  const topic = (contextTitle || 'EASEContent Video').trim();
  const segmentCount = clamp(Math.round(duration / 4), 2, 8);
  const step = duration / segmentCount;
  const templates = [
    `Welcome — let's dive into ${topic}`,
    'Here is the key highlight you need to see',
    'Notice the details and pacing in this section',
    'Quick tip to get the best result every time',
    'Let us break down what makes this stand out',
    'Here is the full before-and-after look',
    'Drop your thoughts in the comments below',
    'Subscribe for more updates from EASEContent',
  ];

  const captions: SubtitleCue[] = Array.from({ length: segmentCount }, (_, idx) => ({
    start: Number((idx * step).toFixed(2)),
    end: Number(Math.min(duration, (idx + 1) * step - 0.1).toFixed(2)),
    text: templates[idx % templates.length],
  }));

  const aiCopy = await generateAiSocialCopy({
    topic,
    mediaType: 'video',
    durationSeconds: duration,
    captionHints: captions.map((c) => c.text),
  });

  return {
    mode,
    durationSeconds: Number(duration.toFixed(2)),
    captions,
    ...aiCopy,
    summary: `Generated ${captions.length} timed subtitle cues ready to refine and burn into your render.`,
  };
}

export async function generateAiSocialCopy(input: {
  topic: string;
  mediaType: 'photo' | 'video';
  durationSeconds?: number;
  captionHints?: string[];
  tone?: string;
}): Promise<{
  suggestedTitle: string;
  suggestedDescription: string;
  hashtags: string[];
  provider: 'gemini' | 'heuristic';
}> {
  const cleanTopic = (input.topic || 'Creative Highlight').trim().slice(0, 120);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (apiKey) {
    try {
      const prompt = [
        'Return strict JSON with keys: title (string, <= 95 chars), description (multi-line string with clear summary and call to action), hashtags (array of 5 strings starting with #).',
        `Media type: ${input.mediaType}.`,
        input.durationSeconds ? `Duration: ${Math.round(input.durationSeconds)} seconds.` : '',
        `Topic / filename: ${cleanTopic}.`,
        input.tone ? `Tone: ${input.tone}.` : 'Tone: engaging, clear, creator-friendly.',
        input.captionHints?.length ? `Key lines: ${input.captionHints.slice(0, 5).join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText) as {
            title?: string;
            description?: string;
            hashtags?: string[];
          };
          if (parsed.title && parsed.description) {
            return {
              suggestedTitle: parsed.title.slice(0, 100),
              suggestedDescription: parsed.description.slice(0, 4800),
              hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8) : ['#EASEContent'],
              provider: 'gemini',
            };
          }
        }
      }
    } catch (error) {
      logger.warn('Gemini AI copy generation fell back to local generator', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const slugWords = cleanTopic
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .map((w) => `#${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`);

  const hashtags = Array.from(
    new Set([...slugWords, input.mediaType === 'video' ? '#YouTube' : '#Photography', '#EASEContent', '#ContentCreator'])
  ).slice(0, 6);

  const suggestedTitle = `${cleanTopic} | Edited with EASEContent`.slice(0, 100);
  const suggestedDescription = [
    `${cleanTopic}`,
    '',
    'Created and polished in EASEContent Studio.',
    input.durationSeconds && input.durationSeconds <= 60
      ? 'Watch till the end for the full highlight!'
      : 'Let us know what you think in the comments and subscribe for more.',
    '',
    hashtags.join(' '),
  ].join('\n');

  return {
    suggestedTitle,
    suggestedDescription,
    hashtags,
    provider: 'heuristic',
  };
}
