// --- Achievement / Badge System ---

const ACHIEVEMENTS = [
  { id: 'first_blood',   name: 'First Blood',      icon: 'military_tech',         description: 'Run your first test' },
  { id: 'perfect_run',   name: 'Flawless',          icon: 'stars',                 description: 'Get 100% pass rate on a run' },
  { id: 'century',        name: 'Centurion',         icon: 'counter_1',             description: 'Create 100 tests across all projects' },
  { id: 'chain_master',   name: 'Chain Master',      icon: 'link',                  description: 'Use variable chaining (extract + {{var}})' },
  { id: 'speed_demon',    name: 'Speed Demon',       icon: 'bolt',                  description: 'Complete a test in under 100ms' },
  { id: 'night_owl',      name: 'Night Owl',         icon: 'dark_mode',             description: 'Schedule a midnight run' },
  { id: 'globe_trotter',  name: 'Globe Trotter',     icon: 'public',                description: 'Test 3+ different API base URLs' },
  { id: 'validator',      name: 'Validation King',   icon: 'verified',              description: 'Use 10+ different validation types' },
  { id: 'streak_3',       name: 'Hat Trick',         icon: 'local_fire_department', description: '3 consecutive passing runs' },
  { id: 'streak_7',       name: 'On Fire',           icon: 'whatshot',              description: '7 consecutive passing runs' },
  { id: 'bulk_master',    name: 'Bulk Master',       icon: 'select_all',            description: 'Use a bulk operation' },
  { id: 'import_pro',     name: 'Import Pro',        icon: 'upload_file',           description: 'Import a Postman or OpenAPI collection' },
  { id: 'explorer',       name: 'Explorer',          icon: 'explore',               description: 'Use the Response Explorer on a response' },
  { id: 'dark_side',      name: 'Dark Side',         icon: 'nightlight',            description: 'Switch to dark theme' },
  { id: 'five_suites',    name: 'Suite Life',        icon: 'folder_special',        description: 'Create 5 test suites in one project' },
];

const ACHIEVEMENTS_STORAGE_KEY = 'api_auto_achievements';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function getUnlockedAchievements() {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function _saveUnlocked(ids) {
  localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(ids));
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/** Returns true if the achievement with the given id is already unlocked. */
function checkAchievement(id) {
  return getUnlockedAchievements().includes(id);
}

/**
 * Unlock an achievement by id.
 * Shows a special toast notification when newly unlocked.
 * Returns true if it was newly unlocked, false if already unlocked or unknown.
 */
function unlockAchievement(id) {
  const badge = ACHIEVEMENTS.find(a => a.id === id);
  if (!badge) return false;

  const unlocked = getUnlockedAchievements();
  if (unlocked.includes(id)) return false;

  unlocked.push(id);
  _saveUnlocked(unlocked);

  _showAchievementToast(badge);
  return true;
}

/** Returns { unlocked: number, total: number }. */
function getAchievementProgress() {
  return { unlocked: getUnlockedAchievements().length, total: ACHIEVEMENTS.length };
}

// ---------------------------------------------------------------------------
// Achievement toast (gold / amber with bounce animation)
// ---------------------------------------------------------------------------

function _showAchievementToast(badge) {
  // Inject keyframes once
  if (!document.getElementById('achievement-toast-style')) {
    const style = document.createElement('style');
    style.id = 'achievement-toast-style';
    style.textContent = `
      @keyframes ach-bounce-in {
        0%   { transform: translateX(-50%) scale(0.4); opacity: 0; }
        50%  { transform: translateX(-50%) scale(1.08); opacity: 1; }
        70%  { transform: translateX(-50%) scale(0.95); }
        100% { transform: translateX(-50%) scale(1); }
      }
      @keyframes ach-fade-out {
        0%   { opacity: 1; transform: translateX(-50%) scale(1); }
        100% { opacity: 0; transform: translateX(-50%) scale(0.9); }
      }
      .achievement-toast {
        position: fixed;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100000;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 24px;
        border-radius: 12px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #fff;
        font-family: inherit;
        font-size: 14px;
        box-shadow: 0 6px 24px rgba(217, 119, 6, 0.45), 0 0 0 2px rgba(255, 255, 255, 0.15) inset;
        animation: ach-bounce-in 0.5s ease-out forwards;
        pointer-events: none;
        user-select: none;
      }
      .achievement-toast.fade-out {
        animation: ach-fade-out 0.35s ease-in forwards;
      }
      .achievement-toast .ach-icon {
        font-size: 28px;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
      }
      .achievement-toast .ach-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .achievement-toast .ach-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1px;
        opacity: 0.85;
      }
      .achievement-toast .ach-name {
        font-weight: 700;
        font-size: 15px;
      }
    `;
    document.head.appendChild(style);
  }

  const el = document.createElement('div');
  el.className = 'achievement-toast';
  el.innerHTML =
    `<span class="material-symbols-rounded ach-icon">${esc(badge.icon)}</span>` +
    `<span class="ach-text">` +
      `<span class="ach-label">Achievement Unlocked</span>` +
      `<span class="ach-name">${esc(badge.name)}</span>` +
    `</span>`;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 400);
  }, 3500);
}

