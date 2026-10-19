(() => {
  if (document.getElementById('gdipu-assist-root')) return;

  const SCHOOL_URL = 'https://study.gdipu.edu.cn/CloudPortal/CloudSquare';
  const pageRetryKey = 'gdipu-assist-page-retry-v5';
  const pendingKey = 'gdipu-assist-pending-v5';
  const accountKey = 'gdipu-assist-account-v5';
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const timePattern = /20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}(?:\s*(?:至|[-—~])\s*(?:(?:20\d{2}[/-])?\d{1,2}[/-]\d{1,2}\s*)?\d{1,2}:\d{2})?/;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // The school's Vue application occasionally stays empty on the first cold
  // load even though the document itself finished loading. Retry once so the
  // login page is available instead of leaving a white window.
  const siteRoot = document.getElementById('app');
  const siteIsBlank = siteRoot && siteRoot.childElementCount === 0 && !clean(siteRoot.innerText);
  if (siteIsBlank && sessionStorage.getItem(pageRetryKey) !== 'done') {
    sessionStorage.setItem(pageRetryKey, 'done');
    setTimeout(() => location.reload(), 500);
    return;
  }
  if (!siteIsBlank) sessionStorage.removeItem(pageRetryKey);

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
  document.getElementById('gdipu-open').onclick = () => {
    if (location.href === SCHOOL_URL) location.reload();
    else location.href = SCHOOL_URL;
  };

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

  // ── 真实页面结构(2026-10-19 实测)─────────────────────────────
  // 活动广场有三个区块:
  //   [0] 「校官方活动预告」 ul.d-list   13 项宣讲会,不受筛选项影响
  //   [1] 「大热门」       .card-list   8 项老活动,不受筛选项影响
  //   [2] (无标题)         .card-list   受「类型/状态」筛选影响,带 .el-pager 分页
  //                                                      ↑ 要读这个
  // 每张卡里挂了 Vue 组件, $props.model 就是活动对象:
  //   { wid, dataType('HD'|'XJH'), seminarName/activityName,
  //     startTime, endTime, countNum, activityAddr/addressName }
  // 报名时间不在 model 里,只有详情页有,靠隐藏 iframe 读(见 fetchSignupTime)。
  const cardListRoot = () => {
    for (const pager of document.querySelectorAll('.el-pager')) {
      const section = pager.closest('.section') || pager.closest('.sec-con');
      const list = section?.querySelector('.card-list');
      if (list) return list;
    }
    return null;
  };

  const listRoot = () => cardListRoot();

  const modelOf = card => {
    let node = card, depth = 0;
    while (node && depth < 15) {
      const props = node.__vue__?.$props;
      if (props && props.model && typeof props.model === 'object') return props.model;
      node = node.parentElement; depth += 1;
    }
    return null;
  };

  const activityFromCard = (card, pageNumber) => {
    const model = modelOf(card);
    const pick = (a, b) => clean(a || b || '');
    const title = model ? pick(model.seminarName, model.activityName)
      : clean(card.querySelector('.a-name')?.innerText);
    const timeText = clean(card.querySelector('.a-time')?.innerText);
    const time = timeText.match(timePattern)?.[0] || timeText;
    const location = model ? pick(model.activityAddr, model.addressName)
      : clean(card.querySelector('.a-address')?.innerText);
    const dataType = model?.dataType || '';
    const count = model && model.countNum !== undefined && model.countNum !== null ? String(model.countNum) : '';
    const rawId = model?.wid || `${title}|${time}`;
    return {
      activityId: hash(String(rawId)), wid: model?.wid ? String(model.wid) : '',
      dataType, title, time, location, count,
      status: '', signupTime: '', pageNumber,
      hasAction: true,
    };
  };

  const collectCurrentPage = (pageNumber, rows, seen) => {
    const list = cardListRoot();
    if (!list) return;
    const cards = [...list.querySelectorAll('.container.card-list-item')]
      .filter(card => card.offsetParent);
    for (const card of cards) {
      const row = activityFromCard(card, pageNumber);
      if (!row.title || seen.has(row.activityId)) continue;
      seen.add(row.activityId); rows.push(row);
    }
  };

  const pageButton = pageNumber => {
    for (const pager of document.querySelectorAll('.el-pager')) {
      const section = pager.closest('.section') || pager.closest('.sec-con');
      if (!section?.querySelector('.card-list')) continue;
      const hit = [...pager.querySelectorAll('li')]
        .find(li => li.offsetParent && clean(li.innerText) === String(pageNumber));
      if (hit) return hit;
    }
    return null;
  };

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  // 筛选栏是 .tag-radio-item,分两组:活动类型(全部/招聘会/宣讲会/学生活动/社团活动)
  // 和活动状态(全部/进行中/未开始/已结束)。旧代码在整棵树里按「子元素最少」
  // 挑节点,会挑中卡片角标,点了等于没点。这里只认 .tag-radio-item,且取最后一个匹配。
  const clickTab = async text => {
    const items = [...document.querySelectorAll('.tag-radio-item')]
      .filter(item => item.offsetParent && clean(item.innerText) === text);
    const target = items[items.length - 1];
    if (!target) return false;
    if (!/is-active|active/.test(target.className || '')) {
      target.click();
      await wait(1200);
    }
    return true;
  };

  const chooseUnstarted = () => clickTab('未开始');

  const TYPES = ['全部', '招聘会', '宣讲会', '学生活动', '社团活动'];
  const STATES = ['全部', '进行中', '未开始', '已结束'];
  const ALL_CACHE_KEY = 'gdipu-assist-all-cache-v1';

  const pagerCount = () => {
    for (const pager of document.querySelectorAll('.el-pager')) {
      const section = pager.closest('.section') || pager.closest('.sec-con');
      if (section?.querySelector('.card-list')) return pager.querySelectorAll('li').length || 1;
    }
    return 1;
  };

  // 门户分页器上的「共 N 条」是服务端返回的总数,可能和实际渲染出来的卡片数不一致。
  // 实测 2026-10-19:未开始显示「共 72 条」,但六页加起来只有 71 张卡(第 4 页少一张)。
  // 把两个数都摆出来,免得把学校的口径差当成读取漏项。
  const pagerAuthoritativeTotal = () => {
    const el = document.querySelector('.el-pagination__total');
    return el ? clean(el.innerText) : '';
  };

  // 全量扫描:5 种类型 × 4 种状态,把所有分页都走一遍。
  // 门户自带的搜索框只覆盖「进行中」,搜不到未开始的活动,所以只能自己扫。
  const scanEverything = async onProgress => {
    const seen = new Map();
    let combos = 0;
    for (const type of TYPES) {
      for (const state of STATES) {
        combos += 1;
        onProgress?.(`正在扫描 ${combos}/${TYPES.length * STATES.length}：${type} / ${state}`);
        await clickTab(type);
        await clickTab(state);
        const pages = Math.min(pagerCount(), 12);
        for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
          if (pageNumber > 1) {
            const btn = pageButton(pageNumber);
            if (!btn) break;
            btn.click(); await wait(1500);
          }
          const list = cardListRoot();
          if (!list) break;
          for (const card of list.querySelectorAll('.container.card-list-item')) {
            const row = activityFromCard(card, pageNumber);
            if (!row.title) continue;
            if (!seen.has(row.activityId)) {
              row.firstSeenAs = `${type}/${state}`;
              seen.set(row.activityId, row);
            }
          }
        }
      }
    }
    const all = [...seen.values()];
    try { sessionStorage.setItem(ALL_CACHE_KEY, '1'); } catch (_) {}
    return all;
  };

  const collectAllPages = async () => {
    await chooseUnstarted();
    const rows = [], seen = new Set();
    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
      collectCurrentPage(pageNumber, rows, seen);
      const next = pageButton(pageNumber + 1);
      if (!next) break;
      status(`正在读取第 ${pageNumber + 1} 页…`);
      next.click(); await wait(1400);
    }
    const authoritative = pagerAuthoritativeTotal();
    if (authoritative && rows.length !== Number(authoritative.replace(/\D/g, ''))) {
      status(`读取完成 ${rows.length} 项。门户口径「${authoritative}」—— 页面实际渲染的卡片数可能少于服务端总数,这是学校页面自己的差异。`);
    }
    return rows;
  };

  const findCard = row => {
    const list = cardListRoot();
    if (!list) return null;
    return [...list.querySelectorAll('.container.card-list-item')].find(card => {
      const model = modelOf(card);
      if (model?.wid && row.wid) return String(model.wid) === String(row.wid);
      return clean(card.querySelector('.a-name')?.innerText) === row.title;
    }) || null;
  };

  const openActivity = async row => {
    if (row.pageNumber > 1) {
      const target = pageButton(row.pageNumber);
      if (target && !/is-active|active/.test(target.className || '')) {
        target.click(); await wait(1200);
      }
    }
    const card = findCard(row);
    if (!card) return false;
    const clickable = card.querySelector('a[href],button,[class*="action"]') || card;
    clickable.click();
    await wait(600);
    return true;
  };

  // 报名时间只在详情页里。用隐藏 iframe 渲染一次再读文本,
  // 不调用任何接口、不离开列表页。
  const SIGNUP_MARKER = /活动报名时间|报名时间/;
  const fetchSignupTime = (wid, dataType) => new Promise(resolve => {
    if (!wid) { resolve(''); return; }
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;height:900px;border:0;';
    frame.src = `/CloudPortal/CloudActivityDetail?wid=${encodeURIComponent(wid)}&dataType=${encodeURIComponent(dataType || 'HD')}`;
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      try { frame.remove(); } catch (_) {}
      resolve(value);
    };
    frame.onload = () => setTimeout(() => {
      let text = '';
      try {
        const doc = frame.contentDocument;
        text = doc ? (doc.getElementById('app')?.innerText || doc.body.innerText || '') : '';
      } catch (_) { text = ''; }
      const hit = text.match(SIGNUP_MARKER);
      if (!hit) { finish(''); return; }
      const chunk = text.slice(hit.index, hit.index + 200);
      const range = chunk.match(timePattern)?.[0] || '';
      finish(range);
    }, 2000);
    setTimeout(() => finish(''), 15000);
    document.body.appendChild(frame);
  });

  // 全量扫描结果留在内存里,搜索时不再重新扫。
  let allActivities = null;
  let currentRows = [];

  const renderRows = (panel, rows) => {
    currentRows = rows;
    const body = panel.querySelector('tbody');
    body.innerHTML = rows.map((row, index) =>
      `<tr data-i="${index}"><td><strong>${escapeHtml(row.title)}</strong>${row.firstSeenAs ? `<br><span class="tiny">${escapeHtml(row.firstSeenAs)}</span>` : ''}</td><td>${escapeHtml(row.time || '—')}</td><td class="signup">${escapeHtml(row.signupTime || '—')}</td><td>${escapeHtml(row.count === '' ? '—' : row.count)}</td><td>${escapeHtml(row.location || '—')}</td><td><button class="assist" data-index="${index}">帮抢</button></td></tr>`
    ).join('') || '<tr><td colspan="6">没有匹配的活动。</td></tr>';
    body.querySelectorAll('.assist').forEach(button => {
      button.onclick = () => prepare(currentRows[Number(button.dataset.index)]);
    });
  };

  const show = rows => {
    const panel = document.getElementById('gdipu-assist-results');
    const initial = allActivities || rows;
    panel.innerHTML = `<div class="head">
      <button class="close">关闭</button>
      <h2>活动列表 <span id="gdipu-total">${initial.length}</span> 项</h2>
      <p class="tiny">「读取可预约活动」只读「未开始」那一档。要跨类型、跨状态找活动,用下面的搜索 —— 它会全量扫一遍(约 1-2 分钟),之后搜索是本地的,秒出。</p>
      <div style="display:flex;gap:8px;margin:10px 0;align-items:center;flex-wrap:wrap">
        <input id="gdipu-search" placeholder="搜活动名称/单位/地点…" style="flex:1;min-width:220px;padding:8px;border-radius:8px;border:1px solid #cfdede">
        <button id="gdipu-scan">全量扫描</button>
        <button id="gdipu-read-signup">读取报名时间</button>
      </div>
      <p class="tiny" id="gdipu-signup-progress"></p>
    </div><table><thead><tr><th>活动</th><th>活动时间</th><th>报名时间</th><th>名额</th><th>地点</th><th>操作</th></tr></thead><tbody></tbody></table>`;
    panel.style.display = 'block';
    renderRows(panel, initial);

    const input = panel.querySelector('#gdipu-search');
    const progress = panel.querySelector('#gdipu-signup-progress');
    const totalLabel = panel.querySelector('#gdipu-total');

    const applyFilter = () => {
      const keyword = clean(input.value).toLowerCase();
      const source = allActivities || rows;
      const matched = keyword
        ? source.filter(row => [row.title, row.location, row.firstSeenAs, row.time]
            .some(field => (field || '').toLowerCase().includes(keyword)))
        : source;
      totalLabel.textContent = `${matched.length} / ${source.length}`;
      renderRows(panel, matched);
    };
    input.oninput = applyFilter;

    panel.querySelector('#gdipu-scan').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      allActivities = await scanEverything(text => { progress.textContent = text; });
      progress.textContent = `扫描完成,共 ${allActivities.length} 项。`;
      input.value = '';
      applyFilter();
      button.disabled = false;
    };

    panel.querySelector('#gdipu-read-signup').onclick = async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const todo = currentRows.filter(row => row.wid && !row.signupTime);
      for (let i = 0; i < todo.length; i += 1) {
        const row = todo[i];
        progress.textContent = `正在读取报名时间 ${i + 1}/${todo.length}：${row.title.slice(0, 20)}`;
        row.signupTime = await fetchSignupTime(row.wid, row.dataType);
        const cell = panel.querySelector(`tr[data-i="${currentRows.indexOf(row)}"] .signup`);
        if (cell) cell.textContent = row.signupTime || '—';
      }
      progress.textContent = todo.length ? `读取完成 ${todo.length} 项。` : '当前列表没有需要读取的项目。';
      button.disabled = false;
    };
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

  // 两种详情页(2026-10-19 实测):
  //   学院活动 → 有「活动报名时间」字段: 2022/11/29 19:30 —— 2022/12/28 23:30
  //   宣讲会   → 没有该字段,只有「举办时间 2026/10/20 14:30:00 —— 16:30:00」
  //              和「剩余18:02:11 / 2026/10/20 14:30开始」
  // 旧代码在找不到「报名时间」时会退化成整页取第一个时间,可能抓到正文里的日期。
  // 这里先认报名时间,再认举办时间,并把来源一并返回,便于界面显示。
  const parseStart = text => {
    let source = '';
    let range = '';
    const marker = text.search(/活动报名时间|报名时间/);
    if (marker >= 0) {
      range = text.slice(marker, marker + 220).match(timePattern)?.[0] || '';
      if (range) source = '报名时间';
    }
    if (!range) {
      const at = text.search(/举办时间/);
      const near = at >= 0 ? text.slice(Math.max(0, at - 80), at + 160) : text;
      const hit = near.match(timePattern)?.[0] || '';
      if (hit) { range = hit; source = '举办时间'; }
    }
    if (!range) return null;
    const start = range.match(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{1,2}:\d{2}/)?.[0] || '';
    if (!start) return null;
    const isoLocal = start.replace(/\//g, '-').replace(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}:\d{2})$/, (_,y,m,d,t)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${t}`);
    const date = new Date(isoLocal);
    return Number.isFinite(date.getTime()) ? {date, range, source} : null;
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
    const authoritative = pagerAuthoritativeTotal();
    const declared = Number(authoritative.replace(/\D/g, '')) || 0;
    if (!rows.length) {
      status('未找到可预约活动,请确认处于“活动基地”的“未开始”列表。');
    } else if (declared && declared !== rows.length) {
      status(`读到 ${rows.length} 项;门户口径「${authoritative}」。页面实际渲染的卡片数少于服务端总数,这是学校页面的差异,不是漏读。`);
    } else {
      status(`找到 ${rows.length} 项可预约活动。`);
    }
    show(rows);
  };
  window.addEventListener('pywebviewready', () => { resumePending(); refreshTasks(); });
  setTimeout(resumePending, 500);
  setInterval(refreshTasks, 3000);
})();

