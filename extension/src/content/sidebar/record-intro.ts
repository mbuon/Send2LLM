const STORAGE_KEY = 's2l-record-intro-dismissed';

export function shouldShowRecordIntro(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

type Browser = 'chrome' | 'edge' | 'opera' | 'firefox' | 'other';

// Best-effort UA sniff. The extension itself is built per-target, but the
// intro copy needs to match whatever Chromium variant happens to be hosting
// the same dist (e.g. a Chrome-built dist running in Edge).
function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  return 'other';
}

interface IntroCopy {
  picker: string;        // What dialog appears, where
  pickerHint: string;    // What to choose in the dialog
  audioCheckbox: string; // The audio toggle's exact wording
  audioFooter: string;   // Caveat about which sources carry audio
}

function copyFor(browser: Browser): IntroCopy {
  switch (browser) {
    case 'edge':
      return {
        picker: 'Edge will open a "Choose what to share" dialog.',
        pickerHint: 'Pick the "Tab" tab and select this page (Window or Entire Screen do not carry audio).',
        audioCheckbox: 'Tick "Share tab audio" at the bottom-left of the dialog.',
        audioFooter: 'Edge: only Tab shares can carry audio. Window and Entire-Screen shares are silent.',
      };
    case 'opera':
      return {
        picker: 'Opera will open a "Choose what to share" dialog.',
        pickerHint: 'Pick "Chrome Tab" (Opera reuses Chromium\'s picker) and select this page.',
        audioCheckbox: 'Tick "Also share tab audio" before clicking Share.',
        audioFooter: 'Opera: only Tab shares can carry audio. Window and Entire-Screen shares are silent.',
      };
    case 'firefox':
      return {
        picker: 'Firefox will show a permission prompt at the top of the page.',
        pickerHint: 'Pick a window or screen from the dropdown, then click Allow.',
        audioCheckbox: 'For audio, accept the separate microphone prompt - Firefox does not support tab-audio sharing.',
        audioFooter: 'Firefox limitation: only microphone audio is recorded. Tab-audio mixing requires a Chromium-based browser.',
      };
    case 'chrome':
    case 'other':
    default:
      return {
        picker: 'Chrome will open a "Choose what to share" dialog.',
        pickerHint: 'Pick the "Chrome Tab" tab at the top and select this page (Window or Entire Screen do not carry audio).',
        audioCheckbox: 'Tick "Also share tab audio" at the bottom-left of the dialog.',
        audioFooter: 'Chrome: only Tab shares can carry audio. Window and Entire-Screen shares are silent.',
      };
  }
}

function makeStep(textNodes: (string | HTMLElement)[]): HTMLLIElement {
  const li = document.createElement('li');
  for (const n of textNodes) {
    li.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
  }
  return li;
}

function bold(text: string): HTMLElement {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}

