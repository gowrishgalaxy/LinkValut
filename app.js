// ============================================================
// STATE
// ============================================================
let links = JSON.parse(localStorage.getItem('linkvault_links') || '[]');
let currentFilter = 'all';
let currentCluster = 'all';
let currentView = 'grid';
let isLight = false;

const PLATFORM_MAP = {
  youtube: { label: 'YouTube', css: 'yt', bar: 'bar-yt', icon: '▶', emoji: '▶' },
  instagram: { label: 'Instagram', css: 'ig', bar: 'bar-ig', icon: '📷', emoji: '📷' },
  twitter: { label: 'Twitter/X', css: 'tw', bar: 'bar-tw', icon: '𝕏', emoji: '𝕏' },
  linkedin: { label: 'LinkedIn', css: 'li', bar: 'bar-li', icon: '💼', emoji: '💼' },
  facebook: { label: 'Facebook', css: 'fb', bar: 'bar-fb', icon: '👥', emoji: '👥' },
  threads: { label: 'Threads', css: 'th', bar: 'bar-th', icon: '🧵', emoji: '🧵' },
  website: { label: 'Website', css: 'ws', bar: 'bar-ws', icon: '🔗', emoji: '🔗' },
  document: { label: 'Document', css: 'dc', bar: 'bar-dc', icon: '📄', emoji: '📄' },
  profile: { label: 'Profile', css: 'pr', bar: 'bar-pr', icon: '👤', emoji: '👤' },
  other: { label: 'Other', css: 'ot', bar: 'bar-ot', icon: '🌐', emoji: '🌐' },
};

const BAR_COLORS = {
  youtube: '#ff4444', instagram: '#e1306c', twitter: '#1da1f2',
  linkedin: '#0077b5', facebook: '#1877f2', threads: '#aaa',
  website: '#6dfabc', document: '#fac86d', profile: '#fa6d8e', other: '#7c6dfa'
};

// ============================================================
// PLATFORM DETECTION
// ============================================================
function detectPlatform(url) {
  url = url.toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('instagram.com')) return url.includes('/p/') || url.includes('/reel/') ? 'instagram' : 'profile';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('linkedin.com')) return url.includes('/in/') ? 'profile' : 'linkedin';
  if (url.includes('facebook.com') || url.includes('fb.com')) return 'facebook';
  if (url.includes('threads.net')) return 'threads';
  if (url.endsWith('.pdf') || url.includes('docs.google.com') || url.includes('drive.google.com') || url.includes('.doc')) return 'document';
  return 'website';
}

function generateTitle(url, platform) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\//g, ' ').replace(/-|_/g, ' ').trim();
    const domain = u.hostname.replace('www.','');
    if (path.length > 3) {
      return (domain + ': ' + path.split(' ').slice(0,6).join(' ')).slice(0, 80);
    }
    return domain;
  } catch { return url.slice(0,60); }
}

