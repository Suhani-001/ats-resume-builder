/* ============================================================
   ATS Resume Builder — script.js
   Full application logic: state, rendering, ATS scoring,
   Local Storage, PDF export, dark mode, sample data.
   ============================================================ */

'use strict';

/* ─── App State ─────────────────────────────────────────────── */
const state = {
  template: 1,
  personal: {
    fullName: '', title: '', email: '', phone: '',
    location: '', linkedin: '', github: '', portfolio: '',
    summary: ''
  },
  education: [],
  skills: {
    technical: [], languages: [], frameworks: [], tools: [], soft: []
  },
  projects: [],
  experience: [],
  certifications: [],
  achievements: []
};

let zoomLevel = 0.70;
const ZOOM_STEP = 0.10;
const ZOOM_MIN  = 0.40;
const ZOOM_MAX  = 1.20;

/* ─── Local Storage ─────────────────────────────────────────── */
const LS_KEY = 'resumeAI_v2';

function saveToLS() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    // Merge deeply so new fields in state aren't lost
    Object.assign(state.personal, saved.personal || {});
    state.template       = saved.template      || 1;
    state.education      = saved.education     || [];
    state.skills         = Object.assign({ technical:[], languages:[], frameworks:[], tools:[], soft:[] }, saved.skills || {});
    state.projects       = saved.projects      || [];
    state.experience     = saved.experience    || [];
    state.certifications = saved.certifications|| [];
    state.achievements   = saved.achievements  || [];
    return true;
  } catch (e) {
    console.warn('LocalStorage load failed:', e);
    return false;
  }
}

/* ─── Unique ID helper ──────────────────────────────────────── */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ─── Toast Notifications ───────────────────────────────────── */
function showToast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ─── Tab Switching (Editor Left) ──────────────────────────── */
function initEditorTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.editor-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`tab-${tab}`)?.classList.add('active');
    });
  });
}

/* ─── Panel Switching (Right: Preview / Score / Checklist) ─── */
function initPanelTabs() {
  document.querySelectorAll('.panel-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      document.querySelectorAll('.panel-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.panel-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      document.getElementById(`panel-${panel}`)?.classList.add('active');
    });
  });
}

/* ─── Dark Mode ─────────────────────────────────────────────── */
function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem('resumeAI_theme') || 'light';
  root.setAttribute('data-theme', saved);
  updateThemeToggleLabel(saved);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('resumeAI_theme', next);
    updateThemeToggleLabel(next);
  });
}

function updateThemeToggleLabel(theme) {
  const btn = document.getElementById('theme-toggle');
  btn.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

/* ─── Personal Information ──────────────────────────────────── */
function initPersonalFields() {
  const fields = ['fullName','title','email','phone','location','linkedin','github','portfolio','summary'];
  fields.forEach(key => {
    const el = document.getElementById(`pi-${key}`);
    if (!el) return;
    el.addEventListener('input', () => {
      state.personal[key] = el.value;
      debouncedUpdate();
    });
  });

  // Character counter for summary
  const summaryEl = document.getElementById('pi-summary');
  const countEl   = document.getElementById('summary-char-count');
  if (summaryEl && countEl) {
    const max = parseInt(summaryEl.dataset.maxchars) || 600;
    function updateCount() {
      const len = summaryEl.value.length;
      countEl.textContent = `${len} / ${max}`;
      countEl.className = 'char-count' + (len > max * 0.9 ? ' warning' : '') + (len >= max ? ' danger' : '');
    }
    summaryEl.addEventListener('input', updateCount);
    updateCount();
  }
}

/* ─── Skills Tags Input ─────────────────────────────────────── */
const SKILL_CATEGORIES = ['technical','languages','frameworks','tools','soft'];

function initSkillsInputs() {
  SKILL_CATEGORIES.forEach(cat => renderSkillTags(cat));
}

function renderSkillTags(cat) {
  const container = document.getElementById(`skills-tags-${cat}`);
  if (!container) return;
  const input = document.getElementById(`skills-input-${cat}`);

  // Clear existing tags (not the input)
  Array.from(container.children).forEach(child => {
    if (child !== input) child.remove();
  });

  // Re-render all tags
  (state.skills[cat] || []).forEach(skill => {
    const tag = buildSkillTag(skill, cat);
    container.insertBefore(tag, input);
  });

  // Bind events (idempotent guard)
  if (input._bound) return;
  input._bound = true;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(cat, input.value);
      input.value = '';
    } else if (e.key === 'Backspace' && input.value === '') {
      const skills = state.skills[cat];
      if (skills.length) {
        skills.pop();
        renderSkillTags(cat);
        debouncedUpdate();
      }
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) {
      addSkill(cat, input.value);
      input.value = '';
    }
  });

  // Click on container focuses input
  container.addEventListener('click', () => input.focus());
}

function buildSkillTag(skill, cat) {
  const tag = document.createElement('span');
  tag.className = 'skill-tag';
  tag.innerHTML = `${escHtml(skill)}<button type="button" aria-label="Remove ${escHtml(skill)}">×</button>`;
  tag.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    state.skills[cat] = state.skills[cat].filter(s => s !== skill);
    renderSkillTags(cat);
    debouncedUpdate();
  });
  return tag;
}

function addSkill(cat, raw) {
  const val = raw.replace(/,/g, '').trim();
  if (!val) return;
  if (!state.skills[cat].includes(val)) {
    state.skills[cat].push(val);
    renderSkillTags(cat);
    debouncedUpdate();
  }
}

