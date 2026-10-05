/* ============================================================
   practice-sync.js · 练习记录同步（共用模块）
   Reborn新生留学 —— 让各练习页把练习结果写入云端，
   作业打卡系统就能自动带出「今天练了什么」。

   用法：在练习页 </body> 前引入
     <script src="practice-sync.js"></script>
   练习结束时调用：
     PracticeSync.log('词汇', {
       detail: '1-1-1 食材食物酒水饮料 · 第2轮',
       scoreText: '正确 18 / 25（72%）',
       wrongItems: ['sustainable','allocate'],
       extra: { 单元:'1-1-1', 轮次:2 }
     });

   学生姓名：自动取作业系统 localStorage 里存的 hw_name，
   也能在任意页手动 PracticeSync.setName('文小月')。
   ============================================================ */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://homework-checkin-70500.app.workbuddy.host';
  var KEY = 'wbpk_325IYB8GtzBwhF8xHc8JJB_feev6L4HzrliZFD6MAlHaVk1IWE6stvH';
  var SLOT = 'main';
  var NAME_KEY = 'hw_name';
  var LS_KEY = 'hw_practice_log';
  var TAB_KEY = 'hw_practice_tab';

  var _cloud = null;
  var _ready = false;

  function pad(n) { return String(n).padStart(2, '0'); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ---------- 学生姓名 ----------
  function getName() {
    // 1) 作业系统存的
    try { var n = localStorage.getItem(NAME_KEY); if (n) return n; } catch (e) {}
    // 2) 本次会话存的
    try { var t = sessionStorage.getItem(NAME_KEY); if (t) return t; } catch (e) {}
    // 3) URL 参数
    try {
      var q = new URLSearchParams(location.search).get('name');
      if (q) return q;
    } catch (e) {}
    return '';
  }
  function setName(n) {
    n = String(n || '').trim();
    if (!n) return;
    try {
      localStorage.setItem(NAME_KEY, n);
      sessionStorage.setItem(NAME_KEY, n);
    } catch (e) {}
  }

  // ---------- 本地暂存（跨域页面拿不到云库时的兜底，也是同页多模块共享） ----------
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function writeLocal(rows) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rows.slice(-200)));
    } catch (e) {}
  }
  function addLocal(row) {
    var rows = readLocal();
    // 同一天同一模块只留一条（覆盖），避免学生刷新就翻倍
    rows = rows.filter(function (r) {
      return !(r.record_date === row.record_date && r.module === row.module);
    });
    rows.push(row);
    writeLocal(rows);
  }
  function getTab() {
    try { return sessionStorage.getItem(TAB_KEY) || ''; } catch (e) { return ''; }
  }
  function setTab(t) {
    try { sessionStorage.setItem(TAB_KEY, t); } catch (e) {}
  }

  // ---------- 云端 SDK（懒加载） ----------
  function ensureCloud() {
    if (_ready && _cloud) return Promise.resolve(_cloud);
    return new Promise(function (resolve, reject) {
      if (global.WorkBuddyCloud) { _ready = true; resolve(_cloud = global.WorkBuddyCloud); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';
      s.onload = function () {
        try {
          _cloud = global.WorkBuddyCloud.createWorkBuddyCloud({
            endpoint: ENDPOINT, publishableKey: KEY
          });
          _ready = true;
          resolve(_cloud);
        } catch (e) { reject(e); }
      };
      s.onerror = function () { reject(new Error('SDK 加载失败')); };
      document.head.appendChild(s);
    });
  }

  // ---------- 核心：写一条记录 ----------
  function log(module, data) {
    data = data || {};
    var who = getName();
    if (!who) {
      // 没姓名也先存本地，等填了姓名再补
      addLocal({ module: module, record_date: today(), detail: data.detail || '',
                 score_text: data.scoreText || '', wrong_items: data.wrongItems || [],
                 extra: data.extra || {}, _pending: true });
      return Promise.resolve({ pending: true });
    }
    var row = {
      student_name: who,
      record_date: data.date || today(),
      module: module,
      detail: data.detail || '',
      score_text: data.scoreText || '',
      wrong_items: JSON.stringify(data.wrongItems || []),
      extra: JSON.stringify(data.extra || {})
    };
    addLocal(row);
    return push(row).catch(function (e) {
      console.warn('[PracticeSync] 云端写入失败，已存本地：', e && e.message);
      return { localOnly: true };
    });
  }

  function push(row) {
    return ensureCloud().then(function (c) {
      return c.database.from('practice_logs')
        .insert({
          student_name: row.student_name, record_date: row.record_date,
          module: row.module, detail: row.detail, score_text: row.score_text,
          wrong_items: row.wrong_items, extra: row.extra
        });
    }).then(function (r) {
      if (r && r.error) throw new Error(r.error.message);
      return r;
    });
  }

  // ---------- 待补：本地有未上传的，等有姓名后补传 ----------
  function flushPending() {
    var who = getName();
    if (!who) return Promise.resolve(0);
    var rows = readLocal().filter(function (r) { return r._pending; });
    if (!rows.length) return Promise.resolve(0);
    var n = 0, chain = Promise.resolve();
    rows.forEach(function (r) {
      chain = chain.then(function () {
        var row = {
          student_name: who, record_date: r.record_date, module: r.module,
          detail: r.detail, score_text: r.score_text,
          wrong_items: JSON.stringify(r.wrong_items || []),
          extra: JSON.stringify(r.extra || {})
        };
        return push(row).then(function () { n++; }).catch(function () {});
      });
    });
    return chain.then(function () {
      if (n) writeLocal(readLocal().filter(function (r) { return !r._pending; }));
      return n;
    });
  }

  // ---------- 错词累计（反复练习统计） ----------
  function wrongHistory() {
    var map = {};
    readLocal().forEach(function (r) {
      var list = r.wrong_items;
      if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = []; } }
      (list || []).forEach(function (w) {
        if (!w) return;
        if (!map[w]) map[w] = { word: w, count: 0, dates: [] };
        map[w].count++;
        if (map[w].dates.indexOf(r.record_date) < 0) map[w].dates.push(r.record_date);
      });
    });
    return map;
  }

  global.PracticeSync = {
    log: log,
    setName: setName,
    getName: getName,
    flushPending: flushPending,
    wrongHistory: wrongHistory,
    getTab: getTab,
    setTab: setTab,
    readLocal: readLocal,
    today: today
  };
})(window);
