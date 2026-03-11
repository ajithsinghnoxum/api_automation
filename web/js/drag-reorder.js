// --- Drag & Drop Test Reordering ---

let dragState = null;

function onTestDragStart(e) {
  const el = e.target.closest('.test-item');
  if (!el) return;
  dragState = {
    suiteIdx: parseInt(el.dataset.suiteIdx),
    testIdx: parseInt(el.dataset.testIdx),
  };
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ''); // Required for Firefox
}

function onTestDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const el = e.target.closest('.test-item');
  if (!el || !dragState) return;

  const targetSuite = parseInt(el.dataset.suiteIdx);
  const targetTest = parseInt(el.dataset.testIdx);

  // Only allow reordering within the same suite
  if (targetSuite !== dragState.suiteIdx) return;

  // Add visual indicator
  document.querySelectorAll('.test-item.drag-over').forEach(item => item.classList.remove('drag-over'));
  el.classList.add('drag-over');
}

function onTestDrop(e) {
  e.preventDefault();
  const el = e.target.closest('.test-item');
  if (!el || !dragState) return;

  const targetSuite = parseInt(el.dataset.suiteIdx);
  const targetTest = parseInt(el.dataset.testIdx);

  // Only reorder within the same suite
  if (targetSuite !== dragState.suiteIdx) return;
  if (targetTest === dragState.testIdx) return;

  reorderTest(dragState.suiteIdx, dragState.testIdx, targetTest);
}

function onTestDragEnd(e) {
  dragState = null;
  document.querySelectorAll('.test-item.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.test-item.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// --- Drag & Drop Validation Reordering ---

let valDragState = null;

function onValDragStart(e) {
  const el = e.target.closest('.validation-row');
  if (!el) return;
  const container = el.parentElement;
  const rows = Array.from(container.querySelectorAll(':scope > .validation-row'));
  valDragState = { container, fromIdx: rows.indexOf(el) };
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', '');
}

function onValDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const el = e.target.closest('.validation-row');
  if (!el || !valDragState || el.parentElement !== valDragState.container) return;
  valDragState.container.querySelectorAll(':scope > .validation-row.drag-over').forEach(r => r.classList.remove('drag-over'));
  el.classList.add('drag-over');
}

function onValDrop(e) {
  e.preventDefault();
  const el = e.target.closest('.validation-row');
  if (!el || !valDragState || el.parentElement !== valDragState.container) return;
  const rows = Array.from(valDragState.container.querySelectorAll(':scope > .validation-row'));
  const toIdx = rows.indexOf(el);
  if (toIdx === valDragState.fromIdx) return;
  const dragged = rows[valDragState.fromIdx];
  if (toIdx > valDragState.fromIdx) {
    el.after(dragged);
  } else {
    el.before(dragged);
  }
}

function onValDragEnd() {
  valDragState = null;
  document.querySelectorAll('.validation-row.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.validation-row.drag-over').forEach(el => el.classList.remove('drag-over'));
}

async function reorderTest(suiteIdx, fromIdx, toIdx) {
  try {
    const suite = currentSuites[suiteIdx];
    const { fileName, ...suiteData } = suite;
    const tests = [...suiteData.tests];

    // Move the test from fromIdx to toIdx
    const [moved] = tests.splice(fromIdx, 1);
    tests.splice(toIdx, 0, moved);
    suiteData.tests = tests;

    await api('PUT', `/api/projects/${currentProject.id}/suites/${fileName}`, suiteData);
    await loadSuites();
    renderProjectView();
  } catch { /* error already toasted by api() */ }
}
