
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import {
  Canvas,
  FabricImage,
  filters,
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
  imports: [CommonModule, RouterModule],
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
  private destroyed = false;

  async ngAfterViewInit(): Promise<void> {
    this.canvas = new Canvas(this.canvasElement.nativeElement, {
      width: 900,
      height: 600,
      backgroundColor: '#eeeeee',
      preserveObjectStacking: true,
      selection: true
    });

    this.canvas.renderAll();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      this.status = 'Choose a JPG, PNG, or WebP image.';
      input.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.status = 'Please choose an image smaller than 10 MB.';
      input.value = '';
      return;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    const url = URL.createObjectURL(file);
    this.objectUrl = url;

    const image = new Image();

    image.onload = async () => {
      if (this.destroyed || this.objectUrl !== url) {
        return;
      }

      this.originalImage = image;

      try {
        await this.showImage(image);
        this.status = 'Photo loaded. Choose an effect or add elements.';
      } catch (error) {
        console.error('Unable to display image:', error);
        this.status = 'Could not display this image.';
      }
    };

    image.onerror = () => {
      if (this.objectUrl === url) {
        this.status = 'Could not open this image. Try another file.';
      }
    };

    image.src = url;

    // Permit choosing the same file again later.
    input.value = '';
  }

  private async showImage(image: HTMLImageElement): Promise<void> {
    if (!this.canvas || this.destroyed) {
      return;
    }

    this.canvas.clear();
    this.canvas.backgroundColor = '#eeeeee';

    const fabricImage = new FabricImage(image, {
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      objectCaching: false
    });

    const scale = Math.min(
      860 / image.naturalWidth,
      540 / image.naturalHeight,
      1
    );

    fabricImage.scale(scale);

    this.canvas.add(fabricImage);
    this.canvas.sendObjectToBack(fabricImage);
    this.canvas.requestRenderAll();
  }

  private getPhotoObjects(): FabricImage[] {
    if (!this.canvas) {
      return [];
    }

    return this.canvas
      .getObjects()
      .filter(object => object.type === 'image') as FabricImage[];
  }

  // Black-and-white / grayscale effect.
  applyGrayscale(): void {
    this.applyPhotoFilters('grayscale');
  }

  // More dramatic black-and-white effect.
  applyHighContrastBW(): void {
    this.applyPhotoFilters('high-contrast');
  }

  private applyPhotoFilters(
    mode: 'grayscale' | 'high-contrast'
  ): void {
    if (!this.canvas) {
      return;
    }

    const photos = this.getPhotoObjects();

    if (photos.length === 0) {
      this.status = 'Upload a photo before applying an effect.';
      return;
    }

    try {
      for (const photo of photos) {
        const grayscale = new filters.Grayscale();

        photo.filters = mode === 'grayscale'
          ? [grayscale]
          : [
              grayscale,
              new filters.Contrast({ contrast: 0.35 })
            ];

        photo.applyFilters();
      }

      this.canvas.requestRenderAll();

      this.status = mode === 'grayscale'
        ? 'Black-and-white effect applied.'
        : 'High-contrast black-and-white effect applied.';
    } catch (error) {
      console.error('Photo filter failed:', error);
      this.status =
        'Could not apply this filter. Check the installed Fabric.js version.';
    }
  }

  private async getSegmenter(): Promise<ImageSegmenter> {
    if (this.segmenter) {
      return this.segmenter;
    }

    this.status = 'Loading the AI segmentation model…';

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'
      },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false
    });

    if (this.destroyed) {
      segmenter.close();
      throw new Error('Editor was closed while loading the AI model.');
    }

    this.segmenter = segmenter;
    return segmenter;
  }

  async applyBackgroundBlur(): Promise<void> {
    if (!this.originalImage || this.busy || !this.canvas) {
      if (!this.originalImage) {
        this.status = 'Upload a photo before applying background blur.';
      }
      return;
    }

    this.busy = true;
    this.status = 'Applying AI background blur…';

    let maskToClose: ReturnType<ImageSegmenter['segment']>['categoryMask'] = undefined;

    try {
      const image = this.originalImage;
      if (!image) {
        this.status = 'Upload a photo before applying background blur.';
        return;
      }
      const segmenter = await this.getSegmenter();

      // Resize the image to reduce memory usage on smaller PCs.
      const maxSide = 900;
      const scale = Math.min(
        1,
        maxSide / Math.max(image.naturalWidth, image.naturalHeight)
      );

      const width = Math.max(
        1,
        Math.round(image.naturalWidth * scale)
      );

      const height = Math.max(
        1,
        Math.round(image.naturalHeight * scale)
      );

      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;

      const sourceContext = source.getContext('2d');

      if (!sourceContext) {
        throw new Error('Could not create source canvas.');
      }

      sourceContext.drawImage(image, 0, 0, width, height);

      const result = segmenter.segment(source);
      maskToClose = result.categoryMask;

      if (!maskToClose) {
        throw new Error('The model did not return a category mask.');
      }

      const maskData = maskToClose.getAsUint8Array();
      const maskWidth = maskToClose.width;
      const maskHeight = maskToClose.height;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;

      const maskContext = maskCanvas.getContext('2d');

      if (!maskContext) {
        throw new Error('Could not create mask canvas.');
      }

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

          // This model uses category 0 for background and
          // category 1 for the foreground person.
          const isForeground = maskData[maskIndex] > 0;

          maskPixels.data[pixelIndex] = 255;
          maskPixels.data[pixelIndex + 1] = 255;
          maskPixels.data[pixelIndex + 2] = 255;
          maskPixels.data[pixelIndex + 3] =
            isForeground ? 255 : 0;
        }
      }

      maskContext.putImageData(maskPixels, 0, 0);

      // Create the blurred background.
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;

      const outputContext = output.getContext('2d');

      if (!outputContext) {
        throw new Error('Could not create output canvas.');
      }

      outputContext.filter = 'blur(10px)';
      outputContext.drawImage(source, 0, 0);
      outputContext.filter = 'none';

      // Mask the sharp image so only the foreground remains.
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

      // Composite the sharp foreground on the blurred background.
      outputContext.drawImage(foreground, 0, 0);

      const edited = new Image();

      const editedUrl = output.toDataURL('image/png');

      await new Promise<void>((resolve, reject) => {
        edited.onload = () => resolve();
        edited.onerror = () =>
          reject(new Error('Could not display the processed photo.'));
        edited.src = editedUrl;
      });

      if (this.destroyed) {
        return;
      }

      await this.showImage(edited);

      this.status =
        'Background blur applied. Export your photo or continue editing.';
    } catch (error) {
      console.error('AI background blur failed:', error);

      this.status =
        'AI background blur failed. Check your internet connection and browser console.';
    } finally {
      maskToClose?.close();
      this.busy = false;
    }
  }

  async restoreOriginal(): Promise<void> {
    if (!this.originalImage || this.busy) {
      this.status = 'Upload a photo before restoring the original.';
      return;
    }

    await this.showImage(this.originalImage);
    this.status = 'Original photo restored. Previous canvas elements were cleared.';
  }

  addText(): void {
    if (!this.canvas) {
      return;
    }

    const text = new IText('Your text', {
      left: 100,
      top: 100,
      fontSize: 32,
      fill: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#222222',
      strokeWidth: 0.5,
      editable: true
    });

    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.canvas.requestRenderAll();

    this.status = 'Text added. Double-click it to edit.';
  }

  addRectangle(): void {
    if (!this.canvas) {
      return;
    }

    const rectangle = new Rect({
      left: 120,
      top: 120,
      width: 180,
      height: 100,
      fill: 'rgba(0, 150, 255, 0.25)',
      stroke: '#0096ff',
      strokeWidth: 3
    });

    this.canvas.add(rectangle);
    this.canvas.setActiveObject(rectangle);
    this.canvas.requestRenderAll();

    this.status = 'Shape added to the canvas.';
  }

  // Alias used by the updated studio HTML.
  addShape(): void {
    this.addRectangle();
  }

  deleteSelected(): void {
    if (!this.canvas) {
      return;
    }

    const selected = this.canvas.getActiveObjects();

    if (selected.length === 0) {
      this.status = 'Select an object first.';
      return;
    }

    // Keep the base photo in place.
    const deletable = selected.filter(object => object.type !== 'image');

    if (deletable.length === 0) {
      this.status = 'The base photo cannot be deleted with this tool.';
      return;
    }

    deletable.forEach(object => this.canvas.remove(object));

    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();

    this.status = 'Selected element deleted.';
  }

  rotateSelected(): void {
    if (!this.canvas) {
      return;
    }

    const selected = this.canvas.getActiveObject();

    if (!selected) {
      this.status = 'Select an object first.';
      return;
    }

    if (selected.type === 'image') {
      this.status = 'The base photo is locked. Add an element to rotate it.';
      return;
    }

    selected.rotate(((selected.angle ?? 0) + 90) % 360);
    this.canvas.requestRenderAll();

    this.status = 'Selected element rotated.';
  }

  downloadImage(): void {
    if (!this.canvas) {
      return;
    }

    try {
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();

      const link = document.createElement('a');

      link.download = 'edited-photo.png';
      link.href = this.canvas.toDataURL({
        format: 'png',
        multiplier: 1
      });

      link.click();
      this.status = 'PNG export started.';
    } catch (error) {
      console.error('PNG export failed:', error);
      this.status = 'Could not export the image.';
    }
  }

  // Alias used by the updated studio HTML.
  downloadPng(): void {
    this.downloadImage();
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    this.segmenter?.close();
    this.segmenter = null;

    this.canvas?.dispose();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
