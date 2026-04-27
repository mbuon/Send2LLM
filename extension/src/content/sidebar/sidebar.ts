import type { Annotation, Session, BoundingBox } from '../../shared/types.js';
import { generateId } from '../../shared/utils.js';
import { throttled } from '../../shared/timing.js';
import { startPicker, stopPicker, getElementInfo } from '../element-picker.js';
import { startRegionPicker, stopRegionPicker } from '../region-picker.js';
import { getConsoleLogs } from '../console-capture.js';
import { startRecording, stopRecording } from '../recorder.js';
import { renderAnnotationList } from './annotation-list.js';
import { renderRecorderBar } from './recorder-bar.js';
import { shouldShowRecordIntro, showRecordIntro } from './record-intro.js';
import { getRecordingState } from '../recorder.js';

type AnnotationType = Annotation['type'];
type RecordingSource = 'screen' | 'microphone' | 'tab-audio';

interface PickedCapture {
  selector: string;
  xpath?: string;
  elementHTML: string;
  boundingBox: BoundingBox;
  elementScreenshotBase64: string;
}

interface DraftState {
  note: string;
  capture?: PickedCapture;
}

const POS_KEY = 's2l-sidebar-pos';
const ENABLED_KEY = 's2l-sidebar-enabled';
const PENDING_REC_KEY = 's2l-pending-recording';
const SCALE_KEY = 's2l-sidebar-scale';
const ORDER: AnnotationType[] = ['task', 'bug', 'comment', 'request'];

type ScaleStep = 'sm' | 'md' | 'lg';
const SCALES: ScaleStep[] = ['sm', 'md', 'lg'];
let currentScale: ScaleStep = 'md';

function nextScale(s: ScaleStep, dir: 1 | -1): ScaleStep {
  const i = SCALES.indexOf(s);
  return SCALES[Math.max(0, Math.min(SCALES.length - 1, i + dir))];
}

async function loadScale(): Promise<void> {
  try {
    const v = await chrome.storage?.local?.get?.(SCALE_KEY);
    const s = v?.[SCALE_KEY] as string | undefined;
    if (s === 'sm' || s === 'md' || s === 'lg') currentScale = s;
  } catch { /* ignore */ }
}

async function saveScale(): Promise<void> {
  try {
    await chrome.storage?.local?.set?.({ [SCALE_KEY]: currentScale });
  } catch { /* ignore */ }
}

// Persist the user's sidebar-on / sidebar-off intent across page loads and
// across tabs. chrome.storage.local survives navigation; localStorage would
// be per-origin, which means the sidebar would re-disappear when the user
// clicks a link to a different domain. Best-effort — extension contexts
// without storage access fall through silently.
async function setEnabledFlag(enabled: boolean): Promise<void> {
  try {
    await chrome.storage?.local?.set({ [ENABLED_KEY]: enabled });
  } catch { /* ignore */ }
}

async function loadEnabledFlag(): Promise<boolean> {
  try {
    const v = await chrome.storage?.local?.get?.(ENABLED_KEY);
    return Boolean(v?.[ENABLED_KEY]);
  } catch { return false; }
}

let sidebarHost: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let annotations: Annotation[] = [];
let pickingMode = false;
let regionPickingMode = false;
let pendingRecording: { base64: string; durationMs: number; sources: RecordingSource[] } | null = null;
let isRecording = false;
let recordingStart = 0;
let recordingInterval: ReturnType<typeof setInterval> | null = null;
let selectedSources = new Set<RecordingSource>(['screen']);
let fullPageBase64 = '';
let grabFullPage = false;
let activeTab: AnnotationType = 'task';
let drafts: Record<AnnotationType, DraftState> = {
  task: { note: '' }, bug: { note: '' }, comment: { note: '' }, request: { note: '' },
};
// `lastCapture` is the most recent pick from any draft. When the user fills
// drafts in tabs that don't have their own pick, the commit step attaches
// `lastCapture` to those drafts so a single pick can serve multiple types.
let lastCapture: PickedCapture | null = null;

