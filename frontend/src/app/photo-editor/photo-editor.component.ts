import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';

import {
  Canvas,
  FabricImage,
  IText,
  Rect
} from 'fabric';

import {
  FilesetResolver,
  ImageSegmenter
} from '@mediapipe/tasks-vision';

@Component({
  selector: 'app-photo-editor',
  standalone: true,
  templateUrl: './photo-editor.component.html',
  styleUrl: './photo-editor.component.css'
})
export class PhotoEditorComponent
  implements AfterViewInit, OnDestroy {

  @ViewChild('editorCanvas')
  canvasElement!: ElementRef<HTMLCanvasElement>;

  canvas!: Canvas;
  originalImage: HTMLImageElement | null = null;
  segmenter: ImageSegmenter | null = null;

  busy = false;
  status = 'Upload a photo to get started.';

  private objectUrl: string | null = null;

  async ngAfterViewInit(): Promise<void> {
    this.canvas = new Canvas(this.canvasElement.nativeElement, {
      width: 900,
      height: 600,
      backgroundColor: '#eeeeee',
      preserveObjectStacking: true
    });

    this.canvas.renderAll();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.status = 'Choose a JPG, PNG, or WebP image.';
      input.value = '';
      return;
    }

    // Keep large uploads from exhausting browser memory.
    if (file.size > 10 * 1024 * 1024) {
      this.status = 'Please choose an image smaller than 10 MB.';
      input.value = '';
      return;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = URL.createObjectURL(file);

    const image = new Image();
    image.onload = async () => {
      this.originalImage = image;
      await this.showImage(image);
      this.status = 'Photo loaded. You can edit it now.';
    };

    image.onerror = () => {
      this.status = 'Could not open this image.';
    };

    image.src = this.objectUrl;
    input.value = '';
  }

  private async showImage(image: HTMLImageElement): Promise<void> {
    if (!this.canvas) return;

    this.canvas.clear();
    this.canvas.backgroundColor = '#eeeeee';

    const fabricImage = new FabricImage(image, {
      left: 0,
      top: 0,
      selectable: false,
      evented: false
    });

    const scale = Math.min(
      900 / image.naturalWidth,
      540 / image.naturalHeight,
      1
    );

    fabricImage.scale(scale);
    this.canvas.add(fabricImage);
    this.canvas.sendObjectToBack(fabricImage);
    this.canvas.renderAll();
  }

  private async getSegmenter(): Promise<ImageSegmenter> {
    if (this.segmenter) return this.segmenter;

    this.status = 'Loading the AI segmentation model…';

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false
    });

    return this.segmenter;
  }

  async applyBackgroundBlur(): Promise<void> {
    if (!this.originalImage || this.busy) return;

    this.busy = true;
    this.status = 'Applying AI background blur…';

    try {
      const image = this.originalImage;
      const segmenter = await this.getSegmenter();

      // Resize for better performance on lower-memory PCs.
      const maxSide = 900;
      const scale = Math.min(
        1,
        maxSide / Math.max(image.naturalWidth, image.naturalHeight)
      );

      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));

      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;

      const sourceContext = source.getContext('2d');
      if (!sourceContext) throw new Error('Could not create image canvas.');

      sourceContext.drawImage(image, 0, 0, width, height);

      // MediaPipe returns a category mask for the image.
      const result = segmenter.segment(source);
      const mask = result.categoryMask;

      if (!mask) {
        throw new Error('The model did not return a segmentation mask.');
      }

      const maskData = mask.getAsUint8Array();
      const maskWidth = mask.width;
      const maskHeight = mask.height;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;

      const maskContext = maskCanvas.getContext('2d');
      if (!maskContext) throw new Error('Could not create mask canvas.');

      const maskPixels = maskContext.createImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const sourceX = Math.min(
            maskWidth - 1,
            Math.floor(x * maskWidth / width)
          );
          const sourceY = Math.min(
            maskHeight - 1,
            Math.floor(y * maskHeight / height)
          );

          const maskIndex = sourceY * maskWidth + sourceX;
          const pixelIndex = (y * width + x) * 4;

          const isForeground = maskData[maskIndex] > 0;

          maskPixels.data[pixelIndex] = 255;
          maskPixels.data[pixelIndex + 1] = 255;
          maskPixels.data[pixelIndex + 2] = 255;
          maskPixels.data[pixelIndex + 3] = isForeground ? 255 : 0;
        }
      }

      maskContext.putImageData(maskPixels, 0, 0);

      // Make a blurred version of the whole image.
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;

      const outputContext = output.getContext('2d');
      if (!outputContext) throw new Error('Could not create output canvas.');

      outputContext.filter = 'blur(12px)';
      outputContext.drawImage(source, 0, 0);
      outputContext.filter = 'none';

      // Keep only the foreground in a separate layer.
      const foreground = document.createElement('canvas');
      foreground.width = width;
      foreground.height = height;

      const foregroundContext = foreground.getContext('2d');
      if (!foregroundContext) {
        throw new Error('Could not create foreground canvas.');
      }

      foregroundContext.drawImage(source, 0, 0);
      foregroundContext.globalCompositeOperation = 'destination-in';
      foregroundContext.drawImage(maskCanvas, 0, 0);
      foregroundContext.globalCompositeOperation = 'source-over';

      // Put the sharp foreground over the blurred background.
      outputContext.drawImage(foreground, 0, 0);

      const edited = new Image();
      edited.onload = async () => {
        await this.showImage(edited);
        this.status = 'Background blur applied. Download or continue editing.';
        this.busy = false;
      };
      edited.onerror = () => {
        this.status = 'Could not display the processed photo.';
        this.busy = false;
      };
      edited.src = output.toDataURL('image/png');

      mask.close();
    } catch (error) {
      console.error(error);
      this.status =
        'AI effect failed. Check your internet connection and browser console.';
      this.busy = false;
    }
  }

  async restoreOriginal(): Promise<void> {
    if (!this.originalImage) return;

    await this.showImage(this.originalImage);
    this.status = 'Original photo restored.';
  }

  addText(): void {
    if (!this.canvas) return;

    const text = new IText('Your text', {
      left: 100,
      top: 100,
      fontSize: 32,
      fill: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#222222',
      strokeWidth: 0.5
    });

    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.canvas.renderAll();
  }

  addRectangle(): void {
    if (!this.canvas) return;

    const rectangle = new Rect({
      left: 120,
      top: 120,
      width: 180,
      height: 100,
      fill: 'rgba(0, 150, 255, 0.35)',
      stroke: '#0096ff',
      strokeWidth: 3
    });

    this.canvas.add(rectangle);
    this.canvas.setActiveObject(rectangle);
    this.canvas.renderAll();
  }

  deleteSelected(): void {
    if (!this.canvas) return;

    const selected = this.canvas.getActiveObjects();
    if (!selected.length) {
      this.status = 'Select an object first.';
      return;
    }

    selected.forEach(object => this.canvas.remove(object));
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  rotateSelected(): void {
    if (!this.canvas) return;

    const selected = this.canvas.getActiveObject();
    if (!selected) {
      this.status = 'Select an object first.';
      return;
    }

    selected.rotate(((selected.angle ?? 0) + 90) % 360);
    this.canvas.renderAll();
  }

  downloadImage(): void {
    if (!this.canvas) return;

    this.canvas.discardActiveObject();
    this.canvas.renderAll();

    const link = document.createElement('a');
    link.download = 'edited-photo.png';
    link.href = this.canvas.toDataURL({
      format: 'png',
      multiplier: 1
    });
    link.click();

    this.status = 'PNG export started.';
  }

  ngOnDestroy(): void {
    this.segmenter?.close();
    this.canvas?.dispose();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }
}

// Ensures TypeScript explicitly treats this file as an ES module
export {};