/* ─── Generic Dynamic Entry List ────────────────────────────── */
function makeEntryManager({ listId, addBtnId, stateKey, buildForm, buildTitle }) {
  const listEl = document.getElementById(listId);
  const addBtn = document.getElementById(addBtnId);
  if (!listEl || !addBtn) return;

  function renderAll() {
    listEl.innerHTML = '';
    (state[stateKey] || []).forEach((entry, idx) => {
      listEl.appendChild(buildCard(entry, idx));
    });
    if (!state[stateKey].length) {
      listEl.innerHTML = `<p class="text-muted" style="text-align:center;padding:24px 0;">No entries yet. Click <strong>+ Add</strong> to get started.</p>`;
    }
  }

  function buildCard(entry, idx) {
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.setAttribute('role', 'listitem');
    const title = buildTitle(entry) || 'New Entry';
    card.innerHTML = `
      <div class="entry-card-header">
        <div>
          <div class="entry-card-title">${escHtml(title)}</div>
        </div>
        <div class="entry-card-actions">
          <span class="chevron">▾</span>
          <button class="btn btn-ghost btn-icon btn-sm btn-move-up" title="Move up" aria-label="Move up">↑</button>
          <button class="btn btn-ghost btn-icon btn-sm btn-move-down" title="Move down" aria-label="Move down">↓</button>
          <button class="btn btn-ghost btn-icon btn-sm btn-delete" style="color:var(--danger)" title="Delete" aria-label="Delete entry">🗑</button>
        </div>
      </div>
      <div class="entry-card-body">
        ${buildForm(entry, idx)}
      </div>`;

    // Collapse toggle
    const header = card.querySelector('.entry-card-header');
    header.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      card.classList.toggle('collapsed');
    });

    // Delete
    card.querySelector('.btn-delete').addEventListener('click', () => {
      state[stateKey].splice(idx, 1);
      renderAll();
      debouncedUpdate();
    });

    // Move up
    card.querySelector('.btn-move-up').addEventListener('click', () => {
      if (idx > 0) {
        [state[stateKey][idx-1], state[stateKey][idx]] = [state[stateKey][idx], state[stateKey][idx-1]];
        renderAll();
        debouncedUpdate();
      }
    });

    // Move down
    card.querySelector('.btn-move-down').addEventListener('click', () => {
      if (idx < state[stateKey].length - 1) {
        [state[stateKey][idx], state[stateKey][idx+1]] = [state[stateKey][idx+1], state[stateKey][idx]];
        renderAll();
        debouncedUpdate();
      }
    });

    // Live field binding
    card.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => {
        state[stateKey][idx][el.dataset.field] = el.value;
        card.querySelector('.entry-card-title').textContent = buildTitle(state[stateKey][idx]) || 'New Entry';
        debouncedUpdate();
      });
    });

    return card;
  }

  addBtn.addEventListener('click', () => {
    state[stateKey].push(newEntry(stateKey));
    renderAll();
    // Auto-scroll to new card and focus first field
    const cards = listEl.querySelectorAll('.entry-card');
    const last = cards[cards.length - 1];
    last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    last?.querySelector('input,textarea')?.focus();
    debouncedUpdate();
  });

  renderAll();
  return renderAll;
}

function newEntry(key) {
  const base = { id: uid() };
  const defaults = {
    education:      { degree:'', institution:'', location:'', startYear:'', endYear:'', gpa:'', description:'' },
    projects:       { name:'', description:'', tech:'', githubUrl:'', liveUrl:'' },
    experience:     { role:'', company:'', location:'', startDate:'', endDate:'', current: false, description:'' },
    certifications: { name:'', issuer:'', year:'', url:'' },
    achievements:   { title:'', description:'' }
  };
  return Object.assign(base, defaults[key] || {});
}

/* ─── Education Form ────────────────────────────────────────── */
function initEducation() {
  makeEntryManager({
    listId: 'education-list',
    addBtnId: 'add-education',
    stateKey: 'education',
    buildTitle: e => e.degree || e.institution || 'New Education Entry',
    buildForm: (e) => `
      <div class="form-group">
        <label>Degree / Qualification</label>
        <input type="text" data-field="degree" value="${escAttr(e.degree)}" placeholder="e.g. B.Tech in Computer Science">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Institution</label>
          <input type="text" data-field="institution" value="${escAttr(e.institution)}" placeholder="e.g. IIT Delhi">
        </div>
        <div class="form-group">
          <label>Location</label>
          <input type="text" data-field="location" value="${escAttr(e.location)}" placeholder="City, State">
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>Start Year</label>
          <input type="text" data-field="startYear" value="${escAttr(e.startYear)}" placeholder="2020">
        </div>
        <div class="form-group">
          <label>End Year</label>
          <input type="text" data-field="endYear" value="${escAttr(e.endYear)}" placeholder="2024">
        </div>
        <div class="form-group">
          <label>GPA / %</label>
          <input type="text" data-field="gpa" value="${escAttr(e.gpa)}" placeholder="8.5 / 10">
        </div>
      </div>
      <div class="form-group">
        <label>Additional Info</label>
        <textarea data-field="description" rows="2" placeholder="Relevant coursework, honours, activities…">${escHtml(e.description)}</textarea>
      </div>`
  });
}

/* ─── Projects Form ─────────────────────────────────────────── */
function initProjects() {
  makeEntryManager({
    listId: 'project-list',
    addBtnId: 'add-project',
    stateKey: 'projects',
    buildTitle: e => e.name || 'New Project',
    buildForm: (e) => `
      <div class="form-group">
        <label>Project Name</label>
        <input type="text" data-field="name" value="${escAttr(e.name)}" placeholder="e.g. E-Commerce Platform">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea data-field="description" rows="3" placeholder="Describe what you built, the problem it solves, and key achievements. Use action verbs and numbers.">${escHtml(e.description)}</textarea>
      </div>
      <div class="form-group">
        <label>Technologies Used</label>
        <input type="text" data-field="tech" value="${escAttr(e.tech)}" placeholder="React, Node.js, MongoDB, AWS">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>GitHub URL</label>
          <input type="url" data-field="githubUrl" value="${escAttr(e.githubUrl)}" placeholder="https://github.com/…">
        </div>
        <div class="form-group">
          <label>Live Demo URL</label>
          <input type="url" data-field="liveUrl" value="${escAttr(e.liveUrl)}" placeholder="https://yourproject.vercel.app">
        </div>
      </div>`
  });
}

