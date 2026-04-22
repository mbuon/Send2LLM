import type { Annotation, Session } from '../../shared/types.js';
import { generateId } from '../../shared/utils.js';
import { startPicker, stopPicker, getElementInfo } from '../element-picker.js';
import { getConsoleLogs } from '../console-capture.js';
import { renderAnnotationList } from './annotation-list.js';
import { showPopover } from './popover.js';
import { renderRecorderBar } from './recorder-bar.js';

let sidebarHost: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let annotations: Annotation[] = [];
let pickingMode = false;
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
  sidebarHost?.remove();
  sidebarHost = null;
  shadow = null;
  annotations = [];
  stopPicker();
}

export function toggleSidebar(): void {
  if (sidebarHost) { unmountSidebar(); } else { mountSidebar(); }
}

function clearElement(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
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

  // --- Header ---
  const header = document.createElement('div');
  header.className = 's2l-header';

  const title = document.createElement('span');
  title.className = 's2l-title';
  title.textContent = '\u25CF Send2LLM';

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
        const ann: Annotation = {
          id: generateId(),
          number: annotations.length + 1,
          ...partial,
          ...info,
          elementScreenshotBase64: '',
          elementScreenshotPath: '',
          createdAt: new Date().toISOString(),
        };
        if (fullPageBase64) {
          const { base64 } = await chrome.runtime.sendMessage({
            type: 'CROP_ELEMENT', fullPageBase64, boundingBox: info.boundingBox,
          });
          ann.elementScreenshotBase64 = base64 ?? '';
        }
        annotations.push(ann);
        renderSidebar();
      }, () => { pickingMode = false; renderSidebar(); });
    });
  } else {
    stopPicker();
  }
  renderSidebar();
}

function deleteAnnotation(id: string): void {
  annotations = annotations.filter((a) => a.id !== id);
  annotations.forEach((a, i) => { a.number = i + 1; });
  renderSidebar();
}

async function buildSession(): Promise<Session> {
  if (!fullPageBase64) {
    const tab = await chrome.tabs.getCurrent();
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE', tabId: tab?.id });
    fullPageBase64 = res?.base64 ?? '';
  }
  return {
    id: generateId(),
    url: window.location.href,
    pageTitle: document.title,
    capturedAt: new Date().toISOString(),
    fullPageScreenshotBase64: fullPageBase64,
    fullPageScreenshotPath: '',
    annotations: [...annotations],
    consoleLogs: getConsoleLogs(),
    sessionStorage: { ...window.sessionStorage },
  };
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
  const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING', sources });
  if (res?.error) { alert(`Recording error: ${res.error}`); return; }
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
  const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  isRecording = false;
  if (res?.base64 && !res.error) {
    (window as any).__s2l_recording = {
      base64: res.base64, durationMs: res.durationMs, sources: res.sources,
      filename: 'recording.webm', path: '',
    };
  }
  renderSidebar();
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