async function analyzeWithAI(url, existingTitle) {
  showToast('🤖 AI analyzing link…', '⏳');
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Analyze this URL and respond ONLY with a JSON object (no markdown, no backticks, no extra text):
URL: ${url}
Existing title hint: ${existingTitle || 'none'}

Return JSON with these exact fields:
{
  "title": "descriptive human-readable title (max 80 chars)",
  "cluster": "one of: Technology, Business, Education, Entertainment, News, Health, Science, Finance, Design, Sports, Food, Travel, Politics, Other",
  "summary": "one sentence about what this link is about",
  "tags": ["tag1", "tag2", "tag3"],
  "isProfile": false
}

Base your title and cluster on the URL domain and path. Be specific and informative.`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ============================================================
// LINK MANAGEMENT
// ============================================================
async function quickAddLink() {
  const url = document.getElementById('quickAdd').value.trim();
  if (!url || !url.startsWith('http')) { showToast('Please enter a valid URL', '⚠️'); return; }
  document.getElementById('quickAdd').value = '';
  await addLinkFromURL(url);
}

async function addLinkFromURL(url, customTitle = '', notes = '', tags = []) {
  const platform = detectPlatform(url);
  const fallbackTitle = customTitle || generateTitle(url, platform);

  const tempId = Date.now().toString();
  const tempLink = {
    id: tempId, url, title: fallbackTitle, platform,
    cluster: 'Analyzing…', summary: '', tags, notes,
    timestamp: Date.now(), analyzing: true
  };
  links.unshift(tempLink);
  save(); renderLinks(); updateCounts();

  const ai = await analyzeWithAI(url, customTitle);
  const idx = links.findIndex(l => l.id === tempId);
  if (idx !== -1 && ai) {
    links[idx].title = customTitle || ai.title || fallbackTitle;
    links[idx].cluster = ai.cluster || 'Other';
    links[idx].summary = ai.summary || '';
    links[idx].tags = [...(tags || []), ...(ai.tags || [])];
    if (ai.isProfile) links[idx].platform = 'profile';
    links[idx].analyzing = false;
  } else if (idx !== -1) {
    links[idx].cluster = 'Other';
    links[idx].analyzing = false;
  }

  save(); renderLinks(); updateCounts(); updateClusters();
  showToast('Link saved & categorized!', '✅');
}

function saveLink() {
  const url = document.getElementById('m-url').value.trim();
  if (!url) return;
  const title = document.getElementById('m-title').value.trim();
  const notes = document.getElementById('m-notes').value.trim();
  const tags = document.getElementById('m-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  closeModal();
  addLinkFromURL(url, title, notes, tags);
}

function deleteLink(id) {
  links = links.filter(l => l.id !== id);
  save(); renderLinks(); updateCounts(); updateClusters();
  showToast('Link deleted', '🗑');
}

function openEdit(id) {
  const l = links.find(l=>l.id===id);
  if (!l) return;
  document.getElementById('e-id').value = id;
  document.getElementById('e-url').value = l.url;
  document.getElementById('e-title').value = l.title;
  document.getElementById('e-platform').value = l.platform;
  document.getElementById('e-notes').value = l.notes || '';
  document.getElementById('e-tags').value = (l.tags||[]).join(', ');
  document.getElementById('editModal').classList.add('open');
}

function updateLink() {
  const id = document.getElementById('e-id').value;
  const idx = links.findIndex(l=>l.id===id);
  if (idx===-1) return;
  links[idx].url = document.getElementById('e-url').value;
  links[idx].title = document.getElementById('e-title').value;
  links[idx].platform = document.getElementById('e-platform').value;
  links[idx].notes = document.getElementById('e-notes').value;
  links[idx].tags = document.getElementById('e-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  save(); closeEditModal(); renderLinks(); updateCounts();
  showToast('Link updated!', '✏️');
}

function clearAll() {
  if (!confirm('Clear all links? This cannot be undone.')) return;
  links = []; save(); renderLinks(); updateCounts(); updateClusters();
  showToast('All links cleared', '🗑');
}

function save() { localStorage.setItem('linkvault_links', JSON.stringify(links)); }

// ============================================================
// RENDER
// ============================================================
function getFiltered() {
  let result = links;
  if (currentFilter !== 'all') result = result.filter(l => l.platform === currentFilter);
  if (currentCluster !== 'all') result = result.filter(l => l.cluster === currentCluster);
  const q = document.getElementById('searchInput')?.value?.toLowerCase() || '';
  if (q) result = result.filter(l =>
    l.title.toLowerCase().includes(q) ||
    l.url.toLowerCase().includes(q) ||
    (l.tags||[]).some(t=>t.toLowerCase().includes(q)) ||
    (l.summary||'').toLowerCase().includes(q)
  );
  const sort = document.getElementById('sortSelect')?.value || 'newest';
  if (sort === 'newest') result.sort((a,b)=>b.timestamp-a.timestamp);
  else if (sort === 'oldest') result.sort((a,b)=>a.timestamp-b.timestamp);
  else if (sort === 'title') result.sort((a,b)=>a.title.localeCompare(b.title));
  else if (sort === 'platform') result.sort((a,b)=>a.platform.localeCompare(b.platform));
  return result;
}

function renderLinks() {
  const grid = document.getElementById('linksGrid');
  const filtered = getFiltered();
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🔗</div>
      <h3>No links yet</h3>
      <p>Paste a URL in the bar above or use MacroDroid<br/>to automatically capture copied links from your phone.</p>
    </div>`;
    return;
  }
  grid.innerHTML = filtered.map(l => renderCard(l)).join('');
}