/* ─── Experience Form ───────────────────────────────────────── */
function initExperience() {
  makeEntryManager({
    listId: 'experience-list',
    addBtnId: 'add-experience',
    stateKey: 'experience',
    buildTitle: e => e.role ? `${e.role}${e.company ? ' @ ' + e.company : ''}` : 'New Experience',
    buildForm: (e) => `
      <div class="form-row">
        <div class="form-group">
          <label>Job Title / Role</label>
          <input type="text" data-field="role" value="${escAttr(e.role)}" placeholder="e.g. Software Engineer Intern">
        </div>
        <div class="form-group">
          <label>Company</label>
          <input type="text" data-field="company" value="${escAttr(e.company)}" placeholder="e.g. Google">
        </div>
      </div>
      <div class="form-group">
        <label>Location</label>
        <input type="text" data-field="location" value="${escAttr(e.location)}" placeholder="City, Country (or Remote)">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Start Date</label>
          <input type="text" data-field="startDate" value="${escAttr(e.startDate)}" placeholder="May 2023">
        </div>
        <div class="form-group">
          <label>End Date</label>
          <input type="text" data-field="endDate" value="${escAttr(e.current ? 'Present' : e.endDate)}" placeholder="Aug 2023 or Present">
        </div>
      </div>
      <div class="form-group">
        <label>Responsibilities & Achievements</label>
        <textarea data-field="description" rows="4" placeholder="• Built RESTful APIs serving 10k+ users daily&#10;• Reduced page load time by 40% using lazy loading&#10;• Collaborated with cross-functional team of 8 engineers">${escHtml(e.description)}</textarea>
      </div>`
  });
}

/* ─── Certifications Form ───────────────────────────────────── */
function initCertifications() {
  makeEntryManager({
    listId: 'certification-list',
    addBtnId: 'add-certification',
    stateKey: 'certifications',
    buildTitle: e => e.name || 'New Certification',
    buildForm: (e) => `
      <div class="form-row">
        <div class="form-group">
          <label>Certification Name</label>
          <input type="text" data-field="name" value="${escAttr(e.name)}" placeholder="e.g. AWS Solutions Architect">
        </div>
        <div class="form-group">
          <label>Issuing Organisation</label>
          <input type="text" data-field="issuer" value="${escAttr(e.issuer)}" placeholder="e.g. Amazon Web Services">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Year</label>
          <input type="text" data-field="year" value="${escAttr(e.year)}" placeholder="2024">
        </div>
        <div class="form-group">
          <label>Certificate URL</label>
          <input type="url" data-field="url" value="${escAttr(e.url)}" placeholder="https://…">
        </div>
      </div>`
  });
}

/* ─── Achievements Form ─────────────────────────────────────── */
function initAchievements() {
  makeEntryManager({
    listId: 'achievement-list',
    addBtnId: 'add-achievement',
    stateKey: 'achievements',
    buildTitle: e => e.title || 'New Achievement',
    buildForm: (e) => `
      <div class="form-group">
        <label>Title / Award</label>
        <input type="text" data-field="title" value="${escAttr(e.title)}" placeholder="e.g. 1st Place — HackIndia 2024">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea data-field="description" rows="2" placeholder="Brief context: what you did and why it matters.">${escHtml(e.description)}</textarea>
      </div>`
  });
}

/* ─── Template Selector ─────────────────────────────────────── */
function initTemplateSelector() {
  document.querySelectorAll('.template-card').forEach(card => {
    // Set initial state
    const tpl = parseInt(card.dataset.tpl);
    if (tpl === state.template) {
      card.classList.add('active');
      card.setAttribute('aria-checked', 'true');
    } else {
      card.classList.remove('active');
      card.setAttribute('aria-checked', 'false');
    }

    card.addEventListener('click', () => {
      state.template = parseInt(card.dataset.tpl);
      document.querySelectorAll('.template-card').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-checked', 'true');
      const sheet = document.getElementById('resume-sheet');
      sheet.className = `tpl-${state.template}`;
      renderPreview();
      saveToLS();
      showToast(`Template ${state.template} applied`, 'success', 2000);
    });

    // Keyboard accessibility
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });
}

/* ─── Zoom Controls ─────────────────────────────────────────── */
function initZoom() {
  function applyZoom() {
    document.getElementById('resume-sheet').style.transform = `scale(${zoomLevel})`;
    document.getElementById('zoom-value').textContent = Math.round(zoomLevel * 100) + '%';
  }

  document.getElementById('zoom-out').addEventListener('click', () => {
    zoomLevel = Math.max(ZOOM_MIN, +(zoomLevel - ZOOM_STEP).toFixed(2));
    applyZoom();
  });
  document.getElementById('zoom-in').addEventListener('click', () => {
    zoomLevel = Math.min(ZOOM_MAX, +(zoomLevel + ZOOM_STEP).toFixed(2));
    applyZoom();
  });
  document.getElementById('zoom-fit').addEventListener('click', () => {
    const viewport = document.getElementById('preview-viewport');
    const sheetW = 794;
    const available = viewport.clientWidth - 40;
    zoomLevel = Math.min(1, +(available / sheetW).toFixed(2));
    applyZoom();
  });

  applyZoom();
}

