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

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToBase64(blob);
}

export async function cropFromFullPage(
  fullPageBase64: string,
  x: number, y: number, width: number, height: number,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = `data:image/png;base64,${fullPageBase64}`;
  });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
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
