/**
 * 极简微信小游戏适配层：为 Pixi.js 提供 window / document / canvas / touch 事件。
 * 必须在 pixi.js 被 import 之前执行（入口文件里放在第一个 import）。
 */
(function () {
  var g = globalThis;
  if (typeof wx === 'undefined' || g.__MINIGAME_ADAPTER__) return;
  g.__MINIGAME_ADAPTER__ = true;

  var sys = wx.getSystemInfoSync();
  var screenW = sys.windowWidth;
  var screenH = sys.windowHeight;
  var dpr = sys.pixelRatio || 1;

  var mainCanvas = wx.createCanvas();
  g.__mainCanvas = mainCanvas;
  g.__screen = { width: screenW, height: screenH, dpr: dpr };

  function rect() {
    return { left: 0, top: 0, width: screenW, height: screenH, right: screenW, bottom: screenH, x: 0, y: 0 };
  }

  function patchCanvas(c) {
    if (!c) return c;
    if (!c.getBoundingClientRect) c.getBoundingClientRect = rect;
    if (!c.style) c.style = {};
    if (!c.setAttribute) c.setAttribute = function () {};
    if (!c.remove) c.remove = function () {};
    return c;
  }

  // ---------------------------------------------------------------- 事件

  var canvasListeners = {};

  function toTouch(t) {
    return {
      identifier: t.identifier,
      clientX: t.clientX,
      clientY: t.clientY,
      pageX: t.clientX,
      pageY: t.clientY,
      screenX: t.clientX,
      screenY: t.clientY,
      target: mainCanvas,
    };
  }

  function makeEvent(type, res, pointerType) {
    var touches = (res.touches || []).map(toTouch);
    var changed = (res.changedTouches || res.touches || []).map(toTouch);
    return {
      type: type,
      pointerType: pointerType || 'touch',
      pointerId: changed.length ? changed[0].identifier : 0,
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' || type === 'pointerupoutside' ? 0 : 1,
      target: mainCanvas,
      currentTarget: mainCanvas,
      srcElement: mainCanvas,
      touches: touches,
      targetTouches: touches,
      changedTouches: changed,
      clientX: changed.length ? changed[0].clientX : 0,
      clientY: changed.length ? changed[0].clientY : 0,
      timeStamp: Date.now(),
      cancelable: true,
      defaultPrevented: false,
      preventDefault: function () {
        this.defaultPrevented = true;
      },
      stopPropagation: function () {},
      stopImmediatePropagation: function () {},
    };
  }

  function dispatch(types, res) {
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var list = canvasListeners[type];
      if (!list || !list.length) continue;
      var evt = makeEvent(type, res);
      for (var j = 0; j < list.length; j++) {
        try {
          list[j](evt);
        } catch (err) {
          console.error('[adapter] touch handler error', err);
        }
      }
    }
  }

  function ensureTouchBinding() {
    if (g.__touchBound) return;
    g.__touchBound = true;
    wx.onTouchStart(function (res) {
      dispatch(['touchstart', 'pointerdown'], res);
    });
    wx.onTouchMove(function (res) {
      dispatch(['touchmove', 'pointermove'], res);
    });
    wx.onTouchEnd(function (res) {
      dispatch(['touchend', 'pointerup', 'pointerupoutside'], res);
    });
    wx.onTouchCancel(function (res) {
      dispatch(['touchcancel', 'pointercancel'], res);
    });
  }

  patchCanvas(mainCanvas);
  mainCanvas.addEventListener = function (type, fn) {
    if (!canvasListeners[type]) canvasListeners[type] = [];
    canvasListeners[type].push(fn);
    ensureTouchBinding();
  };
  mainCanvas.removeEventListener = function (type, fn) {
    var list = canvasListeners[type];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };

  // ---------------------------------------------------------------- document

  var noopEl = {
    style: {},
    addEventListener: function () {},
    removeEventListener: function () {},
    appendChild: function () {},
    setAttribute: function () {},
    remove: function () {},
    getBoundingClientRect: rect,
  };

  var doc = {
    createElement: function (tag) {
      if (tag === 'canvas') return patchCanvas(wx.createCanvas());
      if (tag === 'img') return wx.createImage();
      if (tag === 'audio') return typeof wx.createInnerAudioContext === 'function' ? wx.createInnerAudioContext() : {};
      if (tag === 'video') return typeof wx.createVideo === 'function' ? wx.createVideo() : noopEl;
      return noopEl;
    },
    createElementNS: function (_ns, tag) {
      return doc.createElement(tag);
    },
    createTextNode: function () {
      return noopEl;
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    getElementById: function () {
      return null;
    },
    querySelector: function () {
      return null;
    },
    body: noopEl,
    documentElement: noopEl,
    head: noopEl,
    readyState: 'complete',
    hidden: false,
  };

  // ---------------------------------------------------------------- window

  var winListeners = {};

  var fakeWindow = {
    innerWidth: screenW,
    innerHeight: screenH,
    outerWidth: screenW,
    outerHeight: screenH,
    devicePixelRatio: dpr,
    document: doc,
    navigator: null,
    location: { href: 'https://minigame.wechat', protocol: 'https:', search: '' },
    performance: null,
    screen: { width: screenW, height: screenH, availWidth: screenW, availHeight: screenH },
    addEventListener: function (type, fn) {
      if (!winListeners[type]) winListeners[type] = [];
      winListeners[type].push(fn);
    },
    removeEventListener: function (type, fn) {
      var list = winListeners[type];
      if (!list) return;
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    dispatchEvent: function () {
      return true;
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
  };

  var nav = { userAgent: 'WeChat MiniGame', platform: 'wechat', appVersion: '1.0' };

  var perf = g.performance || { now: function () { return Date.now(); } };

  g.window = fakeWindow;
  g.self = fakeWindow;
  g.document = doc;
  g.navigator = nav;
  g.performance = perf;
  g.location = fakeWindow.location;
  g.screen = fakeWindow.screen;
  g.devicePixelRatio = dpr;

  if (typeof g.requestAnimationFrame !== 'function') {
    g.requestAnimationFrame = function (cb) {
      return setTimeout(function () {
        cb(perf.now());
      }, 16);
    };
    g.cancelAnimationFrame = function (id) {
      clearTimeout(id);
    };
  }

  fakeWindow.performance = perf;
  fakeWindow.navigator = nav;

  if (typeof wx.onWindowResize === 'function') {
    wx.onWindowResize(function (res) {
      screenW = res.windowWidth || screenW;
      screenH = res.windowHeight || screenH;
      fakeWindow.innerWidth = screenW;
      fakeWindow.innerHeight = screenH;
      var list = winListeners.resize || [];
      for (var i = 0; i < list.length; i++) list[i]({ type: 'resize' });
      var rl = winListeners.wxresize || [];
      for (var k = 0; k < rl.length; k++) rl[k]({ type: 'wxresize', windowWidth: screenW, windowHeight: screenH });
    });
  }
})();
