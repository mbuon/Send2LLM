export async function stitchStrips(strips: string[]): Promise<string> {
  const images = await Promise.all(
    strips.map((src) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    }))
  );

  const width = images[0].width;
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

  const canvas = new OffscreenCanvas(width, totalHeight);
  const ctx = canvas.getContext('2d')!;
  let y = 0;
  for (const img of images) {
    ctx.drawImage(img, 0, y);
    y += img.height;
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
