const STORAGE_KEY = 's2l-record-intro-dismissed';

export function shouldShowRecordIntro(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
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
        width: min(440px, calc(100vw - 32px));
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

    const lead = document.createElement('p');
    lead.className = 'lead';
    lead.textContent = 'Send2LLM can capture screen + microphone + tab audio. Chrome asks a couple of questions — getting them right is the only way audio ends up in the file.';

    // --- Steps ---
    const steps = document.createElement('ol');
    steps.className = 'steps';
    steps.appendChild(makeStep([
      'Chrome will show a ', bold('share picker'), '. Choose ', bold('Chrome Tab'),
      ' (not Window or Entire Screen) if you want tab audio.',
    ]));
    steps.appendChild(makeStep([
      'In that same dialog, tick ', bold('"Also share tab audio"'),
      '. Windows and full-screen shares can\u2019t carry audio.',
    ]));
    steps.appendChild(makeStep([
      'If this is your first time, allow ', bold('microphone'), ' access when prompted.',
    ]));
    steps.appendChild(makeStep([
      'Click ', bold('Stop'), ' in the widget when you\u2019re done. The recording appears inline and you can play it back.',
    ]));

    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.textContent = 'Tip: "Screen" in the checkboxes means the shared picture. "Tab-audio" is the selected tab\u2019s sound. "Microphone" is your voice.';

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'footer';

    const dontShowLabel = document.createElement('label');
    dontShowLabel.className = 'dont-show';
    const dontShowInput = document.createElement('input');
    dontShowInput.type = 'checkbox';
    dontShowInput.id = 's2l-dont-show';
    dontShowLabel.appendChild(dontShowInput);
    dontShowLabel.appendChild(document.createTextNode(' Don\u2019t show this again'));

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