/* ─── PDF Export ────────────────────────────────────────────── */
function downloadPDF() {
  if (!state.personal.fullName.trim()) {
    showToast('Please add your name before exporting.', 'warning');
    return;
  }
  // Temporarily reset zoom and remove transform for clean print
  const sheet = document.getElementById('resume-sheet');
  const prevTransform = sheet.style.transform;
  sheet.style.transform = 'none';

  showToast('Opening print dialog… Select "Save as PDF" in your printer.', 'info', 4000);

  requestAnimationFrame(() => {
    window.print();
    // Restore after print dialog closes
    setTimeout(() => { sheet.style.transform = prevTransform; }, 500);
  });
}

function initPDFButtons() {
  // All three PDF buttons across the UI
  ['download-pdf', 'download-pdf-2', 'download-pdf-toolbar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', downloadPDF);
    // Remove inline onclick if any (defensive)
    if (el) el.removeAttribute('onclick');
  });
}

/* ─── Modal: Clear Data ─────────────────────────────────────── */
function openClearModal() {
  document.getElementById('clear-modal').classList.add('open');
}
function closeClearModal() {
  document.getElementById('clear-modal').classList.remove('open');
}

function initClearModal() {
  document.getElementById('clear-cancel').addEventListener('click', closeClearModal);
  document.getElementById('clear-data').addEventListener('click', openClearModal);

  document.getElementById('clear-confirm').addEventListener('click', () => {
    // Reset state
    state.personal = { fullName:'',title:'',email:'',phone:'',location:'',linkedin:'',github:'',portfolio:'',summary:'' };
    state.education = [];
    state.skills = { technical:[], languages:[], frameworks:[], tools:[], soft:[] };
    state.projects = [];
    state.experience = [];
    state.certifications = [];
    state.achievements = [];
    state.template = 1;

    localStorage.removeItem(LS_KEY);
    closeClearModal();
    location.reload();
  });

  // Close on backdrop click
  document.getElementById('clear-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('clear-modal')) closeClearModal();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeClearModal();
  });
}

/* ─── Sample Data ───────────────────────────────────────────── */
function loadSampleData() {
  Object.assign(state.personal, {
    fullName:  'Aanya Sharma',
    title:     'Full Stack Developer | ML Enthusiast',
    email:     'aanya.sharma@email.com',
    phone:     '+91 98765 43210',
    location:  'Bengaluru, Karnataka, India',
    linkedin:  'https://linkedin.com/in/aanyasharma',
    github:    'https://github.com/aanyasharma',
    portfolio: 'https://aanya.dev',
    summary:   'Passionate Full Stack Developer with 2+ years of experience building scalable web applications using React, Node.js, and Python. Contributed to open-source projects with 500+ GitHub stars. Seeking to leverage expertise in ML and cloud technologies to build products that matter at scale.'
  });

  state.education = [{
    id: uid(), degree: 'B.Tech in Computer Science & Engineering',
    institution: 'Indian Institute of Technology, Bombay', location: 'Mumbai, Maharashtra',
    startYear: '2020', endYear: '2024', gpa: '8.7 / 10',
    description: 'Specialisation in Artificial Intelligence. Dean\'s List 2022, 2023.'
  }];

  state.skills = {
    technical:  ['Data Structures', 'Algorithms', 'System Design', 'REST APIs', 'GraphQL'],
    languages:  ['JavaScript', 'TypeScript', 'Python', 'Java', 'SQL'],
    frameworks: ['React', 'Next.js', 'Node.js', 'Express', 'FastAPI', 'TensorFlow'],
    tools:      ['Git', 'Docker', 'AWS', 'PostgreSQL', 'MongoDB', 'Figma', 'Linux'],
    soft:       ['Team Leadership', 'Agile/Scrum', 'Technical Writing', 'Mentoring']
  };

  state.projects = [
    {
      id: uid(), name: 'SmartCart — AI-Powered E-Commerce',
      description: 'Built a full-stack e-commerce platform with ML-based product recommendations. Integrated Stripe payments, achieving 99.9% uptime. Reduced cart abandonment by 32% through personalised UX flows.',
      tech: 'React, Node.js, TensorFlow, PostgreSQL, AWS EC2, Redis',
      githubUrl: 'https://github.com/aanyasharma/smartcart',
      liveUrl:   'https://smartcart.aanya.dev'
    },
    {
      id: uid(), name: 'CodeCollab — Real-Time Collaborative IDE',
      description: 'Developed a browser-based collaborative code editor supporting 10+ languages with syntax highlighting, video chat, and execution sandbox. Handles 200+ concurrent sessions with <50ms latency.',
      tech: 'TypeScript, Socket.io, Monaco Editor, Docker, WebRTC',
      githubUrl: 'https://github.com/aanyasharma/codecollab',
      liveUrl:   ''
    }
  ];

  state.experience = [{
    id: uid(), role: 'Software Engineer Intern', company: 'Flipkart',
    location: 'Bengaluru, India', startDate: 'May 2023', endDate: 'Aug 2023', current: false,
    description: '• Optimised checkout microservice, reducing p99 latency by 40% (120ms → 72ms).\n• Built real-time inventory sync pipeline processing 50k+ events/min using Kafka.\n• Collaborated with 8-person team in Agile sprints; shipped 3 production features.'
  }];

  state.certifications = [{
    id: uid(), name: 'AWS Certified Solutions Architect – Associate',
    issuer: 'Amazon Web Services', year: '2024',
    url: 'https://aws.amazon.com/certification/'
  }];

  state.achievements = [{
    id: uid(), title: '1st Place — HackIndia 2023 (National)',
    description: 'Built an AI-powered mental health chatbot in 36 hours. Selected from 2,400+ teams nationwide.'
  }];

  state.template = 1;

  // Persist to LocalStorage BEFORE reloading so data survives the page refresh
  saveToLS();
  location.reload();
}

