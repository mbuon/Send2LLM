type Strip = string | { dataUrl: string; cropTop?: number };

export async function stitchStrips(strips: Strip[]): Promise<string> {
  const normalized = strips.map((s) => typeof s === 'string' ? { dataUrl: s, cropTop: 0 } : { dataUrl: s.dataUrl, cropTop: s.cropTop ?? 0 });

  const images = await Promise.all(
    normalized.map(({ dataUrl }) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    }))
  );

  if (images.length === 0) throw new Error('stitchStrips: no strips');

  const width = images[0].width;
  let totalHeight = 0;
  const visibleHeights: number[] = [];
  for (let i = 0; i < images.length; i++) {
    const cropTop = normalized[i].cropTop ?? 0;
    const visible = Math.max(0, images[i].height - cropTop);
    visibleHeights.push(visible);
    totalHeight += visible;
  }

  const canvas = new OffscreenCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d')!;
  let y = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const cropTop = normalized[i].cropTop ?? 0;
    ctx.drawImage(img, 0, cropTop, img.width, img.height - cropTop, 0, y, img.width, img.height - cropTop);
    y += visibleHeights[i];
  }

  // JPEG (quality 0.85) keeps the stitched full-page image well under
  // Chrome's 64MB runtime.sendMessage cap even for tall news-site pages.
  // Element crops off this image are exported server-side; minor JPEG
  // artifacts are acceptable for a full-page context screenshot.
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return blobToBase64(blob);
}

export async function cropFromFullPage(
  fullPageBase64: string,
  x: number, y: number, width: number, height: number,
  dpr: number = 1,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${fullPageBase64}`;
  });

  // captureVisibleTab / stitched canvas are in device pixels; box coords are CSS px.
  // But some pages have a CSS-wide zoom or the actual image DPR may not match
  // window.devicePixelRatio — derive the scale from the image itself against the
  // logical viewport width reported by the caller. If dpr=1 we treat it as
  // "scale to image size", otherwise trust the caller's DPR.
  const sx = Math.round(x * dpr);
  const sy = Math.round(y * dpr);
  const sw = Math.max(1, Math.round(width * dpr));
  const sh = Math.max(1, Math.round(height * dpr));

  // Clamp to image bounds — drawImage with a source box partly outside the
  // image silently draws nothing on Chrome/Safari.
  const clampedSx = Math.max(0, Math.min(sx, img.width - 1));
  const clampedSy = Math.max(0, Math.min(sy, img.height - 1));
  const clampedSw = Math.max(1, Math.min(sw, img.width - clampedSx));
  const clampedSh = Math.max(1, Math.min(sh, img.height - clampedSy));

  console.log('[Send2LLM/offscreen] crop', {
    img: { w: img.width, h: img.height },
    src: { sx, sy, sw, sh }, clamped: { clampedSx, clampedSy, clampedSw, clampedSh },
    dpr, input: { x, y, width, height },
  });

  const canvas = new OffscreenCanvas(clampedSw, clampedSh);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, clampedSx, clampedSy, clampedSw, clampedSh, 0, 0, clampedSw, clampedSh);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToBase64(blob);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