export function mountSidebar(): void {
  if (sidebarHost) return;
  // The host element ID is sometimes left behind by an extension reload —
  // remove any stale node before mounting so we don't end up with two.
  const stale = document.getElementById('s2l-sidebar-host');
  if (stale) stale.remove();
  sidebarHost = document.createElement('div');
  sidebarHost.id = 's2l-sidebar-host';
  shadow = sidebarHost.attachShadow({ mode: 'open' });
  document.body.appendChild(sidebarHost);
  // Render synchronously so the user sees the widget immediately, then
  // hydrate any cross-page state (active recording, finished pendingRecording)
  // and re-render once it lands.
  renderSidebar();
  void hydrateRecordingState();
}

// Pull the live recording state from the offscreen document and any
// finished-but-not-yet-attached recording from chrome.storage.local. The
// previous content script (on a different page) may have started a recording
// that is still rolling, or stopped one that hasn't been attached to a
// session yet. Either way the new sidebar should reflect that state.
async function hydrateRecordingState(): Promise<void> {
  await loadScale();
  // Re-apply scale class in case the sidebar was already rendered before
  // hydrate finished. (mountSidebar calls renderSidebar synchronously, then
  // we async-load and may need to refresh.)
  if (shadow) {
    const sb = shadow.getElementById('s2l-sidebar');
    if (sb) {
      sb.classList.remove('s2l-scale-sm', 's2l-scale-md', 's2l-scale-lg');
      sb.classList.add(`s2l-scale-${currentScale}`);
    }
  }
  try {
    const live = await getRecordingState();
    if (live.active && live.startedAt) {
      isRecording = true;
      recordingStart = live.startedAt;
      if (live.sources) selectedSources = new Set(live.sources);
      // Restart the timer ticker (it was killed with the old content script).
      if (recordingInterval) clearInterval(recordingInterval);
      recordingInterval = setInterval(() => {
        if (!shadow) return;
        const t = shadow.getElementById('s2l-rec-pill-timer');
        if (t) t.textContent = formatRecTime(Date.now() - recordingStart);
      }, 1000);
      renderSidebar();
      return;
    }
  } catch { /* ignore */ }

  // No live recording — check for a finished one waiting to be attached.
  try {
    const stored = await chrome.storage?.local?.get?.(PENDING_REC_KEY);
    const rec = stored?.[PENDING_REC_KEY] as
      { base64?: string; durationMs?: number; sources?: RecordingSource[] } | undefined;
    if (rec?.base64) {
      pendingRecording = {
        base64: rec.base64,
        durationMs: rec.durationMs ?? 0,
        sources: rec.sources ?? ['screen'],
      };
      renderSidebar();
    }
  } catch { /* ignore */ }
}

async function clearPendingRecordingStorage(): Promise<void> {
  try { await chrome.storage?.local?.remove?.(PENDING_REC_KEY); } catch { /* ignore */ }
}

export function unmountSidebar(): void {
  stopPicker();
  stopRegionPicker();
  pickingMode = false;
  regionPickingMode = false;
  if (recordingInterval) { clearInterval(recordingInterval); recordingInterval = null; }
  document.getElementById('s2l-region-highlight')?.remove();
  sidebarHost?.remove();
  sidebarHost = null;
  shadow = null;
}

export function toggleSidebar(): void {
  if (sidebarHost) {
    unmountSidebar();
    void setEnabledFlag(false);
  } else {
    mountSidebar();
    void setEnabledFlag(true);
  }
}

// Called by the content script on every page load. If the user previously
// turned the sidebar on, re-mount it automatically so it survives clicking
// links and opening new tabs. The body may not exist yet at document_start;
// wait for it and retry.
export async function ensureSidebarFromStorage(): Promise<void> {
  const enabled = await loadEnabledFlag();
  if (!enabled) return;
  if (document.body) {
    mountSidebar();
    return;
  }
  // Body not parsed yet (document_start). Listen for it.
  const onReady = (): void => {
    document.removeEventListener('DOMContentLoaded', onReady);
    if (!sidebarHost) mountSidebar();
  };
  document.addEventListener('DOMContentLoaded', onReady, { once: true });
}