function initSampleDataButtons() {
  // Nav bar "Sample Data" button
  document.getElementById('load-sample')?.addEventListener('click', loadSampleData);

  // Settings tab "Load Sample Data" button
  document.getElementById('load-sample-settings')?.addEventListener('click', loadSampleData);

  // Settings tab "Clear All Data" button (has its own id, separate from nav #clear-data)
  document.getElementById('clear-data-settings')?.addEventListener('click', openClearModal);
}

/* ─── Keyboard Shortcuts ────────────────────────────────────── */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveToLS();
      showToast('Resume saved!', 'success', 2000);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      downloadPDF();
    }
  });
}

/* ─── Debounce Helper ───────────────────────────────────────── */
let _debounceTimer = null;
function debouncedUpdate() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    saveToLS();
    renderPreview();
    updateATSScore();
    updateChecklist();
  }, 300);
}

/* ─── HTML Escape Helpers ───────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function escAttr(str) { return escHtml(str); }

/* ─── Resume Preview Renderer ───────────────────────────────── */
function renderPreview() {
  const sheet = document.getElementById('resume-sheet');
  sheet.className = `tpl-${state.template}`;
  const t = state.template;

  if (t === 1) sheet.innerHTML = renderTpl1();
  else if (t === 2) sheet.innerHTML = renderTpl2();
  else if (t === 3) sheet.innerHTML = renderTpl3();
}

/* ── Shared section renderers ─────────────────────────────── */
function renderContactItems(iconFn) {
  const p = state.personal;
  const items = [];
  if (p.email)     items.push(iconFn('✉', p.email, `mailto:${p.email}`));
  if (p.phone)     items.push(iconFn('📞', p.phone));
  if (p.location)  items.push(iconFn('📍', p.location));
  if (p.linkedin)  items.push(iconFn('in', shortenUrl(p.linkedin), p.linkedin));
  if (p.github)    items.push(iconFn('⌥', shortenUrl(p.github), p.github));
  if (p.portfolio) items.push(iconFn('🌐', shortenUrl(p.portfolio), p.portfolio));
  return items.join('');
}

function shortenUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

function renderEducationSection() {
  if (!state.education.length) return '';
  return state.education.map(e => `
    <div class="resume-entry">
      <div class="resume-entry-header">
        <div class="resume-entry-title">${escHtml(e.degree)}</div>
        <div class="resume-entry-meta">${escHtml([e.startYear, e.endYear].filter(Boolean).join(' – '))}</div>
      </div>
      <div class="resume-entry-sub">${escHtml(e.institution)}${e.location ? ', ' + escHtml(e.location) : ''}${e.gpa ? ' &nbsp;|&nbsp; GPA: ' + escHtml(e.gpa) : ''}</div>
      ${e.description ? `<div class="resume-entry-desc">${escHtml(e.description)}</div>` : ''}
    </div>`).join('');
}

function renderSkillsSection(tpl) {
  const s = state.skills;
  const cats = [
    { label: 'Technical', list: s.technical },
    { label: 'Languages', list: s.languages },
    { label: 'Frameworks', list: s.frameworks },
    { label: 'Tools', list: s.tools },
    { label: 'Soft Skills', list: s.soft }
  ].filter(c => c.list.length);
  if (!cats.length) return '';
  return cats.map(c => `
    <div style="margin-bottom:8px;">
      <span style="font-size:10px;font-weight:700;color:#475569;">${escHtml(c.label)}: </span>
      <div class="resume-skills-grid" style="display:inline-flex;flex-wrap:wrap;gap:4px;">
        ${c.list.map(s => `<span class="resume-skill-chip">${escHtml(s)}</span>`).join('')}
      </div>
    </div>`).join('');
}

function renderProjectsSection() {
  if (!state.projects.length) return '';
  return state.projects.map(p => `
    <div class="resume-entry">
      <div class="resume-entry-header">
        <div class="resume-entry-title">${escHtml(p.name)}</div>
        <div style="display:flex;gap:8px;">
          ${p.githubUrl ? `<a href="${escAttr(p.githubUrl)}" class="resume-link">GitHub</a>` : ''}
          ${p.liveUrl   ? `<a href="${escAttr(p.liveUrl)}"   class="resume-link">Live</a>`   : ''}
        </div>
      </div>
      ${p.tech ? `<div class="resume-entry-sub">${escHtml(p.tech)}</div>` : ''}
      ${p.description ? `<div class="resume-entry-desc">${descToHtml(p.description)}</div>` : ''}
    </div>`).join('');
}

function renderExperienceSection() {
  if (!state.experience.length) return '';
  return state.experience.map(e => `
    <div class="resume-entry">
      <div class="resume-entry-header">
        <div class="resume-entry-title">${escHtml(e.role)}</div>
        <div class="resume-entry-meta">${escHtml([e.startDate, e.endDate || (e.current ? 'Present' : '')].filter(Boolean).join(' – '))}</div>
      </div>
      <div class="resume-entry-sub">${escHtml(e.company)}${e.location ? ' · ' + escHtml(e.location) : ''}</div>
      ${e.description ? `<div class="resume-entry-desc">${descToHtml(e.description)}</div>` : ''}
    </div>`).join('');
}

function renderCertificationsSection() {
  if (!state.certifications.length) return '';
  return state.certifications.map(c => `
    <div class="resume-entry">
      <div class="resume-entry-header">
        <div class="resume-entry-title">${escHtml(c.name)}</div>
        <div class="resume-entry-meta">${escHtml(c.year)}</div>
      </div>
      <div class="resume-entry-sub">${escHtml(c.issuer)}${c.url ? ` — <a href="${escAttr(c.url)}" class="resume-link">View</a>` : ''}</div>
    </div>`).join('');
}

