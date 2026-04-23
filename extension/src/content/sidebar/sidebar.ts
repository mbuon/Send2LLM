import type { Annotation, Session, BoundingBox } from '../../shared/types.js';
import { generateId } from '../../shared/utils.js';
import { throttled } from '../../shared/timing.js';
import { startPicker, stopPicker, getElementInfo } from '../element-picker.js';
import { startRegionPicker, stopRegionPicker } from '../region-picker.js';
import { getConsoleLogs } from '../console-capture.js';
import { startRecording, stopRecording } from '../recorder.js';
import { renderAnnotationList } from './annotation-list.js';
import { showPopover } from './popover.js';
import { renderRecorderBar } from './recorder-bar.js';

let sidebarHost: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let annotations: Annotation[] = [];
let pickingMode = false;
let regionPickingMode = false;
let pendingRecording: { base64: string; durationMs: number; sources: ('screen' | 'microphone' | 'tab-audio')[] } | null = null;
let isRecording = false;
let recordingStart = 0;
let recordingInterval: ReturnType<typeof setInterval> | null = null;
let selectedSources = new Set<'screen' | 'microphone' | 'tab-audio'>(['screen']);
let fullPageBase64 = '';

export function mountSidebar(): void {
  if (sidebarHost) return;
  sidebarHost = document.createElement('div');
  sidebarHost.id = 's2l-sidebar-host';
  shadow = sidebarHost.attachShadow({ mode: 'open' });
  document.body.appendChild(sidebarHost);
  renderSidebar();
}

export function unmountSidebar(): void {
  // Stop any active modal interactions
  stopPicker();
  stopRegionPicker();
  pickingMode = false;
  regionPickingMode = false;

  // Tear down recording timer (the recording itself is not silently killed —
  // the user must explicitly Stop. But the timer references a stale shadow.)
  if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }

  // Clean up any orphan popover / region highlight created via document.body
  document.getElementById('s2l-popover-host')?.remove();
  document.getElementById('s2l-region-highlight')?.remove();

  sidebarHost?.remove();
  sidebarHost = null;
  shadow = null;
  // Note: we intentionally KEEP `annotations` so a user closing the sidebar
  // accidentally does not lose work. They are cleared on a fresh page load.
}

export function toggleSidebar(): void {
  if (sidebarHost) { unmountSidebar(); } else { mountSidebar(); }
}

function clearElement(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const POS_KEY = 's2l-sidebar-pos';

function applySavedPosition(sidebar: HTMLElement): void {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left !== 'number' || typeof parsed?.top !== 'number') return;
    // Clamp to current viewport so a sidebar saved on a wide monitor isn't
    // stuck off-screen on a narrow one.
    const minVisible = 80;
    const left = Math.max(0, Math.min(window.innerWidth - minVisible, parsed.left));
    const top = Math.max(0, Math.min(window.innerHeight - 40, parsed.top));
    sidebar.style.left = `${left}px`;
    sidebar.style.top = `${top}px`;
    sidebar.style.right = 'auto';
  } catch { /* ignore */ }
}