// Subscribe to storage changes so toggling the sidebar in one tab updates
// every other open tab in real time. (E.g. user closes the sidebar with X
// here → the new tab they opened earlier also closes its sidebar.)
export function watchSidebarFlag(): void {
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (ENABLED_KEY in changes) {
        const next = Boolean(changes[ENABLED_KEY].newValue);
        if (next && !sidebarHost) mountSidebar();
        if (!next && sidebarHost) unmountSidebar();
      }
      if (SCALE_KEY in changes && sidebarHost) {
        const next = changes[SCALE_KEY].newValue as ScaleStep | undefined;
        if (next === 'sm' || next === 'md' || next === 'lg') {
          currentScale = next;
          renderSidebar();
        }
      }
    });
  } catch { /* ignore */ }
}

function clearElement(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function setSidebarVisible(visible: boolean): void {
  if (!sidebarHost) return;
  sidebarHost.style.display = visible ? '' : 'none';
}

// Keep the sidebar inside the viewport: clamp its height to (viewport - padding)
// minus the saved top, so the footer (Export + Send → MCP) is always visible.
// Called on every render and on window resize.
function applyAutoSize(sidebar: HTMLElement): void {
  const top = parseFloat(sidebar.style.top || '80') || 80;
  const padding = 12;
  const available = Math.max(220, window.innerHeight - top - padding);
  sidebar.style.maxHeight = `${available}px`;
}

let resizeListenerAttached = false;
function attachResizeListener(): void {
  if (resizeListenerAttached) return;
  resizeListenerAttached = true;
  window.addEventListener('resize', () => {
    if (!shadow) return;
    const sidebar = shadow.getElementById('s2l-sidebar') as HTMLElement | null;
    if (sidebar) applyAutoSize(sidebar);
  });
}

function applySavedPosition(sidebar: HTMLElement): void {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left !== 'number' || typeof parsed?.top !== 'number') return;
    const left = Math.max(0, Math.min(window.innerWidth - 80, parsed.left));
    const top = Math.max(0, Math.min(window.innerHeight - 40, parsed.top));
    sidebar.style.left = `${left}px`;
    sidebar.style.top = `${top}px`;
    sidebar.style.right = 'auto';
  } catch { /* ignore */ }
}

function onDragMouseDown(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('button')) return;
  if (!shadow) return;
  // Drag the sidebar OR the recording pill — whichever is currently rendered.
  const sidebar = (shadow.getElementById('s2l-sidebar')
    ?? shadow.getElementById('s2l-rec-pill')) as HTMLElement | null;
  if (!sidebar) return;
  const rect = sidebar.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  sidebar.classList.add('dragging');
  sidebar.style.right = 'auto';
  e.preventDefault();
  const onMove = throttled((ev: MouseEvent): void => {
    const liveRect = sidebar.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - liveRect.width);
    const maxTop = Math.max(0, window.innerHeight - 40);
    sidebar.style.left = `${Math.max(0, Math.min(maxLeft, ev.clientX - offsetX))}px`;
    sidebar.style.top = `${Math.max(0, Math.min(maxTop, ev.clientY - offsetY))}px`;
  }, 16);
  const onUp = (): void => {
    sidebar.classList.remove('dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({
        left: parseFloat(sidebar.style.left), top: parseFloat(sidebar.style.top),
      }));
    } catch { /* ignore */ }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function renderRecordingPill(): void {
  if (!shadow) return;
  clearElement(shadow as unknown as Element);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/sidebar/sidebar.css');
  shadow.appendChild(link);

  const pill = document.createElement('div');
  pill.id = 's2l-rec-pill';
  applySavedPosition(pill);

  const dot = document.createElement('span');
  dot.className = 's2l-rec-pill-dot';
  dot.textContent = '●';

  const timer = document.createElement('span');
  timer.className = 's2l-rec-pill-timer';
  timer.id = 's2l-rec-pill-timer';
  const initialMs = isRecording ? Date.now() - recordingStart : 0;
  timer.textContent = formatRecTime(initialMs);

  const stopBtn = document.createElement('button');
  stopBtn.className = 's2l-rec-pill-stop';
  stopBtn.title = 'Stop recording';
  stopBtn.setAttribute('aria-label', 'Stop recording');
  stopBtn.textContent = '■';
  stopBtn.addEventListener('click', handleStopRecording);

  pill.addEventListener('mousedown', onDragMouseDown);
  pill.appendChild(dot);
  pill.appendChild(timer);
  pill.appendChild(stopBtn);
  shadow.appendChild(pill);
}

function formatRecTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function renderSidebar(): void {
  if (!shadow) return;

  // While recording, swap the sidebar for a tiny floating REC pill so the
  // full UI doesn't sit in the way of whatever the user is recording.
  if (isRecording) {
    renderRecordingPill();
    return;
  }

  clearElement(shadow as unknown as Element);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content/sidebar/sidebar.css');
  shadow.appendChild(link);

  const sidebar = document.createElement('div');
  sidebar.id = 's2l-sidebar';
  sidebar.classList.add(`s2l-scale-${currentScale}`);
  applySavedPosition(sidebar);
  applyAutoSize(sidebar);
  attachResizeListener();

  // ----- Header -----
  const header = document.createElement('div');
  header.className = 's2l-header';
  const title = document.createElement('div');
  title.className = 's2l-title';
  const dot = document.createElement('span');
  dot.className = 's2l-title-dot';
  const titleText = document.createElement('div');
  titleText.className = 's2l-title-text';
  const titleMain = document.createElement('div');
  titleMain.className = 's2l-title-main';
  titleMain.textContent = 'Send2LLM';
  const titleSub = document.createElement('div');
  titleSub.className = 's2l-title-sub';
  titleSub.textContent = 'by Massimo Buonaiuto';
  titleText.appendChild(titleMain);
  titleText.appendChild(titleSub);
  title.appendChild(dot);
  title.appendChild(titleText);
  header.addEventListener('mousedown', onDragMouseDown);

  const headerActions = document.createElement('div');
  headerActions.className = 's2l-header-actions';

  // Shrink: cycle scale one step smaller (md → sm). Disabled at the smallest.
  const shrinkBtn = document.createElement('button');
  shrinkBtn.className = 's2l-btn-icon s2l-btn-scale';
  shrinkBtn.title = 'Smaller';
  shrinkBtn.setAttribute('aria-label', 'Decrease widget size');
  shrinkBtn.textContent = 'a−';
  shrinkBtn.disabled = currentScale === 'sm';
  shrinkBtn.addEventListener('click', () => {
    currentScale = nextScale(currentScale, -1);
    void saveScale();
    renderSidebar();
  });

  // Enlarge: cycle one step larger (md → lg). Disabled at the largest.
  const enlargeBtn = document.createElement('button');
  enlargeBtn.className = 's2l-btn-icon s2l-btn-scale';
  enlargeBtn.title = 'Larger';
  enlargeBtn.setAttribute('aria-label', 'Increase widget size');
  enlargeBtn.textContent = 'A+';
  enlargeBtn.disabled = currentScale === 'lg';
  enlargeBtn.addEventListener('click', () => {
    currentScale = nextScale(currentScale, 1);
    void saveScale();
    renderSidebar();
  });

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 's2l-btn-icon';
  collapseBtn.title = 'Collapse';
  collapseBtn.setAttribute('aria-label', 'Collapse widget');
  collapseBtn.textContent = '−';
  collapseBtn.addEventListener('click', () => {
    shadow!.getElementById('s2l-sidebar')!.classList.toggle('collapsed');
  });
  const closeBtn = document.createElement('button');
  closeBtn.className = 's2l-btn-icon';
  closeBtn.title = 'Close';
  closeBtn.setAttribute('aria-label', 'Close widget');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', unmountSidebar);

  // Order: a−  A+  −  ✕  (the two scale buttons sit left of collapse/close).
  headerActions.appendChild(shrinkBtn);
  headerActions.appendChild(enlargeBtn);
  headerActions.appendChild(collapseBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(headerActions);

  // ----- Type-selector row (TASK / BUG / COMMENT / REQUEST) -----
  const typeRow = document.createElement('div');
  typeRow.className = 's2l-type-row';
  for (const t of ORDER) {
    const tBtn = document.createElement('button');
    tBtn.className = `s2l-type-btn${activeTab === t ? ' selected' : ''}`;
    tBtn.dataset.type = t;
    tBtn.textContent = t.toUpperCase();
    tBtn.addEventListener('click', () => { activeTab = t; renderSidebar(); });
    typeRow.appendChild(tBtn);
  }

  // ----- Inline composer -----
  const composer = document.createElement('div');
  composer.className = 's2l-composer';
  {
    // The captured image is shared across all four type drafts: one pick
    // attaches to whichever tab was active, but the other tabs commit
    // against `lastCapture` so all four annotations get the same picture.
    // Show a single neutral preview in every tab — no "shared" warning.
    const previewCapture = drafts[activeTab].capture ?? lastCapture ?? null;
    if (previewCapture?.elementScreenshotBase64) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 's2l-draft-thumb-wrap';
      const thumb = document.createElement('img');
      thumb.className = 's2l-draft-thumb';
      thumb.src = `data:image/png;base64,${previewCapture.elementScreenshotBase64}`;
      thumb.alt = 'Captured';
      const caption = document.createElement('div');
      caption.className = 's2l-draft-thumb-caption';
      const isRegion = previewCapture.selector.startsWith('region(');
      caption.textContent = isRegion
        ? 'Region captured'
        : `Element: ${previewCapture.selector || '(no selector)'}`;
      const clearCap = document.createElement('button');
      clearCap.className = 's2l-draft-thumb-clear';
      clearCap.title = 'Remove capture (applies to all drafts)';
      clearCap.textContent = '✕';
      clearCap.addEventListener('click', () => {
        // Clear the capture for every draft and the shared fallback so the
        // user gets one consistent state across all four type tabs.
        for (const t of ORDER) drafts[t].capture = undefined;
        lastCapture = null;
        renderSidebar();
      });
      thumbWrap.appendChild(thumb);
      thumbWrap.appendChild(caption);
      thumbWrap.appendChild(clearCap);
      composer.appendChild(thumbWrap);
    }

    const textarea = document.createElement('textarea');
    textarea.className = 's2l-note-input';
    textarea.id = 's2l-draft-note';
    textarea.placeholder = `Describe this ${activeTab}…`;
    textarea.value = drafts[activeTab].note;
    textarea.addEventListener('input', () => { drafts[activeTab].note = textarea.value; });
    textarea.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        drafts[activeTab].note = textarea.value;
        commitDraft();
      }
    });
    composer.appendChild(textarea);

    const composerActions = document.createElement('div');
    composerActions.className = 's2l-composer-actions';
    const clearBtn = document.createElement('button');
    clearBtn.className = 's2l-btn-cancel';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', clearAllDrafts);
    const addBtn = document.createElement('button');
    addBtn.className = 's2l-btn-add';
    addBtn.textContent = 'Add annotations';
    addBtn.addEventListener('click', commitDraft);
    composerActions.appendChild(clearBtn);
    composerActions.appendChild(addBtn);
    composer.appendChild(composerActions);
  }

  // ----- Pick toolbar -----
  const toolbar = document.createElement('div');
  toolbar.className = 's2l-toolbar';
  const pickBtn = document.createElement('button');
  pickBtn.className = `s2l-btn${pickingMode ? ' active' : ''}`;
  pickBtn.textContent = 'Pick Element';
  pickBtn.addEventListener('click', togglePickMode);
  toolbar.appendChild(pickBtn);
  const regionBtn = document.createElement('button');
  regionBtn.className = `s2l-btn${regionPickingMode ? ' active' : ''}`;
  regionBtn.textContent = 'Pick Region';
  regionBtn.addEventListener('click', toggleRegionMode);
  toolbar.appendChild(regionBtn);

  // (Filter tabbar removed; the type selector at the top already conveys
  // which type is being authored. The annotation list shows all types so
  // every captured annotation is visible regardless of which type is active.)

  // ----- Annotation list -----
  const annotationList = document.createElement('div');
  annotationList.className = 's2l-annotations';
  annotationList.id = 's2l-annotation-list';

  // ----- Capture-options row -----
  const captureRow = document.createElement('div');
  captureRow.className = 's2l-capture-row';
  const grabLabel = document.createElement('label');
  grabLabel.className = 's2l-grab-check';
  const grabInput = document.createElement('input');
  grabInput.type = 'checkbox';
  grabInput.checked = grabFullPage;
  grabInput.addEventListener('change', () => {
    grabFullPage = grabInput.checked;
    // Un-checking invalidates the cached stitched capture — next pick should
    // fall back to the viewport path again.
    if (!grabFullPage) fullPageBase64 = '';
  });
  grabLabel.appendChild(grabInput);
  grabLabel.appendChild(document.createTextNode(' Grab full page'));
  captureRow.appendChild(grabLabel);

  // ----- Recorder bar -----
  const recBar = document.createElement('div');
  recBar.id = 's2l-rec-bar';
  recBar.className = 's2l-rec-bar';

  // ----- Recording preview (shows after stop) -----
  const recPreview = document.createElement('div');
  recPreview.className = 's2l-rec-preview';
  recPreview.id = 's2l-rec-preview';

  // ----- Footer -----
  const footer = document.createElement('div');
  footer.className = 's2l-footer';
  const exportWrapper = document.createElement('div');
  exportWrapper.className = 's2l-btn-export';
  const exportToggle = document.createElement('button');
  exportToggle.className = 's2l-btn';
  exportToggle.textContent = 'Export ▾';
  exportToggle.addEventListener('click', () => {
    shadow!.getElementById('s2l-export-menu')!.classList.toggle('open');
  });
  const exportMenu = document.createElement('div');
  exportMenu.className = 's2l-export-menu';
  exportMenu.id = 's2l-export-menu';
  for (const opt of [
    { action: 'copy-md', label: 'Copy Markdown' },
    { action: 'download-zip', label: 'Download ZIP' },
    { action: 'download-json', label: 'Download JSON' },
  ]) {
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
  mcpBtn.textContent = 'Send → MCP';
  mcpBtn.addEventListener('click', handleSendToMcp);
  footer.appendChild(exportWrapper);
  footer.appendChild(mcpBtn);

  // Assemble. Composer at top (under header) — matches the reference UX.
  sidebar.appendChild(header);
  sidebar.appendChild(typeRow);
  sidebar.appendChild(composer);
  sidebar.appendChild(toolbar);
  sidebar.appendChild(annotationList);
  sidebar.appendChild(recPreview);
  sidebar.appendChild(recBar);
  sidebar.appendChild(captureRow);
  sidebar.appendChild(footer);
  shadow.appendChild(sidebar);

  renderAnnotationList(annotations, deleteAnnotation, shadow);
  renderRecorderBar(shadow, isRecording, isRecording ? Date.now() - recordingStart : 0,
    selectedSources, handleStartRecording, handleStopRecording);
  renderRecordingPreview();

  // Restore focus to the textarea after re-render so typing isn't interrupted.
  const ta = shadow.getElementById('s2l-draft-note') as HTMLTextAreaElement | null;
  if (ta) {
    ta.focus();
    const len = ta.value.length;
    try { ta.setSelectionRange(len, len); } catch { /* ignore */ }
  }
}