function renderCard(l) {
  const p = PLATFORM_MAP[l.platform] || PLATFORM_MAP.other;
  const color = BAR_COLORS[l.platform] || '#7c6dfa';
  const date = new Date(l.timestamp).toLocaleDateString('en-US', {month:'short',day:'numeric'});
  const tags = (l.tags||[]).slice(0,3).map(t=>`<span style="background:var(--surface2);padding:2px 7px;border-radius:10px;font-size:10px;color:var(--muted)">${t}</span>`).join('');
  const isListView = currentView === 'list';
  
  return `<div class="link-card" style="${l.analyzing ? 'opacity:0.7' : ''}">
    <div class="card-top" style="background:${color}"></div>
    <div class="card-body">
      <div class="card-header">
        <span class="platform-badge ${p.css}">${p.label}</span>
        <div class="card-title">${l.analyzing ? '⏳ Analyzing…' : escapeHtml(l.title)}</div>
      </div>
      ${!isListView ? `<div class="card-url">${escapeHtml(l.url.slice(0,70))}${l.url.length>70?'…':''}</div>` : ''}
      ${l.summary && !isListView ? `<div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.5">${escapeHtml(l.summary)}</div>` : ''}
      ${tags && !isListView ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">${tags}</div>` : ''}
      <div class="card-meta">
        <span class="card-category">📁 ${l.cluster || 'Uncategorized'}</span>
        <span class="card-time">${date}</span>
        <div class="card-actions">
          <button class="card-action-btn" onclick="window.open('${l.url}','_blank')">↗ Open</button>
          <button class="card-action-btn" onclick="openEdit('${l.id}')">✏</button>
          <button class="card-action-btn" onclick="copyToClip('${l.url}')" title="Copy URL">⎘</button>
          <button class="card-action-btn" onclick="deleteLink('${l.id}')" style="color:var(--accent2)">🗑</button>
        </div>
      </div>
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// FILTERS & CLUSTERS
// ============================================================
function setFilter(f) {
  currentFilter = f;
  currentCluster = 'all';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('f-' + f);
  if (el) el.classList.add('active');
  renderLinks(); resetClusterTabs();
}

function setCluster(c) {
  currentCluster = c;
  document.querySelectorAll('.cluster-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderLinks();
}

function resetClusterTabs() {
  document.querySelectorAll('.cluster-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.cluster-tab')?.classList.add('active');
}

function updateCounts() {
  const today = new Date().toDateString();
  document.getElementById('total-count').textContent = links.length;
  document.getElementById('today-count').textContent = links.filter(l => new Date(l.timestamp).toDateString() === today).length;

  const platforms = new Set(links.map(l=>l.platform));
  document.getElementById('platform-count').textContent = platforms.size;

  Object.keys(PLATFORM_MAP).forEach(p => {
    const el = document.getElementById('count-' + p);
    if (el) el.textContent = links.filter(l=>l.platform===p).length;
  });
  const el = document.getElementById('count-all');
  if (el) el.textContent = links.length;
}

function updateClusters() {
  const clusters = {};
  links.forEach(l => {
    if (l.cluster && l.cluster !== 'Analyzing…') {
      clusters[l.cluster] = (clusters[l.cluster]||0) + 1;
    }
  });

  document.getElementById('cluster-count').textContent = Object.keys(clusters).length;

  const sb = document.getElementById('cluster-sidebar');
  sb.innerHTML = Object.entries(clusters).sort((a,b)=>b[1]-a[1]).map(([name,cnt]) =>
    `<div class="filter-chip" onclick="setClusterFromSidebar('${name}',this)">
      <span class="chip-icon">🏷</span>${name}
      <span class="chip-count">${cnt}</span>
    </div>`
  ).join('');

  const tabs = document.getElementById('cluster-tabs');
  tabs.innerHTML = `<div class="cluster-tab active" onclick="setCluster('all')">All Topics</div>` +
    Object.entries(clusters).sort((a,b)=>b[1]-a[1]).map(([name,cnt]) =>
      `<div class="cluster-tab" onclick="setCluster('${name}')">${name} <span style="opacity:0.6;font-size:10px">${cnt}</span></div>`
    ).join('');
}

function setClusterFromSidebar(name, el) {
  currentCluster = name;
  currentFilter = 'all';
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderLinks();
}

// ============================================================
// MODAL / UI
// ============================================================
function openAddModal() { document.getElementById('addModal').classList.add('open'); }
function closeModal() { document.getElementById('addModal').classList.remove('open'); }
function closeEditModal() { document.getElementById('editModal').classList.remove('open'); }
function openSettings() { document.getElementById('settingsPanel').classList.add('open'); }
function closeSettings() { document.getElementById('settingsPanel').classList.remove('open'); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }

function autoDetectPlatform() {
  const url = document.getElementById('m-url').value;
  document.getElementById('m-platform').value = detectPlatform(url);
}

function setView(v) {
  currentView = v;
  const grid = document.getElementById('linksGrid');
  grid.classList.toggle('list-view', v === 'list');
  document.getElementById('grid-btn').classList.toggle('active', v === 'grid');
  document.getElementById('list-btn').classList.toggle('active', v === 'list');
  renderLinks();
}

function toggleTheme() {
  isLight = !isLight;
  document.body.classList.toggle('theme-light', isLight);
  document.querySelector('header').style.background = isLight ? 'rgba(240,240,248,0.9)' : 'rgba(10,10,15,0.85)';
}

function toggleCompact() {
  document.querySelectorAll('.link-card').forEach(c => c.style.fontSize = c.style.fontSize ? '' : '12px');
}

function setAccent(color, el) {
  document.documentElement.style.setProperty('--accent', color);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

function copyToClip(text) {
  navigator.clipboard.writeText(text).then(() => showToast('URL copied!', '⎘'));
}

let toastTimer;
function showToast(msg, icon = '✅') {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  document.getElementById('toast-icon').textContent = icon;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ============================================================
// EXPORT
// ============================================================
function exportLinks() {
  const blob = new Blob([JSON.stringify(links, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'linkvault-export.json'; a.click();
  showToast('Exported as JSON!', '📤');
}

function exportCSV() {
  const rows = [['Title','URL','Platform','Cluster','Tags','Date','Notes']];
  links.forEach(l => rows.push([
    `"${(l.title||'').replace(/"/g,'""')}"`,
    l.url, l.platform, l.cluster||'',
    `"${(l.tags||[]).join(', ')}"`,
    new Date(l.timestamp).toLocaleDateString(),
    `"${(l.notes||'').replace(/"/g,'""')}"`
  ]));
  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'linkvault-export.csv'; a.click();
  showToast('Exported as CSV!', '📊');
}

function exportMarkdown() {
  const clusters = {};
  links.forEach(l => {
    const c = l.cluster || 'Other';
    if (!clusters[c]) clusters[c] = [];
    clusters[c].push(l);
  });
  let md = '# LinkVault Export\n\n';
  Object.entries(clusters).forEach(([name, ls]) => {
    md += `## ${name}\n\n`;
    ls.forEach(l => { md += `- [${l.title}](${l.url})${l.summary ? ' — ' + l.summary : ''}\n`; });
    md += '\n';
  });
  const blob = new Blob([md], {type:'text/markdown'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'linkvault-export.md'; a.click();
  showToast('Exported as Markdown!', '📝');
}

function importLinks() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = e => {
    const fr = new FileReader();
    fr.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          links = [...links, ...imported];
          save(); renderLinks(); updateCounts(); updateClusters();
          showToast(`Imported ${imported.length} links!`, '📥');
        }
      } catch { showToast('Invalid JSON file', '⚠️'); }
    };
    fr.readAsText(e.target.files[0]);
  };
  inp.click();
}

document.getElementById('addModal').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
document.getElementById('editModal').addEventListener('click', e => { if(e.target===e.currentTarget) closeEditModal(); });

function loadDemo() {
  if (links.length > 0) return;
  const demos = [
    { url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title:'AI in 2025: Complete Overview', platform:'youtube', cluster:'Technology', tags:['AI','overview'], summary:'A comprehensive overview of AI developments', timestamp: Date.now()-86400000*2 },
    { url:'https://www.instagram.com/p/example/', title:'Beautiful UI Design Inspo', platform:'instagram', cluster:'Design', tags:['UI','design'], summary:'Stunning interface design inspiration', timestamp: Date.now()-86400000 },
    { url:'https://twitter.com/sama/status/123', title:'Sam Altman on the future of AI agents', platform:'twitter', cluster:'Technology', tags:['AI','agents'], summary:'Sam Altman discusses AI agents', timestamp: Date.now()-3600000*5 },
    { url:'https://linkedin.com/in/satyanadella', title:'Satya Nadella — Microsoft CEO', platform:'profile', cluster:'Business', tags:['CEO','Microsoft'], summary:'LinkedIn profile of Microsoft CEO', timestamp: Date.now()-3600000*3 },
    { url:'https://docs.google.com/document/d/1abc', title:'Q4 Strategy Document', platform:'document', cluster:'Business', tags:['strategy','Q4'], summary:'Internal strategy planning document', timestamp: Date.now()-3600000 },
    { url:'https://vercel.com/blog/next-js-15', title:'Next.js 15 Release Notes', platform:'website', cluster:'Technology', tags:['nextjs','webdev'], summary:'What\'s new in Next.js 15', timestamp: Date.now()-7200000 },
    { url:'https://threads.net/@zuck', title:'Mark Zuckerberg on Threads', platform:'threads', cluster:'Technology', tags:['meta','social'], summary:'Zuckerberg\'s Threads account', timestamp: Date.now()-900000 },
    { url:'https://facebook.com/groups/developers', title:'Developer Community Group', platform:'facebook', cluster:'Technology', tags:['community','dev'], summary:'Active developer community on Facebook', timestamp: Date.now()-1800000 },
  ].map(d => ({...d, id: Math.random().toString(36).slice(2), analyzing: false}));
  links = demos;
  save();
}

window.addEventListener('DOMContentLoaded', () => {
  renderLinks();
  updateCounts();
  updateClusters();
});