// Render a modal with recording instructions. Resolves `true` when the user
// confirms (start recording), `false` when they cancel. When the "Don't show
// again" checkbox is ticked on confirm, the dismissal is persisted.
export function showRecordIntro(): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = 's2l-record-intro-host';
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
    } as CSSStyleDeclaration);
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .backdrop {
        position: fixed; inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        animation: fade-in 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
        color-scheme: light;
      }
      @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes modal-in {
        from { opacity: 0; transform: translateY(8px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .modal {
        background: #ffffff;
        color: #1d1d1f;
        border-radius: 18px;
        box-shadow:
          0 1px 0 rgba(255,255,255,0.6) inset,
          0 30px 80px -10px rgba(0, 0, 0, 0.35),
          0 10px 30px -8px rgba(0, 0, 0, 0.2);
        width: min(460px, calc(100vw - 32px));
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        padding: 22px 24px 20px;
        animation: modal-in 0.22s cubic-bezier(0.32, 0.72, 0, 1);
      }
      .title {
        display: flex; align-items: center; gap: 10px;
        font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
        margin: 0 0 14px;
      }
      .title-dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: linear-gradient(135deg, #ff6b6b, #f97316);
        box-shadow: 0 0 0 3px rgba(249,115,22,0.18);
      }
      .lead { font-size: 13px; line-height: 1.5; color: #3c3c43; margin: 0 0 14px; }
      ol.steps { margin: 0 0 16px; padding: 0; list-style: none; counter-reset: s2l-step; }
      ol.steps li {
        position: relative;
        padding: 8px 10px 8px 40px;
        font-size: 13px; line-height: 1.45;
        color: #1d1d1f;
        counter-increment: s2l-step;
        border-radius: 10px;
      }
      ol.steps li + li { margin-top: 2px; }
      ol.steps li::before {
        content: counter(s2l-step);
        position: absolute; left: 10px; top: 8px;
        width: 22px; height: 22px;
        border-radius: 50%;
        background: linear-gradient(180deg, #ff8a3d, #f97316);
        color: #fff;
        font-size: 11px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
      }
      ol.steps b { font-weight: 600; color: #000; }
      .tip {
        background: rgba(0,122,255,0.08);
        border-left: 3px solid #0071e3;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 12px; line-height: 1.5;
        color: #1d1d1f;
        margin: 0 0 16px;
      }
      .footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .dont-show { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #6e6e73; cursor: pointer; user-select: none; }
      .dont-show input { accent-color: #f97316; margin: 0; }
      .actions { display: flex; gap: 8px; }
      .btn {
        font-family: inherit;
        padding: 8px 16px; border-radius: 999px;
        font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
        cursor: pointer; border: none;
        transition: transform 0.1s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      .btn-cancel { background: rgba(0,0,0,0.06); color: #1d1d1f; }
      .btn-cancel:hover { background: rgba(0,0,0,0.1); }
      .btn-go { background: linear-gradient(180deg, #1d1d1f, #000); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
      .btn-go:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.28); }
      .btn:active { transform: scale(0.97); }
    `;
    shadow.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';

    // --- Title ---
    const title = document.createElement('h2');
    title.className = 'title';
    const dot = document.createElement('span');
    dot.className = 'title-dot';
    title.appendChild(dot);
    title.appendChild(document.createTextNode('Before you record'));

    // --- Browser-specific copy ---
    const browser = detectBrowser();
    const copy = copyFor(browser);
    const browserName = ({ chrome: 'Chrome', edge: 'Edge', opera: 'Opera', firefox: 'Firefox', other: 'your browser' } as const)[browser];

    const lead = document.createElement('p');
    lead.className = 'lead';
    lead.textContent = `Send2LLM can capture screen + microphone + tab audio. ${browserName} asks a couple of questions — getting them right is the only way audio ends up in the file.`;

    // --- Steps ---
    const steps = document.createElement('ol');
    steps.className = 'steps';
    steps.appendChild(makeStep([copy.picker]));
    steps.appendChild(makeStep([copy.pickerHint]));
    steps.appendChild(makeStep([copy.audioCheckbox]));
    steps.appendChild(makeStep([
      'If this is your first time, allow ', bold('microphone'), ' access when prompted.',
    ]));
    steps.appendChild(makeStep([
      'Click ', bold('Stop'), ' in the floating REC pill when you are done. The recording appears inline and you can play it back.',
    ]));

    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.textContent = copy.audioFooter;

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'footer';

    const dontShowLabel = document.createElement('label');
    dontShowLabel.className = 'dont-show';
    const dontShowInput = document.createElement('input');
    dontShowInput.type = 'checkbox';
    dontShowInput.id = 's2l-dont-show';
    dontShowLabel.appendChild(dontShowInput);
    dontShowLabel.appendChild(document.createTextNode(' Do not show this again'));

    const actions = document.createElement('div');
    actions.className = 'actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-cancel';
    cancelBtn.textContent = 'Cancel';

    const goBtn = document.createElement('button');
    goBtn.className = 'btn btn-go';
    goBtn.textContent = 'Start recording';

    actions.appendChild(cancelBtn);
    actions.appendChild(goBtn);
    footer.appendChild(dontShowLabel);
    footer.appendChild(actions);

    modal.appendChild(title);
    modal.appendChild(lead);
    modal.appendChild(steps);
    modal.appendChild(tip);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    shadow.appendChild(backdrop);
    document.body.appendChild(host);
    goBtn.focus();

    const cleanup = (): void => {
      document.removeEventListener('keydown', onKey, true);
      host.remove();
    };
    const finish = (confirmed: boolean): void => {
      if (confirmed && dontShowInput.checked) {
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
      }
      cleanup();
      resolve(confirmed);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    };
    document.addEventListener('keydown', onKey, true);

    cancelBtn.addEventListener('click', () => finish(false));
    goBtn.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
  });
}
