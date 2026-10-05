/* ============================================================
   rb-identity.js · 全站唯一身份模块
   Reborn新生留学

   作用：学生只在 main.html 填一次姓名，全站所有练习页共享。
   姓名同时写入：
     1) localStorage（跨页面持久）
     2) sessionStorage（当次会话）
     3) postMessage 广播给所有 iframe 子页

   各练习页只需：<script src="rb-identity.js"></script>
   然后 RBIdentity.name 即可拿到姓名；拿不到时用 RBIdentity.ensure() 兜底弹窗。
   ============================================================ */
(function (global) {
  'use strict';

  var NAME_KEY = 'rb_student_name';
  var LOGIN_KEY = 'rb_student_logged_in';
  // 老师口令：改姓名 / 进老师端用。不向学生显示任何提示。
  var ADMIN_PW = 'reborn2016';

  function readLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function writeLS(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function readSS(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function writeSS(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  // ---------- 读取姓名 ----------
  function getName() {
    return readLS(NAME_KEY) || readSS(NAME_KEY) || '';
  }

  function isLoggedIn() {
    return readLS(LOGIN_KEY) === '1' && !!getName();
  }

  // ---------- 写入姓名并广播 ----------
  function setName(name, opts) {
    name = String(name || '').trim();
    if (!name) return '';
    writeLS(NAME_KEY, name);
    writeSS(NAME_KEY, name);
    writeLS(LOGIN_KEY, '1');
    // 广播给所有 iframe
    try {
      var frames = document.querySelectorAll('iframe');
      for (var i = 0; i < frames.length; i++) {
        try { frames[i].contentWindow.postMessage({ type: 'rbName', name: name }, '*'); } catch (e) {}
      }
    } catch (e) {}
    if (!opts || opts.silent !== true) { try { global.RBIdentity._onChange(name); } catch (e) {} }
    return name;
  }

  // ---------- 校验老师口令 ----------
  function checkAdmin(pw) {
    return String(pw || '').trim() === ADMIN_PW;
  }

  // ---------- 通用密码弹窗（不写用途提示） ----------
  function askPassword(title) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;' +
        'display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif';
      wrap.innerHTML =
        '<div style="background:#fff;border-radius:24px;padding:28px 26px;max-width:340px;width:100%;text-align:center">' +
        '<div style="color:#1b5e3a;font-size:1.05rem;font-weight:700;margin-bottom:16px">' + (title || '请输入密码') + '</div>' +
        '<input id="__rbPw" type="password" placeholder="••••••••" autocomplete="off" ' +
        'style="width:100%;padding:12px 16px;border:2px solid #bdd3c6;border-radius:40px;' +
        'font-size:1rem;outline:none;text-align:center;letter-spacing:3px;font-family:inherit;margin-bottom:14px">' +
        '<div id="__rbPwErr" style="color:#b13e3e;font-size:.82rem;min-height:18px;margin-bottom:8px;"></div>' +
        '<button id="__rbPwOk" style="width:100%;border:none;border-radius:40px;padding:12px;' +
        'background:#1b5e3a;color:#fff;font-size:.98rem;font-weight:700;cursor:pointer;font-family:inherit">确定</button>' +
        '<button id="__rbPwCancel" style="margin-top:10px;border:none;background:transparent;' +
        'color:#5a7a6a;font-size:.82rem;cursor:pointer;font-family:inherit;text-decoration:underline">取消</button>' +
        '</div>';
      document.body.appendChild(wrap);
      var inp = wrap.querySelector('#__rbPw');
      var err = wrap.querySelector('#__rbPwErr');
      setTimeout(function () { inp.focus(); }, 60);

      function done(v) { wrap.remove(); resolve(v); }
      wrap.querySelector('#__rbPwOk').onclick = function () {
        var v = inp.value;
        if (!v) { err.textContent = '请输入密码'; return; }
        if (!checkAdmin(v)) { err.textContent = '密码错误'; inp.value = ''; inp.focus(); return; }
        done(v);
      };
      wrap.querySelector('#__rbPwCancel').onclick = function () { done(''); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') wrap.querySelector('#__rbPwOk').click(); };
    });
  }

  // ---------- 修改姓名：需老师口令 ----------
  function changeNameFlow(newName) {
    return askPassword('请输入密码').then(function (pw) {
      if (!pw) return '';
      if (!newName) return '';
      return setName(newName);
    });
  }

  // ---------- 兜底弹窗（仅在脱离 main.html 直接打开时才出现） ----------
  var _asking = false;
  function ensure() {
    var n = getName();
    if (n) return Promise.resolve(n);
    if (_asking) return Promise.resolve('');
    _asking = true;

    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;' +
        'display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif';
      wrap.innerHTML =
        '<div style="background:#fff;border-radius:24px;padding:28px 26px;max-width:340px;width:100%;text-align:center">' +
        '<div style="font-size:1.6rem;margin-bottom:8px">👤</div>' +
        '<div style="color:#1b5e3a;font-size:1.05rem;font-weight:700;margin-bottom:6px">请输入学生姓名</div>' +
        '<div style="color:#5a7a6a;font-size:.82rem;line-height:1.6;margin-bottom:18px">' +
        '练习记录会按姓名同步到作业系统</div>' +
        '<input id="__rbName" type="text" placeholder="中文姓名" maxlength="20" ' +
        'style="width:100%;padding:12px 16px;border:2px solid #bdd3c6;border-radius:40px;' +
        'font-size:1rem;outline:none;text-align:center;font-family:inherit;margin-bottom:14px">' +
        '<button id="__rbOk" style="width:100%;border:none;border-radius:40px;padding:12px;' +
        'background:#1b5e3a;color:#fff;font-size:.98rem;font-weight:700;cursor:pointer;font-family:inherit">确定</button>' +
        '</div>';
      document.body.appendChild(wrap);
      var inp = wrap.querySelector('#__rbName');
      setTimeout(function () { inp.focus(); }, 60);

      function done(v) {
        wrap.remove();
        _asking = false;
        resolve(v ? setName(v) : '');
      }
      wrap.querySelector('#__rbOk').onclick = function () {
        var v = inp.value.trim();
        if (!v) { inp.style.borderColor = '#b13e3e'; inp.focus(); return; }
        done(v);
      };
      inp.onkeydown = function (e) { if (e.key === 'Enter') wrap.querySelector('#__rbOk').click(); };
    });
  }

  // ---------- 变更回调（页面可注册） ----------
  var _handlers = [];
  function onChange(fn) { if (typeof fn === 'function') _handlers.push(fn); }
  function _fire(name) { _handlers.forEach(function (f) { try { f(name); } catch (e) {} }); }

  // ---------- 接收父页广播 ----------
  global.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.type === 'rbName' && d.name) {
      writeLS(NAME_KEY, d.name);
      writeSS(NAME_KEY, d.name);
      writeLS(LOGIN_KEY, '1');
      _fire(d.name);
    }
    // 独立打开练习页时，主动向父页要姓名
    if (d && d.type === 'rbNameRequest') {
      var n = getName();
      if (n) { try { e.source.postMessage({ type: 'rbName', name: n }, '*'); } catch (err) {} }
    }
  });

  // 独立打开（非 iframe）时，向 opener / parent 索取姓名
  try {
    if (global.parent && global.parent !== global) {
      global.parent.postMessage({ type: 'rbNameRequest' }, '*');
    }
  } catch (e) {}

  // 存储事件兜底（另标签页改了姓名）
  global.addEventListener('storage', function (e) {
    if (e.key === NAME_KEY && e.newValue) _fire(e.newValue);
  });

  global.RBIdentity = {
    getName: getName,
    setName: setName,
    isLoggedIn: isLoggedIn,
    ensure: ensure,
    onChange: onChange,
    checkAdmin: checkAdmin,
    askPassword: askPassword,
    changeNameFlow: changeNameFlow,
    logout: function () {
      try { localStorage.removeItem(NAME_KEY); localStorage.removeItem(LOGIN_KEY); } catch (e) {}
      try { sessionStorage.removeItem(NAME_KEY); } catch (e) {}
    },
    _onChange: _fire,
    _NAME_KEY: NAME_KEY
  };
})(window);