function renderAchievementsSection() {
  if (!state.achievements.length) return '';
  return state.achievements.map(a => `
    <div class="resume-entry">
      <div class="resume-entry-title">${escHtml(a.title)}</div>
      ${a.description ? `<div class="resume-entry-desc">${escHtml(a.description)}</div>` : ''}
    </div>`).join('');
}

// Convert newline-bullets to HTML list items
function descToHtml(text) {
  if (!text) return '';
  const lines = escHtml(text).split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return lines[0] || '';
  const isBullet = l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*');
  if (lines.some(isBullet)) {
    return '<ul style="padding-left:14px;margin:2px 0;">' +
      lines.map(l => `<li style="margin-bottom:2px;">${l.replace(/^[•\-\*]\s*/,'')}</li>`).join('') +
      '</ul>';
  }
  return lines.join('<br>');
}

/* ── Template 1: Modern Pro (Two-Column) ─────────────────── */
function renderTpl1() {
  const p = state.personal;
  const hasAnySidebar = state.education.length || allSkillsCount();
  const hasAnyMain    = p.summary || state.projects.length || state.experience.length || state.certifications.length || state.achievements.length;

  const contactIcon = (icon, text, href) =>
    `<div class="contact-item">${icon} ${href ? `<a href="${escAttr(href)}" style="color:rgba(255,255,255,.85)">${escHtml(text)}</a>` : escHtml(text)}</div>`;

  return `
    <div class="resume-header">
      <div class="resume-name">${escHtml(p.fullName) || 'Your Name'}</div>
      <div class="resume-title">${escHtml(p.title) || 'Professional Title'}</div>
      <div class="resume-contacts">
        ${renderContactItems(contactIcon)}
      </div>
    </div>
    <div class="resume-body">
      <div class="resume-sidebar">
        ${state.education.length ? `<div class="section-head">Education</div>${renderEducationSection()}` : ''}
        ${allSkillsCount() ? `<div class="section-head">Skills</div>${renderSkillsSection(1)}` : ''}
        ${state.certifications.length ? `<div class="section-head">Certifications</div>${renderCertificationsSection()}` : ''}
        ${state.achievements.length ? `<div class="section-head">Achievements</div>${renderAchievementsSection()}` : ''}
        ${!hasAnySidebar ? '<div style="color:#94a3b8;font-size:10px;text-align:center;padding:20px 0;">Add Education & Skills to see them here.</div>' : ''}
      </div>
      <div class="resume-main">
        ${p.summary ? `<div class="section-head">Summary</div><div class="resume-summary">${escHtml(p.summary)}</div>` : ''}
        ${state.experience.length ? `<div class="section-head">Experience</div>${renderExperienceSection()}` : ''}
        ${state.projects.length ? `<div class="section-head">Projects</div>${renderProjectsSection()}` : ''}
        ${!hasAnyMain ? '<div style="color:#94a3b8;font-size:10px;text-align:center;padding:20px 0;">Start filling in your information to see the preview.</div>' : ''}
      </div>
    </div>`;
}

/* ── Template 2: Minimal ATS (Single-Column) ──────────────── */
function renderTpl2() {
  const p = state.personal;
  const contactIcon = (icon, text, href) =>
    `<div class="contact-item">${icon} ${href ? `<a href="${escAttr(href)}" style="color:#475569">${escHtml(text)}</a>` : escHtml(text)}</div>`;

  return `
    <div class="resume-header">
      <div class="resume-name">${escHtml(p.fullName) || 'Your Name'}</div>
      <div class="resume-title">${escHtml(p.title) || 'Professional Title'}</div>
      <div class="resume-contacts">${renderContactItems(contactIcon)}</div>
    </div>
    <div class="resume-body">
      ${p.summary ? `<div class="section-head">Professional Summary</div><div class="resume-summary">${escHtml(p.summary)}</div>` : ''}
      ${state.experience.length ? `<div class="section-head">Experience</div>${renderExperienceSection()}` : ''}
      ${state.projects.length ? `<div class="section-head">Projects</div>${renderProjectsSection()}` : ''}
      ${state.education.length ? `<div class="section-head">Education</div>${renderEducationSection()}` : ''}
      ${allSkillsCount() ? `<div class="section-head">Skills</div>${renderSkillsSection(2)}` : ''}
      ${state.certifications.length ? `<div class="section-head">Certifications</div>${renderCertificationsSection()}` : ''}
      ${state.achievements.length ? `<div class="section-head">Achievements</div>${renderAchievementsSection()}` : ''}
    </div>`;
}

/* ── Template 3: Student Pro (Modern) ────────────────────── */
function renderTpl3() {
  const p = state.personal;
  const contactIcon = (icon, text, href) =>
    `<div class="contact-item">${icon} ${href ? `<a href="${escAttr(href)}" style="color:#475569">${escHtml(text)}</a>` : escHtml(text)}</div>`;

  return `
    <div class="resume-header">
      <div class="header-accent"></div>
      <div class="header-content">
        <div class="resume-name">${escHtml(p.fullName) || 'Your Name'}</div>
        <div class="resume-title">${escHtml(p.title) || 'Professional Title'}</div>
        <div class="resume-contacts">${renderContactItems(contactIcon)}</div>
      </div>
    </div>
    <div class="resume-body">
      ${p.summary ? `<div class="section-head">About Me</div><div class="resume-summary">${escHtml(p.summary)}</div>` : ''}
      ${state.experience.length ? `<div class="section-head">Experience</div>${renderExperienceSection()}` : ''}
      ${state.projects.length ? `<div class="section-head">Projects</div>${renderProjectsSection()}` : ''}
      ${state.education.length ? `<div class="section-head">Education</div>${renderEducationSection()}` : ''}
      ${allSkillsCount() ? `<div class="section-head">Skills</div>${renderSkillsSection(3)}` : ''}
      ${state.certifications.length ? `<div class="section-head">Certifications</div>${renderCertificationsSection()}` : ''}
      ${state.achievements.length ? `<div class="section-head">Achievements</div>${renderAchievementsSection()}` : ''}
    </div>`;
}