function renderRecordingPreview(): void {
  if (!shadow) return;
  const container = shadow.getElementById('s2l-rec-preview');
  if (!container) return;
  clearElement(container);
  if (!pendingRecording) return;
  const seconds = Math.floor(pendingRecording.durationMs / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const headerRow = document.createElement('div');
  headerRow.className = 's2l-rec-preview-header';
  const titleEl = document.createElement('span');
  titleEl.className = 's2l-rec-preview-title';
  titleEl.textContent = `#1 Video + audio — ${mm}:${ss}`;
  const removeBtn = document.createElement('button');
  removeBtn.className = 's2l-rec-preview-remove';
  removeBtn.title = 'Remove recording';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    pendingRecording = null;
    void clearPendingRecordingStorage();
    renderSidebar();
  });
  headerRow.appendChild(titleEl);
  headerRow.appendChild(removeBtn);

  const video = document.createElement('video');
  video.className = 's2l-rec-preview-video';
  video.controls = true;
  video.src = `data:video/webm;base64,${pendingRecording.base64}`;
  video.title = 'Double-click to open in default video player';
  // Double-click opens the webm in the OS default video player. The user's
  // OS still owns the file association — Send2LLM only writes the file and
  // asks the browser to hand it off via chrome.downloads.open().
  video.addEventListener('dblclick', () => {
    if (!pendingRecording) return;
    chrome.runtime.sendMessage({
      type: 'OPEN_IN_DEFAULT_APP',
      base64: pendingRecording.base64,
      mimeType: 'video/webm',
      filename: `Send2LLM/recording-${Date.now()}.webm`,
    });
  });
  container.appendChild(headerRow);
  container.appendChild(video);
}