function onDragMouseDown(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('button')) return;
  if (!shadow) return;
  const sidebar = shadow.getElementById('s2l-sidebar') as HTMLElement | null;
  if (!sidebar) return;

  const rect = sidebar.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  sidebar.classList.add('dragging');
  sidebar.style.right = 'auto';
  e.preventDefault();

  const onMove = throttled((ev: MouseEvent): void => {
    // Recompute width every frame in case the sidebar resized (collapse/expand)
    const liveRect = sidebar.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - liveRect.width);
    const maxTop = Math.max(0, window.innerHeight - 40);
    const left = Math.max(0, Math.min(maxLeft, ev.clientX - offsetX));
    const top = Math.max(0, Math.min(maxTop, ev.clientY - offsetY));
    sidebar.style.left = `${left}px`;
    sidebar.style.top = `${top}px`;
  }, 16);

  const onUp = (): void => {
    sidebar.classList.remove('dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        left: parseFloat(sidebar.style.left),
        top: parseFloat(sidebar.style.top),
      }));
    } catch { /* ignore */ }
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function renderSidebar(): void {
  if (!shadow) return;

  clearElement(shadow as unknown as Element);

  // Stylesheet link
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/sidebar/sidebar.css');
  shadow.appendChild(link);

  // Root sidebar div
  const sidebar = document.createElement('div');
  sidebar.id = 's2l-sidebar';
  applySavedPosition(sidebar);

  // --- Header ---
  const header = document.createElement('div');
  header.className = 's2l-header';

  const title = document.createElement('span');
  title.className = 's2l-title';
  const dot = document.createElement('span');
  dot.className = 's2l-title-dot';
  const label = document.createElement('span');
  label.textContent = 'Send2LLM';
  title.appendChild(dot);
  title.appendChild(label);

  header.addEventListener('mousedown', onDragMouseDown);

  const headerActions = document.createElement('div');
  headerActions.className = 's2l-header-actions';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 's2l-btn-icon';
  collapseBtn.id = 's2l-collapse-btn';
  collapseBtn.title = 'Collapse';
  collapseBtn.textContent = '\u2212';
  collapseBtn.addEventListener('click', () => {
    shadow!.getElementById('s2l-sidebar')!.classList.toggle('collapsed');
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 's2l-btn-icon';
  closeBtn.id = 's2l-close-btn';
  closeBtn.title = 'Close';
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', unmountSidebar);

  headerActions.appendChild(collapseBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(headerActions);

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.className = 's2l-toolbar';

  const pickBtn = document.createElement('button');
  pickBtn.className = `s2l-btn${pickingMode ? ' active' : ''}`;
  pickBtn.id = 's2l-pick-btn';
  pickBtn.textContent = 'Pick Element';
  pickBtn.addEventListener('click', togglePickMode);
  toolbar.appendChild(pickBtn);

  const regionBtn = document.createElement('button');
  regionBtn.className = `s2l-btn${regionPickingMode ? ' active' : ''}`;
  regionBtn.id = 's2l-region-btn';
  regionBtn.textContent = 'Pick Region';
  regionBtn.addEventListener('click', toggleRegionMode);
  toolbar.appendChild(regionBtn);

  // --- Annotation list ---
  const annotationList = document.createElement('div');
  annotationList.className = 's2l-annotations';
  annotationList.id = 's2l-annotation-list';

  // --- Recorder bar ---
  const recBar = document.createElement('div');
  recBar.id = 's2l-rec-bar';
  recBar.className = 's2l-rec-bar';

  // --- Footer ---
  const footer = document.createElement('div');
  footer.className = 's2l-footer';

  const exportWrapper = document.createElement('div');
  exportWrapper.className = 's2l-btn-export';

  const exportToggle = document.createElement('button');
  exportToggle.className = 's2l-btn';
  exportToggle.id = 's2l-export-toggle';
  exportToggle.textContent = 'Export \u25BE';
  exportToggle.addEventListener('click', () => {
    shadow!.getElementById('s2l-export-menu')!.classList.toggle('open');
  });

  const exportMenu = document.createElement('div');
  exportMenu.className = 's2l-export-menu';
  exportMenu.id = 's2l-export-menu';

  const exportOptions: Array<{ action: string; label: string }> = [
    { action: 'copy-md', label: 'Copy Markdown' },
    { action: 'download-zip', label: 'Download ZIP' },
    { action: 'download-json', label: 'Download JSON' },
  ];
  for (const opt of exportOptions) {
    const optBtn = document.createElement('button');
    optBtn.className = 's2l-export-option';
    optBtn.dataset.action = opt.action;
    optBtn.textContent = opt.label;
    optBtn.addEventListener('click', () => {
      shadow!.getElementById('s2l-export-menu')!.classList.remove('open');
      handleExport(opt.action);
    });
    exportMenu.appendChild(optBtn);
  }

  exportWrapper.appendChild(exportToggle);
  exportWrapper.appendChild(exportMenu);

  const mcpBtn = document.createElement('button');
  mcpBtn.className = 's2l-btn-primary';
  mcpBtn.id = 's2l-mcp-btn';
  mcpBtn.textContent = 'Send \u2192 MCP';
  mcpBtn.addEventListener('click', handleSendToMcp);

  footer.appendChild(exportWrapper);
  footer.appendChild(mcpBtn);

  // Assemble sidebar
  sidebar.appendChild(header);
  sidebar.appendChild(toolbar);
  sidebar.appendChild(annotationList);
  sidebar.appendChild(recBar);
  sidebar.appendChild(footer);
  shadow.appendChild(sidebar);

  renderAnnotationList(annotations, deleteAnnotation, shadow);
  renderRecorderBar(shadow, isRecording, isRecording ? Date.now() - recordingStart : 0,
    selectedSources, handleStartRecording, handleStopRecording);
}

function togglePickMode(): void {
  pickingMode = !pickingMode;
  if (pickingMode) {
    startPicker(async (el) => {
      pickingMode = false;
      const info = getElementInfo(el);
      showPopover(el, annotations.length + 1, async (partial) => {
        let elementScreenshotBase64 = '';
        if (fullPageBase64) {
          const cropRes = await chrome.runtime.sendMessage({
            type: 'CROP_ELEMENT', fullPageBase64, boundingBox: info.boundingBox,
          });
          elementScreenshotBase64 = cropRes?.base64 ?? '';
        }
        const ann: Annotation = {
          id: generateId(),
          number: annotations.length + 1, // atomic at push time
          ...partial,
          ...info,
          elementScreenshotBase64,
          elementScreenshotPath: '',
          createdAt: new Date().toISOString(),
        };
        annotations.push(ann);
        renderSidebar();
      }, () => { pickingMode = false; renderSidebar(); });
    });
  } else {
    stopPicker();
  }
  renderSidebar();
}

function toggleRegionMode(): void {
  if (regionPickingMode) {
    stopRegionPicker();
    regionPickingMode = false;
    renderSidebar();
    return;
  }
  regionPickingMode = true;
  renderSidebar();

  startRegionPicker(async (box: BoundingBox) => {
    regionPickingMode = false;
    renderSidebar();
    await captureRegionAnnotation(box);
  }, () => {
    regionPickingMode = false;
    renderSidebar();
  });
}

async function captureRegionAnnotation(box: BoundingBox): Promise<void> {
  // Capture full page FIRST so the user doesn't see the page scroll after picking
  if (!fullPageBase64) {
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE' });
    fullPageBase64 = res?.base64 ?? '';
  }

  // Scroll the picked region into view, then anchor popover at its viewport position
  const targetScrollY = Math.max(0, box.y - 80);
  const viewportTop = box.y - targetScrollY;
  const viewportLeft = box.x;
  const anchorRect = {
    top: viewportTop,
    left: viewportLeft,
    bottom: viewportTop + box.height,
    right: viewportLeft + box.width,
    width: box.width,
    height: box.height,
  };

  showPopover(document.body, annotations.length + 1, async (partial) => {
    let elementScreenshotBase64 = '';
    if (fullPageBase64) {
      const cropRes = await chrome.runtime.sendMessage({
        type: 'CROP_ELEMENT', fullPageBase64, boundingBox: box,
      });
      elementScreenshotBase64 = cropRes?.base64 ?? '';
    }
    const ann: Annotation = {
      id: generateId(),
      number: annotations.length + 1,
      ...partial,
      selector: `region(${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}x${Math.round(box.height)})`,
      elementHTML: '',
      boundingBox: box,
      elementScreenshotBase64,
      elementScreenshotPath: '',
      createdAt: new Date().toISOString(),
    };
    annotations.push(ann);
    renderSidebar();
  }, () => { renderSidebar(); }, { anchorRect, highlightBox: box });
}

function deleteAnnotation(id: string): void {
  annotations = annotations.filter((a) => a.id !== id);
  annotations.forEach((a, i) => { a.number = i + 1; });
  renderSidebar();
}

async function buildSession(): Promise<Session> {
  if (!fullPageBase64) {
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE' });
    fullPageBase64 = res?.base64 ?? '';
  }
  const session: Session = {
    id: generateId(),
    url: window.location.href,
    pageTitle: document.title,
    capturedAt: new Date().toISOString(),
    fullPageScreenshotBase64: fullPageBase64,
    fullPageScreenshotPath: '',
    annotations: [...annotations],
    consoleLogs: getConsoleLogs(),
    sessionStorage: snapshotSessionStorage(),
  };
  if (pendingRecording) {
    session.recording = {
      filename: 'recording.webm',
      path: '',
      sources: pendingRecording.sources,
      durationMs: pendingRecording.durationMs,
      base64: pendingRecording.base64,
    };
  }
  return session;
}

async function handleExport(action: string): Promise<void> {
  const session = await buildSession();
  if (action === 'copy-md') {
    const { markdown } = await chrome.runtime.sendMessage({ type: 'EXPORT_MARKDOWN', session });
    await navigator.clipboard.writeText(markdown);
  } else if (action === 'download-zip') {
    const { buffer } = await chrome.runtime.sendMessage({ type: 'EXPORT_ZIP', session });
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/zip' });
    downloadBlob(blob, `send2llm-${Date.now()}.zip`);
  } else if (action === 'download-json') {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `send2llm-${Date.now()}.json`);
  }
}

async function handleSendToMcp(): Promise<void> {
  const session = await buildSession();
  const res = await chrome.runtime.sendMessage({ type: 'SEND_TO_MCP', session });
  if (res?.error) alert(`Send2LLM: MCP error \u2014 ${res.error}`);
  else alert('Send2LLM: Session sent to MCP server.');
}

async function handleStartRecording(sources: ('screen' | 'microphone' | 'tab-audio')[]): Promise<void> {
  selectedSources = new Set(sources);
  try {
    await startRecording(sources);
  } catch (err) {
    alert(`Recording error: ${(err as Error).message}`);
    return;
  }
  isRecording = true;
  recordingStart = Date.now();
  recordingInterval = setInterval(() => renderRecorderBar(
    shadow!, true, Date.now() - recordingStart, selectedSources,
    handleStartRecording, handleStopRecording,
  ), 1000);
  renderSidebar();
}

async function handleStopRecording(): Promise<void> {
  if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
  try {
    const res = await stopRecording();
    pendingRecording = { base64: res.base64, durationMs: res.durationMs, sources: res.sources };
  } catch (err) {
    alert(`Recording error: ${(err as Error).message}`);
  }
  isRecording = false;
  renderSidebar();
}

function snapshotSessionStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key !== null) out[key] = window.sessionStorage.getItem(key) ?? '';
    }
  } catch { /* sandboxed iframes can throw on access */ }
  return out;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
