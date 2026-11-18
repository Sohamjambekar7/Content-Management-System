import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { describe, it, expect } from 'vitest';
import {
  analyzeVideoForAi,
  buildAudioFilterGraph,
  buildPhotoFilterGraph,
  buildSrtContent,
  buildVideoFilterGraph,
  checkFfmpegAvailable,
  generateAiSocialCopy,
  parseSceneTimestamps,
  parseSilenceDetectOutput,
  processPhotoJob,
  processVideoJob,
} from '../src/services/media-processor.service';

const execFileAsync = promisify(execFile);

describe('Media Processor Filter Builders & FFmpeg Pipeline', () => {
  it('builds comprehensive photo filter graphs', () => {
    const filters = buildPhotoFilterGraph({
      rotation: 90,
      flipH: true,
      cropZoom: 80,
      aspectRatio: '1:1',
      brightness: 15,
      contrast: 20,
      saturation: 10,
      exposure: 10,
      sharpness: 40,
      filterPreset: 'cinematic',
      aiEnhance: true,
    });

    expect(filters).toContain('transpose=1');
    expect(filters).toContain('hflip');
    expect(filters.some((f) => f.startsWith('crop=iw*0.8000'))).toBe(true);
    expect(filters.some((f) => f.startsWith('eq='))).toBe(true);
    expect(filters.some((f) => f.startsWith('unsharp='))).toBe(true);
    expect(filters.some((f) => f.startsWith('hqdn3d='))).toBe(true);
  });

  it('builds video and audio filter graphs with aspect framing, speed, transitions, and audio normalization', () => {
    const vFilters = buildVideoFilterGraph(
      {
        aspectRatio: '9:16',
        fitMode: 'crop',
        speed: 1.5,
        filterPreset: 'vivid',
        fadeInSeconds: 0.5,
        fadeOutSeconds: 0.5,
      },
      12
    );

    expect(vFilters).toContain('scale=720:1280:force_original_aspect_ratio=increase');
    expect(vFilters).toContain('crop=720:1280');
    expect(vFilters.some((f) => f.startsWith('setpts='))).toBe(true);
    expect(vFilters.some((f) => f.startsWith('fade=t=in'))).toBe(true);
    expect(vFilters.some((f) => f.startsWith('fade=t=out'))).toBe(true);

    const aFilters = buildAudioFilterGraph(
      { speed: 1.5, volume: 140, normalizeAudio: true, fadeInSeconds: 0.5 },
      12
    );
    expect(aFilters).toContain('atempo=1.500');
    expect(aFilters).toContain('volume=1.40');
    expect(aFilters.some((f) => f.startsWith('loudnorm='))).toBe(true);
    expect(aFilters.some((f) => f.startsWith('afade=t=in'))).toBe(true);
  });

  it('formats valid SRT subtitle cues and parses FFmpeg analysis logs', () => {
    const srt = buildSrtContent([
      { start: 0, end: 2.5, text: 'Hello EASEContent' },
      { start: 2.5, end: 5.125, text: 'Ready to publish!' },
    ]);
    expect(srt).toContain('00:00:00,000 --> 00:00:02,500');
    expect(srt).toContain('00:00:02,500 --> 00:00:05,125');

    const silences = parseSilenceDetectOutput(
      '[silencedetect @ 0x1] silence_start: 0.0\n[silencedetect @ 0x1] silence_end: 1.45 | silence_duration: 1.45\n'
    );
    expect(silences).toEqual([{ start: 0, end: 1.45, duration: 1.45 }]);

    const scenes = parseSceneTimestamps('[Parsed_showinfo] n:10 pts_time:3.42 pos:1024\n[Parsed_showinfo] n:42 pts_time:8.90');
    expect(scenes).toEqual([3.42, 8.9]);
  });

  it('generates AI social copy deterministically without requiring external API keys', async () => {
    delete process.env.GEMINI_API_KEY;
    const copy = await generateAiSocialCopy({
      topic: 'Summer Product Launch Vlog',
      mediaType: 'video',
      durationSeconds: 45,
    });
    expect(copy.suggestedTitle.length).toBeGreaterThan(5);
    expect(copy.suggestedTitle.length).toBeLessThanOrEqual(100);
    expect(copy.suggestedDescription).toContain('EASEContent');
    expect(copy.hashtags.length).toBeGreaterThanOrEqual(3);
  });

  it('processes real photos and videos end-to-end when FFmpeg is available', async () => {
    const available = await checkFfmpegAvailable();
    if (!available) return;

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'easecontent-test-'));
    const sampleImg = path.join(tmpDir, 'sample.png');
    const sampleVid = path.join(tmpDir, 'sample.mp4');

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x4f46e5:s=320x240:d=1',
        '-frames:v',
        '1',
        sampleImg,
      ]);

      const photoResult = await processPhotoJob(sampleImg, `test-photo-${Date.now()}`, {
        aspectRatio: '1:1',
        rotation: 90,
        brightness: 10,
        filterPreset: 'vivid',
        format: 'jpeg',
        quality: 88,
      });

      expect(fs.existsSync(photoResult.outputPath)).toBe(true);
      expect(photoResult.mimeType).toBe('image/jpeg');
      expect(photoResult.width).toBe(photoResult.height);
      await fs.promises.unlink(photoResult.outputPath).catch(() => undefined);

      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=2:size=320x240:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        sampleVid,
      ]);

      const videoResult = await processVideoJob(sampleVid, `test-video-${Date.now()}`, {
        startTime: 0.2,
        endTime: 1.6,
        aspectRatio: '9:16',
        fitMode: 'crop',
        filterPreset: 'warm',
        volume: 110,
        fadeInSeconds: 0.2,
      });

      expect(fs.existsSync(videoResult.outputPath)).toBe(true);
      expect(videoResult.mimeType).toBe('video/mp4');
      expect(videoResult.width).toBe(720);
      expect(videoResult.height).toBe(1280);
      expect((videoResult.durationSeconds || 0)).toBeGreaterThan(0.8);
      await fs.promises.unlink(videoResult.outputPath).catch(() => undefined);

      const trimAnalysis = await analyzeVideoForAi(sampleVid, 'smart-trim', 'Test Clip');
      expect(trimAnalysis.mode).toBe('smart-trim');
      expect(typeof trimAnalysis.recommendedEnd).toBe('number');
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