function allSkillsCount() {
  return Object.values(state.skills).reduce((n, arr) => n + arr.length, 0);
}

/* ─── ATS Scoring Engine ────────────────────────────────────── */
function updateATSScore() {
  const p   = state.personal;
  const pts = {};

  // Contact Info (15 pts)
  let contact = 0;
  if (p.fullName.trim()) contact += 4;
  if (p.email.trim())    contact += 4;
  if (p.phone.trim())    contact += 3;
  if (p.location.trim()) contact += 2;
  if (p.title.trim())    contact += 2;
  pts.contact = { earned: Math.min(contact, 15), max: 15 };

  // Summary (10 pts)
  const sumLen = p.summary.trim().split(/\s+/).filter(Boolean).length;
  let summary = 0;
  if (sumLen >= 30)  summary = 10;
  else if (sumLen >= 15) summary = 6;
  else if (sumLen >= 5)  summary = 3;
  pts.summary = { earned: summary, max: 10 };

  // Education (12 pts)
  let education = 0;
  if (state.education.length >= 1) {
    education += 8;
    if (state.education[0].gpa) education += 2;
    if (state.education[0].description) education += 2;
  }
  pts.education = { earned: Math.min(education, 12), max: 12 };

  // Skills (15 pts)
  const totalSkills = allSkillsCount();
  let skills = 0;
  if (totalSkills >= 15) skills = 15;
  else if (totalSkills >= 10) skills = 11;
  else if (totalSkills >= 5)  skills = 7;
  else if (totalSkills >= 1)  skills = 4;
  pts.skills = { earned: skills, max: 15 };

  // Projects (15 pts)
  let projects = 0;
  state.projects.forEach(proj => {
    projects += 3;
    if (proj.githubUrl) projects += 1;
    if (proj.tech)      projects += 1;
  });
  pts.projects = { earned: Math.min(projects, 15), max: 15 };

  // Experience (13 pts)
  let experience = 0;
  state.experience.forEach(exp => {
    experience += 5;
    if (exp.description && exp.description.length > 50) experience += 3;
  });
  pts.experience = { earned: Math.min(experience, 13), max: 13 };

  // Certifications (8 pts)
  pts.certifications = { earned: Math.min(state.certifications.length * 4, 8), max: 8 };

  // LinkedIn (6 pts)
  pts.linkedin = { earned: p.linkedin.trim() ? 6 : 0, max: 6 };

  // GitHub (6 pts)
  pts.github = { earned: p.github.trim() ? 6 : 0, max: 6 };

  // Total
  const total    = Object.values(pts).reduce((s, v) => s + v.earned, 0);
  const maxTotal = Object.values(pts).reduce((s, v) => s + v.max, 0);
  const score    = Math.round((total / maxTotal) * 100);

  // Animate score ring (circumference = 2π × 59 ≈ 370.7)
  const circ = 370;
  const offset = circ - (score / 100) * circ;
  const ringFill = document.getElementById('score-ring-fill');
  if (ringFill) ringFill.style.strokeDashoffset = offset;

  const scoreEl = document.getElementById('ats-score-value');
  if (scoreEl) animateNumber(scoreEl, parseInt(scoreEl.textContent) || 0, score);

  // Badge
  const badge = document.getElementById('score-badge');
  const statusText = document.getElementById('score-status-text');
  if (badge) {
    let cls, label, text;
    if (score >= 85)      { cls = 'badge-success'; label = 'Excellent 🏆'; text = 'Outstanding resume! Recruiters will take notice.'; }
    else if (score >= 70) { cls = 'badge-primary'; label = 'Good ✨'; text = 'Strong resume. A few tweaks will make it exceptional.'; }
    else if (score >= 50) { cls = 'badge-warning'; label = 'Fair 📝'; text = 'Good start. Follow the suggestions below to improve.'; }
    else                  { cls = 'badge-danger';  label = 'Weak 🚧'; text = 'Start filling in your resume details below.'; }
    badge.className = `badge ${cls}`;
    badge.textContent = label;
    if (statusText) statusText.textContent = text;
  }

  // Score bars
  const barMap = {
    contact: pts.contact, summary: pts.summary, education: pts.education,
    skills: pts.skills, projects: pts.projects, experience: pts.experience,
    certifications: pts.certifications, linkedin: pts.linkedin, github: pts.github
  };
  Object.entries(barMap).forEach(([key, v]) => {
    const bar = document.getElementById(`score-bar-${key}`);
    const ptsEl = document.getElementById(`score-pts-${key}`);
    const pct = v.max > 0 ? (v.earned / v.max * 100) : 0;
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    }
    if (ptsEl) ptsEl.textContent = `${v.earned}/${v.max}`;
  });

  // Suggestions
  buildSuggestions(pts, score);
}

