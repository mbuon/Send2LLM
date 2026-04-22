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

  if (!isRecording) {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 's2l-rec-sources';

    for (const s of ['screen', 'microphone', 'tab-audio'] as RecordingSource[]) {
      const label = document.createElement('label');
      label.className = 's2l-source-check';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.source = s;
      if (selectedSources.has(s)) checkbox.checked = true;

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` ${s}`));
      sourcesDiv.appendChild(label);
    }

    const recordBtn = document.createElement('button');
    recordBtn.className = 's2l-btn s2l-btn-record';
    recordBtn.textContent = '\u23FA Record';
    recordBtn.addEventListener('click', () => {
      const sources = Array.from(bar.querySelectorAll<HTMLInputElement>('input[data-source]:checked'))
        .map((i) => i.dataset.source as RecordingSource);
      onStart(sources.length ? sources : ['screen']);
    });

    bar.appendChild(sourcesDiv);
    bar.appendChild(recordBtn);
  } else {
    const seconds = Math.floor(elapsedMs / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');

    const dot = document.createElement('span');
    dot.className = 's2l-rec-dot';
    dot.textContent = '\u25CF';

    const timer = document.createElement('span');
    timer.className = 's2l-rec-timer';
    timer.textContent = `REC ${mm}:${ss}`;

    const stopBtn = document.createElement('button');
    stopBtn.className = 's2l-rec-stop';
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', onStop);

    bar.appendChild(dot);
    bar.appendChild(timer);
    bar.appendChild(stopBtn);
  }
}
