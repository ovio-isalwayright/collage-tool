// Studio controls only change how the editor displays the existing canvas.
(() => {
  const get = id => document.getElementById(id);
  function segment(select, container, labels) {
    const buttons = Array.from(select.options, option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labels?.[option.value] || option.text;
      button.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      container.append(button);
      return button;
    });
    function sync() {
      buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === select.selectedIndex)));
    }
    select.addEventListener('change', sync);
    sync();
  }
  segment(get('platform'), get('platformTabs'));
  segment(get('layout'), get('layoutTabs'), { full: '完整界面', messages: '纯聊天框' });

  const preview = get('preview');
  const viewport = document.querySelector('.viewport');
  let zoom = null;
  let currentScale = 1;
  function updatePreview() {
    get('dimensions').textContent = preview.width + ' × ' + preview.height;
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    // A long conversation stays legible at fit width and scrolls vertically.
    const fitWidth = Math.min(390, Math.max(1, viewport.clientWidth - 24));
    const fitHeight = Math.max(1, viewport.clientHeight - 62);
    const fit = Math.min(fitWidth, Math.max(Math.min(205, fitWidth), fitHeight * preview.width / preview.height));
    currentScale = zoom ?? fit / 390;
    preview.style.setProperty('--preview-width', (390 * currentScale) + 'px');
    get('scale').textContent = Math.round(currentScale * 100) + '%';
    get('smaller').disabled = currentScale <= 0.25;
    get('larger').disabled = currentScale >= 2;
  }
  function step(delta) {
    zoom = Math.max(0.25, Math.min(2, Math.round((currentScale + delta) * 10) / 10));
    updatePreview();
  }
  get('smaller').onclick = () => step(-0.1);
  get('larger').onclick = () => step(0.1);
  get('fit').onclick = () => { zoom = null; updatePreview(); };
  new ResizeObserver(updatePreview).observe(viewport);
  new MutationObserver(updatePreview).observe(preview, { attributes: true, attributeFilter: ['width', 'height'] });
  updatePreview();

  get('collapse').onclick = () => {
    const folded = document.body.classList.toggle('folded');
    const button = get('collapse');
    button.textContent = folded ? '‹' : '›';
    button.title = folded ? '展开对话栏' : '收起对话栏';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!folded));
  };
  const views = document.querySelectorAll('.mobile button');
  function showView(view) {
    document.body.dataset.view = view;
    views.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    updatePreview();
  }
  views.forEach(button => button.onclick = () => showView(button.dataset.view));
  showView(document.body.dataset.view);
})();