function togglePickMode(): void {
  pickingMode = !pickingMode;
  if (pickingMode) {
    setSidebarVisible(false);
    startPicker(async (el) => {
      pickingMode = false;
      const info = getElementInfo(el);
      // Pad element picks so the screenshot includes a sliver of surrounding
      // background — picking text-only or transparent elements would
      // otherwise crop to a black or white rectangle.
      const elementScreenshotBase64 = await cropBoundingBox(info.boundingBox, 8);
      const cap: PickedCapture = {
        selector: info.selector, xpath: info.xpath, elementHTML: info.elementHTML,
        boundingBox: info.boundingBox, elementScreenshotBase64,
      };
      drafts[activeTab].capture = cap;
      lastCapture = cap;
      setSidebarVisible(true);
      renderSidebar();
    }, () => {
      pickingMode = false;
      setSidebarVisible(true);
      renderSidebar();
    });
  } else {
    stopPicker();
    setSidebarVisible(true);
  }
  renderSidebar();
}

function toggleRegionMode(): void {
  if (regionPickingMode) {
    stopRegionPicker();
    regionPickingMode = false;
    setSidebarVisible(true);
    renderSidebar();
    return;
  }
  regionPickingMode = true;
  renderSidebar();
  setSidebarVisible(false);
  startRegionPicker(async (box: BoundingBox) => {
    regionPickingMode = false;
    const elementScreenshotBase64 = await cropBoundingBox(box);
    const cap: PickedCapture = {
      selector: `region(${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}x${Math.round(box.height)})`,
      elementHTML: '', boundingBox: box, elementScreenshotBase64,
    };
    drafts[activeTab].capture = cap;
    lastCapture = cap;
    setSidebarVisible(true);
    renderSidebar();
  }, () => {
    regionPickingMode = false;
    setSidebarVisible(true);
    renderSidebar();
  });
}