function animateNumber(el, from, to) {
  const duration = 800;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    el.textContent = Math.round(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function buildSuggestions(pts, score) {
  const list = document.getElementById('suggestions-list');
  if (!list) return;

  const suggestions = [];
  const p = state.personal;

  if (!p.fullName.trim())  suggestions.push({ type:'bad', icon:'🚨', text:'Add your <strong>full name</strong> — it is required.' });
  if (!p.email.trim())     suggestions.push({ type:'bad', icon:'🚨', text:'Add your <strong>email address</strong>.' });
  if (!p.linkedin.trim())  suggestions.push({ type:'warn', icon:'🔗', text:'Add your <strong>LinkedIn profile</strong> — recruiters always check.' });
  if (!p.github.trim())    suggestions.push({ type:'warn', icon:'⌥', text:'Add your <strong>GitHub profile</strong> for tech roles.' });
  if (pts.summary.earned < 6) suggestions.push({ type:'warn', icon:'📝', text:'Expand your <strong>professional summary</strong> to at least 30 words with ATS keywords.' });
  if (!state.education.length) suggestions.push({ type:'bad', icon:'🎓', text:'Add your <strong>education</strong> details.' });
  if (allSkillsCount() < 10) suggestions.push({ type:'warn', icon:'⚡', text:`Add more <strong>skills</strong> — you have ${allSkillsCount()}, aim for 10+.` });
  if (!state.projects.length) suggestions.push({ type:'warn', icon:'🚀', text:'Add at least <strong>2 projects</strong> with GitHub links to stand out.' });
  if (!state.experience.length) suggestions.push({ type:'warn', icon:'💼', text:'Add <strong>internships or work experience</strong> to boost your score.' });
  if (!state.certifications.length) suggestions.push({ type:'warn', icon:'📜', text:'Add <strong>certifications</strong> (AWS, Google, Coursera) to improve credibility.' });
  if (state.projects.some(pr => !pr.githubUrl)) suggestions.push({ type:'warn', icon:'🔗', text:'Add <strong>GitHub links</strong> to all your projects.' });

  if (!suggestions.length) {
    suggestions.push({ type:'good', icon:'🎉', text:'<strong>Great job!</strong> Your resume looks complete and ATS-optimised.' });
  }

  list.innerHTML = suggestions.map(s => `
    <div class="suggestion-item ${s.type}">
      <span class="suggestion-icon">${s.icon}</span>
      <span class="suggestion-text">${s.text}</span>
    </div>`).join('');
}

/* ─── Completion Checklist ──────────────────────────────────── */
function updateChecklist() {
  const p = state.personal;
  const items = [
    { label: 'Name, email & phone added',      done: !!(p.fullName.trim() && p.email.trim() && p.phone.trim()) },
    { label: 'Professional title filled in',   done: !!p.title.trim() },
    { label: 'Summary written (30+ words)',     done: p.summary.trim().split(/\s+/).filter(Boolean).length >= 30 },
    { label: 'Education added',                done: state.education.length > 0 },
    { label: '10+ skills added',               done: allSkillsCount() >= 10 },
    { label: 'At least 1 project added',       done: state.projects.length > 0 },
    { label: 'LinkedIn & GitHub included',     done: !!(p.linkedin.trim() && p.github.trim()) },
    { label: 'Experience or internship added', done: state.experience.length > 0 }
  ];

  const done = items.filter(i => i.done).length;
  const total = items.length;

  const progressFill  = document.getElementById('checklist-progress-fill');
  const progressLabel = document.getElementById('checklist-progress-label');
  const ul = document.getElementById('completion-checklist');

  if (progressFill)  progressFill.style.width = ((done / total) * 100) + '%';
  if (progressLabel) progressLabel.textContent = `${done}/${total} Complete`;

  if (ul) {
    ul.innerHTML = items.map(item => `
      <li class="check-item ${item.done ? 'done' : ''}">
        <span class="check-icon">${item.done ? '✅' : '⬜'}</span>
        <span>${item.label}</span>
      </li>`).join('');
  }
}

/* ─── Loading Screen ────────────────────────────────────────── */
function hideLoadingScreen() {
  setTimeout(() => {
    const screen = document.getElementById('loading-screen');
    if (screen) screen.classList.add('hidden');
  }, 1500);
}

/* ─── Populate UI from State ────────────────────────────────── */
function populateUIFromState() {
  // Personal fields
  const fields = ['fullName','title','email','phone','location','linkedin','github','portfolio','summary'];
  fields.forEach(key => {
    const el = document.getElementById(`pi-${key}`);
    if (el) el.value = state.personal[key] || '';
  });

  // Summary char count
  const summaryEl = document.getElementById('pi-summary');
  const countEl   = document.getElementById('summary-char-count');
  if (summaryEl && countEl) {
    const max = parseInt(summaryEl.dataset.maxchars) || 600;
    countEl.textContent = `${summaryEl.value.length} / ${max}`;
  }

  // Skills
  SKILL_CATEGORIES.forEach(cat => renderSkillTags(cat));

  // Template
  document.querySelectorAll('.template-card').forEach(card => {
    const tpl = parseInt(card.dataset.tpl);
    card.classList.toggle('active', tpl === state.template);
    card.setAttribute('aria-checked', tpl === state.template ? 'true' : 'false');
  });
}

/* ─── INIT ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Load saved data
  loadFromLS();

  // 2. Init all UI modules
  initTheme();
  initEditorTabs();
  initPanelTabs();
  initPersonalFields();
  initSkillsInputs();
  initEducation();
  initProjects();
  initExperience();
  initCertifications();
  initAchievements();
  initTemplateSelector();
  initZoom();
  initPDFButtons();
  initClearModal();
  initSampleDataButtons();
  initKeyboardShortcuts();

  // 3. Populate form fields + skills from loaded state
  populateUIFromState();

  // 4. Initial render of preview, score, and checklist
  renderPreview();
  updateATSScore();
  updateChecklist();

  // 5. Hide loading screen
  hideLoadingScreen();

  // 6. Auto-save on every input or change event
  document.addEventListener('input', debouncedUpdate);
  document.addEventListener('change', debouncedUpdate);
});

/* ─── Global functions (called from HTML onclick attrs) ─────── */
window.downloadPDF     = downloadPDF;
window.loadSampleData  = loadSampleData;
window.openClearModal  = openClearModal;
