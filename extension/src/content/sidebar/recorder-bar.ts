type RecordingSource = 'screen' | 'microphone' | 'tab-audio';

function clearElement(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function renderRecorderBar(
  root: ShadowRoot,
  isRecording: boolean,
  elapsedMs: number,
  selectedSources: Set<RecordingSource>,
  onStart: (sources: RecordingSource[]) => void,
  onStop: () => void,
): void {
  const bar = root.getElementById('s2l-rec-bar')!;
  clearElement(bar);
  bar.classList.toggle('recording', isRecording);

  if (!isRecording) {
    // Idle: pill-style source toggles + a single Record button. The button's
    // red dot comes from CSS ::before so the button reads cleanly without an
    // emoji glyph that varies between platforms.
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 's2l-rec-sources';

    for (const s of ['screen', 'microphone', 'tab-audio'] as RecordingSource[]) {
      const label = document.createElement('label');
      label.className = 's2l-source-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.source = s;
      if (selectedSources.has(s)) checkbox.checked = true;
      const text = document.createElement('span');
      text.textContent = s;
      label.appendChild(checkbox);
      label.appendChild(text);
      sourcesDiv.appendChild(label);
    }

    const recordBtn = document.createElement('button');
    recordBtn.className = 's2l-btn-record';
    recordBtn.title = 'Start recording';
    recordBtn.textContent = 'Record';
    recordBtn.addEventListener('click', () => {
      const sources = Array.from(bar.querySelectorAll<HTMLInputElement>('input[data-source]:checked'))
        .map((i) => i.dataset.source as RecordingSource);
      onStart(sources.length ? sources : ['screen']);
    });

    bar.appendChild(sourcesDiv);
    bar.appendChild(recordBtn);
    return;
  }

  // Active recording: pulsing dot + monospace timer + Stop button. The square
  // stop glyph also comes from CSS ::before for a consistent look.
  const seconds = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const dot = document.createElement('span');
  dot.className = 's2l-rec-dot';
  dot.textContent = '●';

  const timer = document.createElement('span');
  timer.className = 's2l-rec-timer';
  timer.textContent = `REC ${mm}:${ss}`;

  const stopBtn = document.createElement('button');
  stopBtn.className = 's2l-rec-stop';
  stopBtn.title = 'Stop recording';
  stopBtn.textContent = 'Stop';
  stopBtn.addEventListener('click', onStop);

  bar.appendChild(dot);
  bar.appendChild(timer);
  bar.appendChild(stopBtn);
}