// Crop the picked element/region using a single-frame viewport capture only.
// We never trigger the slow scroll-and-stitch full-page capture during pick —
// that runs once at Send → MCP time if the user opted in to "Grab full page".
//
// `expand` adds CSS-pixel padding around the box before cropping so the
// element's surrounding background colour and a few pixels of context are
// included. Without it, picking an element that is just a glyph or a
// transparent button reads as a black/white square in the screenshot.
// Region picks pass expand=0 because the user already drew the area.
async function cropBoundingBox(box: BoundingBox, expand = 0): Promise<string> {
  const viewportRes = await chrome.runtime.sendMessage({ type: 'CAPTURE_VIEWPORT' });
  const viewportBase64 = viewportRes?.base64 ?? '';
  if (!viewportBase64) return '';
  // Scale the padding for very small or very large elements: at most 12px,
  // at least 4px, otherwise 8% of the smaller dimension. The offscreen
  // canvas clamps the crop to the image bounds so over-shooting the
  // viewport edge is safe — it just produces a tighter crop.
  let pad = 0;
  if (expand > 0) {
    const minDim = Math.min(box.width, box.height);
    pad = Math.max(4, Math.min(12, Math.round(minDim * 0.08)));
  }
  const viewportBox: BoundingBox = {
    x: box.x - window.scrollX - pad,
    y: box.y - window.scrollY - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
  // Pass devicePixelRatio so the offscreen crop maps CSS-pixel coordinates to
  // the actual device-pixel image returned by chrome.tabs.captureVisibleTab.
  // On retina (dpr=2) the viewport screenshot is 2x the page CSS dimensions;
  // without this scale the crop reads from the wrong region (top-left of
  // image) and returns blank pixels.
  const cropRes = await chrome.runtime.sendMessage({
    type: 'CROP_ELEMENT',
    fullPageBase64: viewportBase64,
    boundingBox: viewportBox,
    dpr: window.devicePixelRatio || 1,
  });
  return cropRes?.base64 ?? '';
}

function commitDraft(): void {
  // Commit ALL four per-type drafts that have content. Each draft uses its own
  // capture if present, otherwise the most recent shared one. This lets the
  // user fill task + bug + comment + request and commit in one click.
  let added = 0;
  for (const type of ORDER) {
    const draft = drafts[type];
    const note = draft.note.trim();
    if (!note && !draft.capture) continue;
    const cap = draft.capture ?? lastCapture ?? {
      selector: '', elementHTML: '', boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      elementScreenshotBase64: '',
    };
    const ann: Annotation = {
      id: generateId(),
      number: annotations.length + 1,
      type,
      note,
      selector: cap.selector,
      xpath: cap.xpath,
      elementHTML: cap.elementHTML,
      boundingBox: cap.boundingBox,
      elementScreenshotBase64: cap.elementScreenshotBase64,
      elementScreenshotPath: '',
      createdAt: new Date().toISOString(),
    };
    annotations.push(ann);
    added++;
  }
  if (added === 0) return;
  for (const type of ORDER) drafts[type] = { note: '' };
  lastCapture = null;
  renderSidebar();
}

function clearAllDrafts(): void {
  for (const type of ORDER) drafts[type] = { note: '' };
  lastCapture = null;
  renderSidebar();
}

function deleteAnnotation(id: string): void {
  annotations = annotations.filter((a) => a.id !== id);
  annotations.forEach((a, i) => { a.number = i + 1; });
  renderSidebar();
}

async function buildSession(): Promise<Session> {
  if (grabFullPage && !fullPageBase64) {
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_FULL_PAGE' });
    fullPageBase64 = res?.base64 ?? '';
  }
  return {
    id: generateId(),
    url: window.location.href,
    pageTitle: document.title,
    capturedAt: new Date().toISOString(),
    fullPageScreenshotBase64: grabFullPage ? fullPageBase64 : '',
    fullPageScreenshotPath: '',
    annotations: [...annotations],
    consoleLogs: getConsoleLogs(),
    sessionStorage: snapshotSessionStorage(),
    recordings: pendingRecording ? [{
      id: generateId(),
      filename: 'recording-1.webm',
      path: '',
      sources: pendingRecording.sources,
      durationMs: pendingRecording.durationMs,
      base64: pendingRecording.base64,
    }] : [],
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
  if (res?.error) {
    alert(`Send2LLM: MCP error — ${res.error}`);
    return;
  }
  alert('Send2LLM: Session sent to MCP server.');
  // The recording is now persisted on the MCP server; clear our local copy
  // so the next session starts fresh and the cross-page storage entry is
  // not picked up again on the next page load. Also reset the per-type
  // drafts and the annotation list — the user just shipped them, so the
  // sidebar should not surprise them by hanging on to stale state.
  pendingRecording = null;
  annotations = [];
  for (const t of ORDER) drafts[t] = { note: '' };
  lastCapture = null;
  await clearPendingRecordingStorage();
  // Dismiss the widget after the user acknowledges the success alert.
  // mountSidebar() / the toolbar icon click brings it back. The persisted
  // "enabled" flag is also cleared so navigating to a new tab won't auto-
  // mount it until the user explicitly opens it again.
  unmountSidebar();
  void setEnabledFlag(false);
}

async function handleStartRecording(sources: RecordingSource[]): Promise<void> {
  selectedSources = new Set(sources);
  // Show the per-browser intro modal first time around so the user knows
  // what to click in the OS share-picker. Dismissed-state is sticky in
  // localStorage; the user can re-enable it from the welcome dialog.
  if (shouldShowRecordIntro()) {
    const ok = await showRecordIntro();
    if (!ok) return;
  }
  try {
    await startRecording(sources);
  } catch (err) {
    alert(`Recording error: ${(err as Error).message}`);
    return;
  }
  isRecording = true;
  recordingStart = Date.now();
  // Tick the pill's timer text in place (no re-render → drag stays smooth).
  recordingInterval = setInterval(() => {
    if (!shadow) return;
    const t = shadow.getElementById('s2l-rec-pill-timer');
    if (t) t.textContent = formatRecTime(Date.now() - recordingStart);
  }, 1000);
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
