import JSZip from 'jszip';
import type { Session } from '../shared/types.js';

export function buildMarkdown(session: Session): string {
  const lines: string[] = [
    `# Send2LLM Report`,
    `URL: ${session.url}`,
    `Page: ${session.pageTitle}`,
    `Captured: ${session.capturedAt}`,
    ``,
    `## Full Page Screenshot`,
    `![Full Page](data:image/png;base64,${session.fullPageScreenshotBase64})`,
    ``,
    `## Console Logs`,
    session.consoleLogs.length === 0
      ? '_No logs captured._'
      : session.consoleLogs.map((l) => `[${l.level}] ${l.timestamp} — ${l.message}`).join('\n'),
    ``,
    `## Session Storage`,
  ];

  const storageEntries = Object.entries(session.sessionStorage);
  if (storageEntries.length === 0) {
    lines.push('_Empty._');
  } else {
    storageEntries.forEach(([k, v]) => lines.push(`${k}: ${v}`));
  }

  lines.push(``, `## Annotations (${session.annotations.length})`);
  for (const ann of session.annotations) {
    lines.push(``, `### [${ann.type.toUpperCase()}] #${ann.number}`);
    lines.push(`- Created: ${ann.createdAt}`);
    lines.push(`- Page URL: ${session.url}`);
    lines.push(`- Selector: \`${ann.selector || '—'}\``);
    if (ann.xpath) lines.push(`- XPath: \`${ann.xpath}\``);
    if (ann.boundingBox.width) {
      const { x, y, width, height } = ann.boundingBox;
      lines.push(`- Bounding box: ${Math.round(x)},${Math.round(y)} ${Math.round(width)}×${Math.round(height)}`);
    }
    lines.push(``, `> ${ann.note}`);
    if (ann.elementScreenshotBase64) {
      lines.push(``, `![Element #${ann.number}](data:image/png;base64,${ann.elementScreenshotBase64})`);
    }
  }

  const recs = session.recordings ?? [];
  if (recs.length > 0) {
    lines.push(``, `## Recordings (${recs.length})`);
    recs.forEach((r, i) => lines.push(
      `- #${i + 1} ${r.filename} (${Math.round(r.durationMs / 1000)}s, sources: ${r.sources.join(', ')})`,
    ));
    lines.push(`_Attached in ZIP export under recordings/._`);
  }

  return lines.join('\n');
}

export async function buildZip(session: Session): Promise<Blob> {
  const zip = new JSZip();
  const md = buildMarkdown(session);

  // Strip base64 from markdown for ZIP version (images are separate files)
  const mdForZip = md.replace(/!\[.*?\]\(data:image\/png;base64,[^)]+\)/g, (match) => {
    const label = match.match(/!\[(.*?)\]/)?.[1] ?? 'image';
    return `![${label}](screenshots/${label.toLowerCase().replace(/\s+/g, '-')}.png)`;
  });

  zip.file('report.md', mdForZip);
  zip.file('report.json', JSON.stringify(session, null, 2));

  const screenshots = zip.folder('screenshots')!;
  if (session.fullPageScreenshotBase64) {
    screenshots.file('full-page.png', session.fullPageScreenshotBase64, { base64: true });
  }
  for (const ann of session.annotations) {
    if (ann.elementScreenshotBase64) {
      screenshots.file(`element-${ann.number}.png`, ann.elementScreenshotBase64, { base64: true });
    }
  }

  const recs = session.recordings ?? [];
  if (recs.length > 0) {
    const recDir = zip.folder('recordings')!;
    recs.forEach((r, i) => {
      if (r.base64) recDir.file(r.filename || `recording-${i + 1}.webm`, r.base64, { base64: true });
    });
  }

  return zip.generateAsync({ type: 'blob' });
}
