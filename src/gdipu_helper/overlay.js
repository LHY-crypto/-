(() => {
  if (document.getElementById('gdipu-assist-root')) return;

  const SCHOOL_URL = 'https://study.gdipu.edu.cn/CloudPortal/CloudSquare';
  const pendingKey = 'gdipu-assist-pending-v5';
  const accountKey = 'gdipu-assist-account-v5';
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const timePattern = /20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}(?:\s*(?:至|[-—~])\s*(?:(?:20\d{2}[/-])?\d{1,2}[/-]\d{1,2}\s*)?\d{1,2}:\d{2})?/;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const root = document.createElement('div');
  root.id = 'gdipu-assist-root';
  root.innerHTML = `
    <style>
      #gdipu-assist-root{position:fixed;left:0;top:118px;bottom:0;z-index:2147483647;font-family:"Microsoft YaHei",sans-serif;color:#eaf6f6}
      #gdipu-assist-box{width:282px;height:100%;box-sizing:border-box;overflow:auto;background:linear-gradient(180deg,#102d32,#0b1c20 75%);border-right:1px solid #2b565c;box-shadow:6px 0 25px #001b214d;padding:20px 18px}
      #gdipu-assist-toggle{position:absolute;left:282px;top:18px;width:34px;height:46px;border:1px solid #3a6970;border-left:0;border-radius:0 9px 9px 0;background:#12383e;color:#eaf6f6;cursor:pointer;writing-mode:vertical-rl}
      #gdipu-assist-root.collapsed #gdipu-assist-box{width:0;padding:0;overflow:hidden;border:0}#gdipu-assist-root.collapsed #gdipu-assist-toggle{left:0}
      #gdipu-assist-box h3{margin:0;font-size:20px}#gdipu-assist-box .brand{color:#66dbd5;font-size:12px;margin:7px 0 18px}
      #gdipu-assist-box p,#gdipu-assist-box .tiny{color:#a9c2c5;font-size:11px;line-height:1.6}
      #gdipu-assist-box label{display:block;color:#aec5c8;font-size:12px;margin:9px 0 5px}
      #gdipu-assist-box input{width:100%;box-sizing:border-box;background:#0b2024;color:#fff;border:1px solid #3a6970;border-radius:8px;padding:9px}
      #gdipu-assist-box button{width:100%;border:1px solid #3a6970;border-radius:9px;padding:10px 12px;margin:9px 0 0;background:#1d4a50;color:#fff;cursor:pointer;text-align:left}
      #gdipu-assist-box button.primary{background:linear-gradient(135deg,#37d0c8,#20aaa8);color:#062326;font-weight:bold}
      #gdipu-assist-status{color:#74d8d3;min-height:40px;font-size:12px;line-height:1.55;margin-top:12px}
      #gdipu-task-list{font-size:11px;color:#d8eded;line-height:1.5}#gdipu-task-list .task{border-top:1px solid #31575d;padding:8px 0}
      #gdipu-assist-results{display:none;position:fixed;left:303px;right:4%;top:6%;bottom:6%;overflow:auto;color:#183236;background:#f7fbfb;border-radius:16px;box-shadow:0 16px 46px #00151a8c}
      #gdipu-assist-results .head{position:sticky;top:0;background:linear-gradient(135deg,#12383e,#1d6368);color:#fff;padding:22px 25px;z-index:1}
      #gdipu-assist-results h2{margin:0}#gdipu-assist-results table{width:100%;border-collapse:collapse}
      #gdipu-assist-results th,#gdipu-assist-results td{text-align:left;border-bottom:1px solid #dfebec;padding:14px 16px;vertical-align:top}
      #gdipu-assist-results th{background:#e7f3f3;color:#315a60}#gdipu-assist-results .assist{border:1px solid #36b8b2;background:#fff;color:#16716e;border-radius:7px;padding:7px 11px;cursor:pointer}
      #gdipu-assist-results .close{float:right;border:1px solid #b9dad8;background:transparent;color:#fff;border-radius:7px;padding:6px 11px;cursor:pointer}
    </style>
    <button id="gdipu-assist-toggle">收起</button>
    <div id="gdipu-assist-box">
      <h3>广轻活动帮抢</h3><div class="brand">无刷新 · 单次鼠标点击</div>
      <label for="gdipu-account">账号标识</label>
      <input id="gdipu-account" autocomplete="off" placeholder="学号或自定义别名（仅保存哈希）">
      <p>同一账号对同一活动只执行一次。请保持程序、网络和电脑运行。</p>
      <button id="gdipu-open">打开活动广场</button>
      <button id="gdipu-read" class="primary">读取可预约活动</button>
      <div id="gdipu-assist-status">等待读取活动。</div>
      <label>任务记录</label><div id="gdipu-task-list">输入账号标识后显示。</div>
    </div>
    <div id="gdipu-assist-results"></div>`;
  document.body.appendChild(root);

  const status = value => document.getElementById('gdipu-assist-status').textContent = value;
  const accountInput = document.getElementById('gdipu-account');
  accountInput.value = localStorage.getItem(accountKey) || '';
  accountInput.onchange = () => { localStorage.setItem(accountKey, accountInput.value.trim()); refreshTasks(); };
  document.getElementById('gdipu-assist-toggle').onclick = () => root.classList.toggle('collapsed');
  document.getElementById('gdipu-open').onclick = () => location.href = SCHOOL_URL;

  const documents = () => {
    const docs = [document];
    for (const frame of document.querySelectorAll('iframe')) {
      try { if (frame.contentDocument?.body) docs.push(frame.contentDocument); } catch (_) {}
    }
    return docs;
  };

  const activityBase = () => {
    const found = [];
    for (const doc of documents()) for (const heading of doc.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p')) {
      if (!heading.offsetParent || clean(heading.innerText) !== '活动基地') continue;
      let node = heading;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
        const cards = node.querySelectorAll('article,li,[class*="card" i],[class*="activity" i],[class*="item" i]').length;
        if (clean(node.innerText).includes('活动状态') && cards) found.push({root:node, heading});
      }
    }
    found.sort((a,b) => clean(a.root.innerText).length - clean(b.root.innerText).length);
    return found[0] || null;
  };

  const hash = value => {
    let result = 2166136261;
    for (let i = 0; i < value.length; i += 1) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619); }
    return (result >>> 0).toString(16);
  };

  const activityFromCard = (card, pageNumber) => {
    const lines = (card.innerText || '').split(/\n+/).map(clean).filter(Boolean);
    const title = clean(card.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="name" i]')?.innerText)
      || lines.find(line => line !== '活动' && !timePattern.test(line) && line !== '线上' && line !== '线下') || '';
    const time = lines.map(line => line.match(timePattern)?.[0]).filter(Boolean).pop() || '';
    const anchor = card.matches('a[href]') ? card : card.querySelector('a[href]');
    const href = anchor?.href || '';
    const rawId = card.dataset?.id || card.getAttribute('data-activity-id') || anchor?.dataset?.id || href;
    const locationLine = lines.find(line => /(校区|教学楼|教室|楼|馆|中心|基地|广场|操场|礼堂|会议室|线上问卷|直播)/.test(line));
    return {activityId: rawId ? hash(rawId) : hash(`${title}|${time}`), title, time, location: clean(locationLine || ''), href, pageNumber};
  };

  const collectCurrentPage = (pageNumber, rows, seen) => {
    const scope = activityBase();
    if (!scope) return;
    const cards = [...scope.root.querySelectorAll('.container.card-list-item')]
      .filter(card => card.offsetParent && timePattern.test(clean(card.innerText)));
    for (const card of cards) {
      if (/班级活动|报名已结束|活动已结束/.test(clean(card.innerText))) continue;
      const row = activityFromCard(card, pageNumber);
      if (!row.title || !row.time || seen.has(row.activityId)) continue;
      seen.add(row.activityId); rows.push(row);
    }
  };

  const pageButton = pageNumber => {
    const scope = activityBase();
    if (!scope) return null;
    return [...scope.root.querySelectorAll('li.number,button.number,a.number')]
      .find(button => button.offsetParent && clean(button.innerText) === String(pageNumber)) || null;
  };

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  const chooseUnstarted = async () => {
    const scope = activityBase();
    if (!scope) return false;
    const statusItems = [...scope.root.querySelectorAll('.tag-radio-item,[role="tab"],button,li,span,div')]
      .filter(item => item.offsetParent && clean(item.innerText) === '未开始');
    statusItems.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    const target = statusItems[0];
    if (!target) return false;
    if (!/(^|\s)active(\s|$)/.test(target.className || '')) {
      target.click();
      await wait(800);
    }
    return true;
  };

  const collectAllPages = async () => {
    if (!await chooseUnstarted()) return [];
    const rows = [], seen = new Set();
    const first = pageButton(1);
    if (first && !/(^|\s)active(\s|$)/.test(first.className || '')) {
      first.click(); await wait(700);
    }
    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
      collectCurrentPage(pageNumber, rows, seen);
      const next = pageButton(pageNumber + 1);
      if (!next || /disabled/.test(next.className || '')) break;
      status(`正在读取未开始活动：第 ${pageNumber + 1} 页…`);
      next.click(); await wait(700);
    }
    return rows;
  };

  const findCard = row => {
    const candidates = [];
    const scope = activityBase();
    if (!scope) return null;
    for (const el of scope.root.querySelectorAll('.container.card-list-item')) {
      if (el.offsetParent && clean(el.innerText).includes(row.title) && clean(el.innerText).includes(row.time.slice(0, 10))) candidates.push(el);
    }
    candidates.sort((a,b) => clean(a.innerText).length - clean(b.innerText).length);
    return candidates[0] || null;
  };

  const openActivity = async row => {
    const destination = pageButton(row.pageNumber || 1);
    if (destination && !/(^|\s)active(\s|$)/.test(destination.className || '')) {
      destination.click(); await wait(700);
    }
    const card = findCard(row);
    const target = card?.matches('a[href]') ? card : card?.querySelector('a[href],button') || card;
    if (target) { target.click(); return true; }
    if (row.href) { location.href = row.href; return true; }
    return false;
  };

  const show = rows => {
    const panel = document.getElementById('gdipu-assist-results');
    panel.innerHTML = `<div class="head"><button class="close">关闭</button><h2>可预约活动 ${rows.length} 项</h2></div><table><thead><tr><th>活动</th><th>时间</th><th>地点</th><th>操作</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td><strong>${escapeHtml(row.title)}</strong></td><td>${escapeHtml(row.time)}</td><td>${escapeHtml(row.location || '—')}</td><td><button class="assist" data-index="${index}">帮抢</button></td></tr>`).join('')}</tbody></table>`;
    panel.style.display = 'block';
    panel.querySelector('.close').onclick = () => panel.style.display = 'none';
    panel.querySelectorAll('.assist').forEach(button => button.onclick = () => prepare(rows[Number(button.dataset.index)]));
  };

  const prepare = async row => {
    const account = accountInput.value.trim();
    if (!account) { status('请先填写账号标识。'); accountInput.focus(); return; }
    localStorage.setItem(accountKey, account);
    sessionStorage.setItem(pendingKey, JSON.stringify({account, row, startedAt:Date.now()}));
    status(`正在读取“${row.title}”的报名开始时间…`);
    document.getElementById('gdipu-assist-results').style.display = 'none';
    if (!await openActivity(row)) {
      sessionStorage.removeItem(pendingKey); status('找不到活动入口，未建立任务。'); return;
    }
    setTimeout(resumePending, 400);
  };

  const currentTargetUrl = title => {
    for (const doc of documents()) {
      try { if (clean(doc.body?.innerText).includes(title)) return doc.location.href; } catch (_) {}
    }
    return location.href;
  };

  const parseStart = text => {
    const marker = text.search(/活动报名时间|报名时间/);
    const fragment = marker >= 0 ? text.slice(marker, marker + 220) : text;
    const range = fragment.match(timePattern)?.[0] || '';
    const start = range.match(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}/)?.[0] || '';
    if (!start) return null;
    const isoLocal = start.replace(/\//g, '-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}:\d{2})$/, (_,y,m,d,t)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${t}`);
    const date = new Date(isoLocal);
    return Number.isFinite(date.getTime()) ? {date, range} : null;
  };

  let pendingAttempts = 0;
  const resumePending = async () => {
    const raw = sessionStorage.getItem(pendingKey);
    if (!raw) return;
    let pending;
    try { pending = JSON.parse(raw); } catch (_) { sessionStorage.removeItem(pendingKey); return; }
    const text = documents().map(doc => doc.body?.innerText || '').join('\n');
    const parsed = parseStart(text);
    if (!text.includes(pending.row.title) || !parsed) {
      pendingAttempts += 1;
      if (pendingAttempts < 30) { setTimeout(resumePending, 400); return; }
      sessionStorage.removeItem(pendingKey); status('未能读取报名时间，未建立帮抢任务。'); return;
    }
    if (parsed.date.getTime() <= Date.now()) {
      sessionStorage.removeItem(pendingKey); status('该活动的报名开始时间已经过去，未建立任务。'); return;
    }
    try {
      const result = await window.pywebview.api.schedule_task({
        account: pending.account,
        activityId: pending.row.activityId,
        title: pending.row.title,
        runAt: parsed.date.toISOString(),
        targetUrl: currentTargetUrl(pending.row.title)
      });
      sessionStorage.removeItem(pendingKey); status(result.message || '任务处理完成。'); refreshTasks();
    } catch (error) { status(`建立任务失败：${error}`); }
  };

  const refreshTasks = async () => {
    const account = accountInput.value.trim();
    if (!account || !window.pywebview?.api) return;
    try {
      const response = await window.pywebview.api.list_tasks(account);
      const holder = document.getElementById('gdipu-task-list');
      if (!response.ok || !response.tasks.length) { holder.textContent = '暂无记录。'; return; }
      const labels = {scheduled:'待执行', claimed:'执行中', attempted:'已执行一次', cancelled:'已取消', unknown:'状态未知'};
      holder.innerHTML = response.tasks.slice(0,8).map(task => `<div class="task"><strong>${escapeHtml(task.title)}</strong><br>${escapeHtml(labels[task.state] || task.state)} · ${escapeHtml(new Date(task.run_at).toLocaleString())}${task.state === 'scheduled' ? `<br><button class="cancel-task" data-id="${escapeHtml(task.activity_id)}">取消任务</button>` : ''}</div>`).join('');
      holder.querySelectorAll('.cancel-task').forEach(button => button.onclick = async () => {
        const result = await window.pywebview.api.cancel_task(account, button.dataset.id);
        status(result.message || '任务已处理。'); refreshTasks();
      });
    } catch (_) {}
  };

  document.getElementById('gdipu-read').onclick = async () => {
    status('正在切换到“未开始”并读取活动…');
    const rows = await collectAllPages();
    status(rows.length ? `找到 ${rows.length} 项可预约活动。` : '未找到可预约活动，请确认处于“活动基地”的“未开始”列表。');
    show(rows);
  };
  window.addEventListener('pywebviewready', () => { resumePending(); refreshTasks(); });
  setTimeout(resumePending, 500);
  setInterval(refreshTasks, 3000);
})();