// ---------------------------------------------------------------------------
// Achievements panel / modal
// ---------------------------------------------------------------------------

function _ensureAchievementsPanelStyle() {
  if (document.getElementById('achievements-panel-style')) return;
  const style = document.createElement('style');
  style.id = 'achievements-panel-style';
  style.textContent = `
    .ach-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 90000;
      display: flex; align-items: center; justify-content: center;
      animation: ach-overlay-in 0.2s ease-out;
    }
    @keyframes ach-overlay-in { from { opacity: 0; } to { opacity: 1; } }
    .ach-modal {
      background: var(--bg-main, #fff);
      color: var(--text-main, #1e293b);
      border-radius: 16px;
      width: 620px;
      max-width: 94vw;
      max-height: 85vh;
      overflow-y: auto;
      padding: 28px 32px 24px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.25);
      position: relative;
    }
    .ach-modal h2 {
      margin: 0 0 4px;
      font-size: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ach-modal .ach-progress-wrap {
      margin: 10px 0 20px;
    }
    .ach-modal .ach-progress-bar {
      height: 8px;
      border-radius: 4px;
      background: var(--border-color, #e2e8f0);
      overflow: hidden;
    }
    .ach-modal .ach-progress-fill {
      height: 100%;
      border-radius: 4px;
      background: linear-gradient(90deg, #f59e0b, #d97706);
      transition: width 0.4s ease;
    }
    .ach-modal .ach-progress-text {
      font-size: 12px;
      margin-top: 4px;
      opacity: 0.65;
    }
    .ach-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 14px;
    }
    .ach-card {
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: 12px;
      padding: 16px 12px;
      text-align: center;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .ach-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .ach-card.locked {
      opacity: 0.45;
      filter: grayscale(1);
    }
    .ach-card .ach-card-icon {
      font-size: 36px;
      display: block;
      margin-bottom: 6px;
    }
    .ach-card.unlocked .ach-card-icon {
      color: #d97706;
    }
    .ach-card .ach-card-name {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 3px;
    }
    .ach-card .ach-card-desc {
      font-size: 11px;
      opacity: 0.7;
      line-height: 1.35;
    }
    .ach-close-btn {
      position: absolute;
      top: 14px;
      right: 16px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 22px;
      color: inherit;
      opacity: 0.5;
      transition: opacity 0.15s;
    }
    .ach-close-btn:hover { opacity: 1; }
  `;
  document.head.appendChild(style);
}

function renderAchievementsPanel() {
  _ensureAchievementsPanelStyle();

  const unlocked = getUnlockedAchievements();
  const progress = getAchievementProgress();
  const pct = progress.total ? Math.round((progress.unlocked / progress.total) * 100) : 0;

  // Build cards
  const cards = ACHIEVEMENTS.map(a => {
    const isUnlocked = unlocked.includes(a.id);
    const cls = isUnlocked ? 'unlocked' : 'locked';
    const iconName = isUnlocked ? a.icon : 'question_mark';
    return (
      `<div class="ach-card ${cls}" title="${esc(a.description)}">` +
        `<span class="material-symbols-rounded ach-card-icon">${esc(iconName)}</span>` +
        `<div class="ach-card-name">${esc(isUnlocked ? a.name : '???')}</div>` +
        `<div class="ach-card-desc">${esc(a.description)}</div>` +
      `</div>`
    );
  }).join('');

  // Build modal
  const overlay = document.createElement('div');
  overlay.className = 'ach-overlay';
  overlay.id = 'achievements-overlay';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAchievements(); });
  overlay.innerHTML =
    `<div class="ach-modal">` +
      `<button class="ach-close-btn" onclick="closeAchievements()">` +
        `<span class="material-symbols-rounded">close</span>` +
      `</button>` +
      `<h2><span class="material-symbols-rounded" style="color:#d97706;">emoji_events</span> Achievements</h2>` +
      `<div class="ach-progress-wrap">` +
        `<div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${pct}%"></div></div>` +
        `<div class="ach-progress-text">${progress.unlocked} / ${progress.total} unlocked (${pct}%)</div>` +
      `</div>` +
      `<div class="ach-grid">${cards}</div>` +
    `</div>`;

  return overlay;
}

function openAchievements() {
  // Remove existing if any
  closeAchievements();
  document.body.appendChild(renderAchievementsPanel());
}

function closeAchievements() {
  const existing = document.getElementById('achievements-overlay');
  if (existing) existing.remove();
}
