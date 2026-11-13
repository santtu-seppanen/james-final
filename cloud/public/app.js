// James config UI. Plain JS, no build step.
//
// Model: `current` is the published config (from GET /api/admin/config),
// `draft` is a deep copy the user edits. When they differ the publish bar
// appears; Publish PUTs the draft with baseVersion = current.version so a
// concurrent publish from another tab is rejected (409) instead of silently
// overwritten. After publishing, the overview is polled until the device
// reports it applied that version (or rejected it).
(function () {
  'use strict';

  var API = '';
  var LOW_FILL = 0.2;
  var FAST_POLL_MS = 10000;
  var SLOW_POLL_MS = 30000;
  var STATS_HOURS = 24 * 7;
  var IMAGE_NAMES = [
    'cranberry_lime', 'drink', 'gin_tonic', 'ginrickey', 'grey_drink', 'humppaleka', 'margarita', 'mikahakkinen',
    'moukku', 'red_drink', 'rum_coke', 'screwdriver', 'sea_breeze', 'tequila_sunrise', 'vodka', 'whiskey',
  ];
  var DEFAULT_AVAILABLE = ['vodka', 'gin', 'rum', 'whiskey', 'tequila', 'tonic', 'cranberry', 'orangejuice', 'limejuice', 'syrup', 'empty'];

  var state = {
    token: readToken(),
    schema: null,
    overview: null,
    current: null, // {version, etag, config, ...} or null when nothing is published
    draft: null,
    stats: null,
    versions: [],
    tab: 'device',
    publishing: false,
  };
  var pollTimer = null;

  // ---------- utilities ----------

  function $(id) {
    return document.getElementById(id);
  }

  function readToken() {
    try {
      return sessionStorage.getItem('jamesCloudAdminToken') || '';
    } catch (e) {
      return '';
    }
  }

  function storeToken(token) {
    state.token = token;
    try {
      if (token) sessionStorage.setItem('jamesCloudAdminToken', token);
      else sessionStorage.removeItem('jamesCloudAdminToken');
    } catch (e) {
      // sessionStorage unavailable; lasts until reload
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  // Key-order independent, matches cloud/shared/config-validate.js canonicalJson.
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return (
        '{' +
        Object.keys(value)
          .sort()
          .filter(function (k) { return value[k] !== undefined; })
          .map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); })
          .join(',') +
        '}'
      );
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else if (key === 'html') node.innerHTML = attrs[key];
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), attrs[key]);
      else if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== false) node.setAttribute(key, attrs[key] === true ? '' : attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function button(label, onClick, cls) {
    return el('button', {type: 'button', class: 'btn ' + (cls || 'btn--ghost btn--small'), onclick: onClick, text: label});
  }

  function formatMl(ml) {
    if (ml == null) return '–';
    return ml + ' ml'; // always millilitres, never litres
  }

  function formatRelative(iso) {
    if (!iso) return 'never';
    var minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + ' h ago';
    return Math.round(hours / 24) + ' d ago';
  }

  function formatDuration(seconds) {
    if (seconds == null) return '–';
    var d = Math.floor(seconds / 86400);
    var h = Math.floor((seconds % 86400) / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return d + ' d ' + h + ' h';
    if (h > 0) return h + ' h ' + m + ' min';
    return m + ' min';
  }

  function formatDate(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  }

  function showNotice(message, isError) {
    var node = $('global-notice');
    node.textContent = message || '';
    node.className = 'notice' + (isError ? ' notice--error' : '');
    node.hidden = !message;
  }

  // ---------- API ----------

  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign(
        {authorization: 'Bearer ' + state.token},
        body !== undefined ? {'content-type': 'application/json'} : {}
      ),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
        if (response.status === 401) {
          storeToken('');
          showSignedOut('Wrong or expired admin token.');
          throw new Error('unauthorized');
        }
        if (!response.ok) {
          var err = new Error((data && data.error) || 'HTTP ' + response.status);
          err.status = response.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  // ---------- auth / boot ----------

  function showSignedOut(message) {
    $('signed-out').hidden = false;
    $('app').hidden = true;
    $('publish-bar').hidden = true;
    $('auth-toggle').textContent = 'Sign in';
    $('auth-error').textContent = message || '';
    $('auth-error').hidden = !message;
    clearTimeout(pollTimer);
  }

  function boot() {
    if (!state.token) return showSignedOut('');
    $('signed-out').hidden = true;
    $('app').hidden = false;
    $('auth-toggle').textContent = 'Sign out';
    showNotice('Loading…');
    Promise.all([
      api('GET', '/api/admin/schema'),
      api('GET', '/api/admin/overview'),
      api('GET', '/api/admin/config').catch(function (e) {
        if (e.status === 404) return null;
        throw e;
      }),
      api('GET', '/api/admin/stats?hours=' + STATS_HOURS),
      api('GET', '/api/admin/config/versions?limit=100'),
    ])
      .then(function (results) {
        state.schema = results[0];
        state.overview = results[1];
        state.current = results[2];
        state.stats = results[3];
        state.versions = results[4].versions;
        if (state.current) {
          state.draft = clone(state.current.config);
          showNotice('');
        } else {
          state.draft = draftFromDevice(state.overview.device);
          showNotice(
            state.overview.device
              ? 'No config published yet. This draft was built from the device\'s last report - review it and publish.'
              : 'No config published yet and the device has not checked in. Start from this empty draft or wait for the device.'
          );
        }
        renderAll();
        schedulePoll();
      })
      .catch(function (e) {
        if (e.message !== 'unauthorized') showNotice('Could not load: ' + e.message, true);
      });
  }

  // Builds a config from what the device last reported (its local files),
  // used to bootstrap before anything is published and for "use device state".
  function draftFromDevice(device) {
    var defaults = state.schema ? state.schema.settingsDefaults : {};
    if (!device) {
      return {schemaVersion: 1, availableBottles: DEFAULT_AVAILABLE.slice(), bottles: [], recipes: {}, settings: clone(defaults)};
    }
    var available = (device.availableBottles || []).slice();
    (device.bottles || []).forEach(function (b) {
      if (b.name && available.indexOf(b.name) === -1) available.push(b.name);
    });
    var recipes = {};
    (device.recipes || []).forEach(function (r) {
      if (!r.id) return;
      var recipe = {friendlyname: r.friendlyname || r.friendlyName || r.id, ingredients: r.ingredients || []};
      if (r.imageUrl) recipe.imageUrl = r.imageUrl;
      recipes[r.id] = recipe;
    });
    return {
      schemaVersion: 1,
      availableBottles: available.length ? available : DEFAULT_AVAILABLE.slice(),
      bottles: (device.bottles || []).map(function (b) {
        return {name: b.name, serving: b.servingMl || 25, capacity: b.originalCapacityMl || b.capacityMl || 0};
      }),
      recipes: recipes,
      settings: state.draft && state.draft.settings ? clone(state.draft.settings) : clone(defaults),
    };
  }

  function refreshOverview() {
    return Promise.all([
      api('GET', '/api/admin/overview'),
      api('GET', '/api/admin/stats?hours=' + STATS_HOURS),
    ])
      .then(function (results) {
        state.overview = results[0];
        state.stats = results[1];
        renderStatus();
        renderDevice();
        renderVersions();
      })
      .catch(function (e) {
        if (e.message !== 'unauthorized') $('status-text').textContent = 'Could not reach backend';
      })
      .then(schedulePoll);
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!state.token) return;
    var fast = state.overview && state.overview.pending;
    pollTimer = setTimeout(refreshOverview, fast ? FAST_POLL_MS : SLOW_POLL_MS);
  }

  // ---------- rendering ----------

  function isDirty() {
    var base = state.current ? state.current.config : null;
    return canonical(state.draft) !== canonical(base);
  }

  function renderAll() {
    renderStatus();
    renderTabs();
    renderDevice();
    renderBottles();
    renderRecipes();
    renderSettings();
    renderVersions();
    renderPublishBar();
  }

  function renderStatus() {
    var device = state.overview && state.overview.device;
    var badge = $('status-badge');
    var text = $('status-text');
    if (!device) {
      badge.className = 'status-badge status-badge--unknown';
      text.textContent = 'Device never seen';
    } else {
      badge.className = 'status-badge ' + (device.online ? 'status-badge--online' : 'status-badge--offline');
      text.textContent = device.online ? 'Online' : 'Offline';
    }

    var offline = $('offline-banner');
    if (device && !device.online) {
      offline.textContent = 'The device has not checked in since ' + formatRelative(device.lastSeen) + ' (' + formatDate(device.lastSeen) + '). Published changes will be applied when it is back.';
      offline.hidden = false;
    } else if (device && device.serverReachable === false) {
      offline.textContent = 'The device checks in, but its drink server (index.js) is not responding - drinks cannot be poured right now.';
      offline.hidden = false;
    } else {
      offline.hidden = true;
    }

    var pending = $('pending-banner');
    var current = state.overview && state.overview.config;
    if (device && current && device.appliedConfig.status === 'rejected' && device.appliedConfig.etag === current.etag) {
      pending.className = 'banner banner--error';
      pending.textContent = 'The device rejected v' + current.version + ': ' + (device.appliedConfig.error || 'unknown error') + '. It keeps running its previous config.';
      pending.hidden = false;
    } else if (state.overview && state.overview.pending && current) {
      pending.className = 'banner banner--info';
      pending.textContent = 'v' + current.version + ' published - waiting for the device to apply it (it polls about once a minute)…';
      pending.hidden = false;
    } else {
      pending.hidden = true;
    }
  }

  function renderTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var active = tab.dataset.tab === state.tab;
      tab.className = 'tab' + (active ? ' tab--active' : '');
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (panel) {
      panel.hidden = panel.dataset.panel !== state.tab;
    });
  }

  function renderDevice() {
    var device = state.overview && state.overview.device;
    var stats = state.stats;
    var counters = (device && device.counters) || {};
    $('d-lastseen').textContent = device ? formatRelative(device.lastSeen) : '–';
    $('d-uptime').textContent = device ? formatDuration(device.uptimeS) : '–';
    $('d-drinks').textContent = counters.drinksServed != null ? counters.drinksServed : '–';
    $('d-alcohol').textContent = counters.alcoholServedMl != null ? formatMl(counters.alcoholServedMl) : '–';
    $('import-device').disabled = !device;

    var info = $('d-info');
    info.innerHTML = '';
    if (!device) {
      info.innerHTML = '<dt>Status</dt><dd class="empty-state">The device has never reported. Check JAMES_CLOUD_URL / JAMES_CLOUD_DEVICE_TOKEN in server/.env and that cloud-sync.js runs.</dd>';
    } else {
      var applied = device.appliedConfig || {};
      var rows = [
        ['Last check-in', formatDate(device.lastSeen) + ' (' + formatRelative(device.lastSeen) + ')'],
        ['Drink server', device.serverReachable === false ? 'not responding' : device.serverReachable ? 'running' : 'unknown'],
        ['Deployed version', device.deviceVersion || 'unknown'],
        ['Config on device', applied.version ? 'v' + applied.version + ' (' + (applied.status || '?') + (applied.at ? ', ' + formatRelative(applied.at) : '') + ')' : 'none'],
        ['Current config', state.overview.config ? 'v' + state.overview.config.version + ' (' + formatRelative(state.overview.config.createdAt) + ')' : 'none published'],
      ];
      if (applied.status === 'rejected' && applied.error) rows.push(['Rejection reason', applied.error]);
      var sys = device.system || {};
      if (sys.model) rows.push(['Hardware', sys.model]);
      if (sys.hostname) rows.push(['Host', sys.hostname + (sys.ip ? ' (' + sys.ip + ')' : '')]);
      if (sys.nodeVersion) rows.push(['Node', sys.nodeVersion]);
      if (sys.loadAvg) rows.push(['Load', sys.loadAvg.map(function (n) { return n.toFixed(2); }).join(' ')]);
      if (sys.freeMemMb != null) rows.push(['Free memory', sys.freeMemMb + ' MB']);
      if (sys.diskFreeMb != null) rows.push(['Free disk', sys.diskFreeMb + ' MB']);
      rows.forEach(function (row) {
        info.appendChild(el('dt', {text: row[0]}));
        info.appendChild(el('dd', {text: row[1]}));
      });
    }

    var list = $('d-bottles');
    list.innerHTML = '';
    var bottles = (device && device.bottles) || [];
    if (!bottles.length) list.innerHTML = '<li class="empty-state">No bottles reported.</li>';
    bottles.forEach(function (b) {
      var ratio = b.originalCapacityMl > 0 ? b.capacityMl / b.originalCapacityMl : 0;
      var percent = Math.max(0, Math.min(1, ratio)) * 100;
      list.appendChild(
        el('li', {class: 'bottle-row'}, [
          el('span', {class: 'bottle-row__name', text: (b.slot + 1) + '. ' + b.name}),
          el('span', {class: 'bottle-row__track'}, [el('span', {class: 'bottle-row__fill' + (ratio <= LOW_FILL ? ' bottle-row__fill--low' : ''), style: 'width:' + percent.toFixed(0) + '%'})]),
          el('span', {class: 'bottle-row__value', text: formatMl(b.capacityMl)}),
        ])
      );
    });

    $('stats-window').textContent = stats ? '(last ' + Math.round(stats.hours / 24) + ' days)' : '';
    var top = $('d-top');
    top.innerHTML = '';
    if (!stats || !stats.perRecipe.length) top.innerHTML = '<li class="empty-state">No pours in this period.</li>';
    (stats ? stats.perRecipe : []).forEach(function (r) {
      top.appendChild(el('li', {text: r.name + ' - ' + r.count + ' (' + formatMl(r.alcoholMl) + ' alcohol)'}));
    });

    var errors = $('d-errors');
    errors.innerHTML = '';
    var errs = (device && device.errors) || [];
    if (!errs.length) errors.innerHTML = '<li class="empty-state">No errors reported.</li>';
    errs.slice().reverse().forEach(function (e) {
      errors.appendChild(el('li', {text: formatRelative(e.at) + (e.source ? ' [' + e.source + '] ' : ' ') + e.message}));
    });

    var pours = $('d-pours');
    pours.innerHTML = '';
    var list2 = stats ? stats.pours.slice(0, 20) : [];
    if (!list2.length) pours.innerHTML = '<tr><td colspan="3" class="empty-state">No pours recorded.</td></tr>';
    list2.forEach(function (p) {
      pours.appendChild(el('tr', {}, [
        el('td', {text: p.friendlyName || p.recipeId || '?'}),
        el('td', {text: formatMl(p.alcoholMl)}),
        el('td', {text: formatRelative(p.pouredAt)}),
      ]));
    });
  }

  // --- Bottles tab ---

  function renderBottles() {
    var draft = state.draft;
    var list = $('slot-list');
    list.innerHTML = '';
    var device = state.overview && state.overview.device;
    var maxSlots = state.schema ? state.schema.maxSlots : 6;
    $('add-slot').disabled = draft.bottles.length >= maxSlots;

    if (!draft.bottles.length) list.innerHTML = '<p class="empty-state">No slots. Add one per servo (the device has ' + maxSlots + ').</p>';

    draft.bottles.forEach(function (bottle, slot) {
      var live = device && device.bottles ? device.bottles[slot] : null;
      var nameSelect = el('select', {onchange: function (e) { bottle.name = e.target.value; onDraftChange(); }});
      var names = draft.availableBottles.slice();
      if (names.indexOf(bottle.name) === -1) names.unshift(bottle.name);
      names.forEach(function (n) { nameSelect.appendChild(el('option', {value: n, text: n})); });
      nameSelect.value = bottle.name;

      var servingSelect = el('select', {onchange: function (e) { bottle.serving = Number(e.target.value); onDraftChange(); }});
      (state.schema ? state.schema.servings : [25, 50]).forEach(function (s) { servingSelect.appendChild(el('option', {value: s, text: s + ' ml'})); });
      servingSelect.value = String(bottle.serving);

      var capacity = el('input', {
        type: 'number', min: 0, max: state.schema ? state.schema.maxCapacityMl : 5000, step: 1, value: bottle.capacity,
        onchange: function (e) {
          bottle.capacity = Number(e.target.value);
          if (bottle.level > bottle.capacity) bottle.level = bottle.capacity;
          onDraftChange();
        },
      });

      // Level: how much is in the bottle now. Shows what the device last
      // reported; typing a different number is a correction the device applies
      // once, at its next check-in (the stamp makes it count only once).
      var liveSame = live && live.name === bottle.name && live.originalCapacityMl > 0;
      var applied = device && device.appliedConfig && device.appliedConfig.at ? Date.parse(device.appliedConfig.at) : 0;
      var levelPending = bottle.levelSetAt && Date.parse(bottle.levelSetAt) > applied;
      var shownLevel = levelPending ? bottle.level : liveSame ? live.capacityMl : bottle.capacity;
      var level = el('input', {
        type: 'number', min: 0, max: bottle.capacity, step: 1, value: shownLevel,
        onchange: function (e) {
          var n = Math.max(0, Math.min(bottle.capacity, Math.round(Number(e.target.value))));
          if (liveSame && n === live.capacityMl) {
            delete bottle.level;
            delete bottle.levelSetAt;
          } else {
            bottle.level = n;
            bottle.levelSetAt = new Date().toISOString();
          }
          onDraftChange();
        },
      });

      var meta = [];
      if (liveSame) {
        meta.push(el('span', {text: 'On device: ' + formatMl(live.capacityMl) + ' of ' + formatMl(live.originalCapacityMl) + ' left'}));
      } else if (live) {
        meta.push(el('span', {text: 'On device now: ' + live.name}));
      }
      if (levelPending) meta.push(el('span', {class: 'slot__tag', text: 'level applies at next check-in'}));

      list.appendChild(
        el('div', {class: 'slot'}, [
          el('div', {class: 'slot__title'}, [el('span', {text: 'Slot ' + (slot + 1)})]),
          el('div', {class: 'slot__grid'}, [
            el('label', {class: 'field field--wide'}, ['Bottle', nameSelect]),
            el('label', {class: 'field'}, ['Capacity (ml)', capacity]),
            el('label', {class: 'field'}, ['Level (ml)', level]),
            el('label', {class: 'field'}, ['Pour size', servingSelect]),
          ]),
          meta.length ? el('div', {class: 'slot__meta'}, meta) : null,
        ])
      );
    });

    var chips = $('available-chips');
    chips.innerHTML = '';
    draft.availableBottles.forEach(function (name) {
      var loaded = draft.bottles.some(function (b) { return b.name === name; });
      chips.appendChild(
        el('span', {class: 'chip' + (loaded ? ' chip--loaded' : ''), title: loaded ? 'Loaded in a slot' : ''}, [
          name,
          loaded ? null : el('button', {type: 'button', 'aria-label': 'Remove ' + name, text: '✕', onclick: function () {
            draft.availableBottles = draft.availableBottles.filter(function (n) { return n !== name; });
            onDraftChange();
          }}),
        ])
      );
    });
  }

  // --- Recipes tab ---

  function renderRecipes() {
    var grid = $('recipe-grid');
    grid.innerHTML = '';
    var ids = Object.keys(state.draft.recipes).sort(function (a, b) {
      return state.draft.recipes[a].friendlyname.localeCompare(state.draft.recipes[b].friendlyname);
    });
    if (!ids.length) grid.innerHTML = '<p class="empty-state">No recipes yet.</p>';
    var loaded = {};
    state.draft.bottles.forEach(function (b) { loaded[bottleKey(b.name)] = true; });

    ids.forEach(function (id) {
      var recipe = state.draft.recipes[id];
      var pourable = recipe.ingredients.every(function (i) { return i.manual || loaded[bottleKey(i.name)]; });
      grid.appendChild(
        el('div', {class: 'recipe-card'}, [
          el('div', {class: 'recipe-card__name', text: recipe.friendlyname}),
          el('div', {class: 'recipe-card__id', text: id + (pourable ? '' : ' · hidden on kiosk (bottle not loaded)')}),
          el('ul', {class: 'recipe-card__ingredients'}, recipe.ingredients.map(function (i) {
            return el('li', {text: i.name + ' ' + i.serving + ' ml' + (i.manual ? ' (by hand)' : '') + (i.wait ? ' · wait ' + i.wait : '')});
          })),
          el('div', {class: 'recipe-card__actions'}, [
            button('Edit', function () { openRecipeDialog(id); }),
            button('Delete', function () {
              if (!confirm('Delete "' + recipe.friendlyname + '" from the draft?')) return;
              delete state.draft.recipes[id];
              onDraftChange();
            }, 'btn--danger btn--small'),
          ]),
        ])
      );
    });
  }

  function bottleKey(name) {
    return String(name).replace(' ', '').toUpperCase();
  }

  var editingRecipeId = null;

  function slug(name) {
    return String(name).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'drink';
  }

  function addIngredientRow(ingredient) {
    var row = el('div', {class: 'ingredient-row'});
    var select = el('select', {required: true});
    state.draft.availableBottles.forEach(function (name) { select.appendChild(el('option', {value: name, text: name})); });
    select.appendChild(el('option', {value: '__manual__', text: 'Added by hand…'}));
    var amount = el('input', {type: 'number', min: 1, max: 500, step: 1, required: true, placeholder: 'ml', value: ingredient ? ingredient.serving : ''});
    var wait = el('input', {type: 'number', min: 0, max: 10, step: 1, placeholder: 'wait', title: 'Delay this pour by N cycles', value: ingredient && ingredient.wait ? ingredient.wait : ''});
    var remove = button('✕', function () { row.remove(); });
    remove.setAttribute('aria-label', 'Remove ingredient');
    var manualRow = el('div', {class: 'ingredient-row__manual'}, ['Name shown to the user:', el('input', {type: 'text', maxlength: 60, placeholder: 'e.g. sprite'})]);
    manualRow.hidden = true;
    select.addEventListener('change', function () { manualRow.hidden = select.value !== '__manual__'; });

    if (ingredient) {
      if (ingredient.manual) {
        select.value = '__manual__';
        manualRow.hidden = false;
        manualRow.querySelector('input').value = ingredient.name;
      } else {
        var match = state.draft.availableBottles.filter(function (n) { return bottleKey(n) === bottleKey(ingredient.name); })[0];
        select.value = match || '__manual__';
        if (!match) { manualRow.hidden = false; manualRow.querySelector('input').value = ingredient.name; }
      }
    }
    row.appendChild(select);
    row.appendChild(amount);
    row.appendChild(wait);
    row.appendChild(remove);
    row.appendChild(manualRow);
    $('ingredient-rows').appendChild(row);
  }

  function openRecipeDialog(id) {
    editingRecipeId = id;
    var recipe = id ? state.draft.recipes[id] : null;
    $('recipe-dialog-title').textContent = recipe ? 'Edit drink' : 'Add drink';
    $('recipe-name').value = recipe ? recipe.friendlyname : '';
    $('recipe-id').value = id || '';
    $('recipe-id').readOnly = Boolean(id);
    $('recipe-image').value = recipe && recipe.imageUrl ? recipe.imageUrl : '';
    $('ingredient-rows').innerHTML = '';
    (recipe ? recipe.ingredients : [null]).forEach(addIngredientRow);
    $('recipe-error').hidden = true;
    $('recipe-dialog').showModal();
  }

  function submitRecipeDialog(event) {
    event.preventDefault();
    var err = $('recipe-error');
    var ingredients = [];
    var problem = '';
    Array.prototype.forEach.call(document.querySelectorAll('#ingredient-rows .ingredient-row'), function (row) {
      var select = row.querySelector('select');
      var inputs = row.querySelectorAll('input[type=number]');
      var serving = Number(inputs[0].value);
      var wait = Number(inputs[1].value);
      var manual = select.value === '__manual__';
      var name = manual ? row.querySelector('.ingredient-row__manual input').value.trim() : select.value;
      if (!name) problem = 'Manual ingredients need a name';
      if (!serving) problem = name + ': amount required';
      var bottle = state.draft.bottles.filter(function (b) { return bottleKey(b.name) === bottleKey(name); })[0];
      if (!manual && bottle && serving % bottle.serving !== 0) problem = name + ': amount must be a multiple of ' + bottle.serving + ' ml';
      var ing = {name: name, serving: serving};
      if (manual) ing.manual = true;
      if (wait > 0) ing.wait = wait;
      ingredients.push(ing);
    });
    if (!ingredients.length) problem = 'Add at least one ingredient';
    var id = editingRecipeId || $('recipe-id').value.trim() || slug($('recipe-name').value);
    if (!editingRecipeId && state.draft.recipes[id]) problem = 'Id "' + id + '" is already used';
    if (problem) {
      err.textContent = problem;
      err.hidden = false;
      return;
    }
    var recipe = {friendlyname: $('recipe-name').value.trim(), ingredients: ingredients};
    var image = $('recipe-image').value.trim();
    if (image) recipe.imageUrl = image;
    else if (editingRecipeId && state.draft.recipes[id].imageUrl) recipe.imageUrl = state.draft.recipes[id].imageUrl;
    state.draft.recipes[id] = recipe;
    $('recipe-dialog').close();
    onDraftChange();
  }

  // --- Settings tab (rendered from the schema) ---

  function renderSettings() {
    var root = $('settings-sections');
    root.innerHTML = '';
    if (!state.schema) return;
    var settings = state.draft.settings || (state.draft.settings = {});
    var known = {};

    state.schema.settings.forEach(function (section) {
      known[section.key] = true;
      var values = settings[section.key] || (settings[section.key] = {});
      var fields = section.fields.map(function (field) {
        var value = values[field.key] === undefined ? field.default : values[field.key];
        var control;
        var set = function (v) { values[field.key] = v; onDraftChange(); };
        if (field.type === 'boolean') {
          control = el('input', {type: 'checkbox', onchange: function (e) { set(e.target.checked); }});
          control.checked = Boolean(value);
        } else if (field.type === 'number') {
          control = el('input', {type: 'number', min: field.min, max: field.max, step: field.step || 1, value: value, onchange: function (e) { set(Number(e.target.value)); }});
        } else if (field.type === 'enum') {
          control = el('select', {onchange: function (e) { set(e.target.value); }});
          field.options.forEach(function (o) { control.appendChild(el('option', {value: o, text: o})); });
          control.value = value;
        } else {
          control = el('input', {type: 'text', maxlength: field.maxLength || 200, pattern: field.pattern, value: value, onchange: function (e) { set(e.target.value); }});
        }
        return el('label', {class: 'field field--row'}, [
          el('span', {}, [field.label, field.description ? el('div', {class: 'field__hint', text: field.description}) : null]),
          control,
        ]);
      });
      var extra = Object.keys(values).filter(function (k) {
        return !section.fields.some(function (f) { return f.key === k; });
      });
      root.appendChild(
        el('div', {class: 'panel'}, [
          el('h2', {text: section.title}),
          section.description ? el('p', {class: 'notice', text: section.description}) : null,
        ].concat(fields, extra.length ? [el('p', {class: 'notice', text: 'Also set (not in the schema, kept as-is): ' + extra.map(function (k) { return k + ' = ' + JSON.stringify(values[k]); }).join(', ')})] : []))
      );
    });

    var unknownSections = Object.keys(settings).filter(function (k) { return !known[k]; });
    if (unknownSections.length) {
      root.appendChild(el('div', {class: 'panel'}, [
        el('h2', {text: 'Other settings'}),
        el('p', {class: 'notice', text: 'Sections not in the schema are kept as-is. Add them to cloud/shared/settings-schema.js to edit them here.'}),
        el('pre', {class: 'json', text: JSON.stringify(unknownSections.reduce(function (o, k) { o[k] = settings[k]; return o; }, {}), null, 2)}),
      ]));
    }
  }

  // --- Versions tab ---

  function renderVersions() {
    var list = $('version-list');
    list.innerHTML = '';
    var device = state.overview && state.overview.device;
    var applied = device ? device.appliedConfig : {};
    var current = state.overview && state.overview.config;
    if (!state.versions.length) list.innerHTML = '<li class="empty-state">Nothing published yet.</li>';
    state.versions.forEach(function (v) {
      var badges = [];
      if (current && v.version === current.version) badges.push(el('span', {class: 'version__badge version__badge--current', text: 'current'}));
      if (applied.version === v.version && applied.status === 'applied') badges.push(el('span', {class: 'version__badge version__badge--device', text: 'on device'}));
      if (applied.version === v.version && applied.status === 'rejected') badges.push(el('span', {class: 'version__badge version__badge--rejected', text: 'rejected by device'}));
      list.appendChild(
        el('li', {class: 'version'}, [
          el('div', {class: 'version__main'}, [
            el('div', {class: 'version__title'}, ['v' + v.version + (v.note ? ' - ' + v.note : '')].concat(badges)),
            el('div', {class: 'version__meta', text: formatDate(v.createdAt) + ' · ' + (v.author || 'admin') + (v.rolledBackFrom ? ' · rollback of v' + v.rolledBackFrom : '')}),
          ]),
          button('View', function () { openVersionDialog(v.version); }),
        ])
      );
    });
  }

  var viewingVersion = null;

  function describeDiff(a, b) {
    // a = this version, b = current. Lists what differs at section/recipe/slot level.
    var out = [];
    if (!b) return ['(no current version to compare with)'];
    // Bottles are live, not versioned: only old versions still carry them.
    var slots = a.bottles && b.bottles ? Math.max(a.bottles.length, b.bottles.length) : 0;
    for (var i = 0; i < slots; i++) {
      var x = a.bottles[i], y = b.bottles[i];
      if (canonical(x) === canonical(y)) continue;
      var describe = function (b) { return b ? b.name + ' ' + b.capacity + ' ml / ' + b.serving + ' ml' : '(none)'; };
      out.push('Slot ' + (i + 1) + ': ' + describe(x) + ' ← now ' + describe(y));
    }
    if (canonical(a.availableBottles) !== canonical(b.availableBottles)) out.push('Available bottles differ');
    var ids = {};
    Object.keys(a.recipes).concat(Object.keys(b.recipes)).forEach(function (id) { ids[id] = true; });
    Object.keys(ids).forEach(function (id) {
      var x = a.recipes[id], y = b.recipes[id];
      if (!x) out.push('Recipe "' + (y.friendlyname) + '" would be removed');
      else if (!y) out.push('Recipe "' + x.friendlyname + '" would be added');
      else if (canonical(x) !== canonical(y)) out.push('Recipe "' + x.friendlyname + '" differs');
    });
    Object.keys(Object.assign({}, a.settings, b.settings)).forEach(function (section) {
      var x = a.settings[section] || {}, y = b.settings[section] || {};
      Object.keys(Object.assign({}, x, y)).forEach(function (key) {
        if (canonical(x[key]) !== canonical(y[key])) out.push('Setting ' + section + '.' + key + ': ' + JSON.stringify(x[key]) + ' ← now ' + JSON.stringify(y[key]));
      });
    });
    return out.length ? out : ['Identical to the current version'];
  }

  function openVersionDialog(version) {
    api('GET', '/api/admin/config/versions/' + version)
      .then(function (v) {
        viewingVersion = v;
        $('version-dialog-title').textContent = 'v' + v.version + (v.note ? ' - ' + v.note : '');
        var meta = $('version-meta');
        meta.innerHTML = '';
        [['Published', formatDate(v.createdAt)], ['By', v.author || 'admin'], ['ETag', v.etag], ['Bottles', v.config.bottles ? v.config.bottles.map(function (b) { return b.name; }).join(', ') : 'live (not part of versions)'], ['Recipes', String(Object.keys(v.config.recipes).length)]].forEach(function (row) {
          meta.appendChild(el('dt', {text: row[0]}));
          meta.appendChild(el('dd', {text: row[1]}));
        });
        var diff = $('version-diff');
        diff.innerHTML = '';
        describeDiff(v.config, state.current ? state.current.config : null).forEach(function (line) { diff.appendChild(el('li', {text: line})); });
        $('version-json').textContent = JSON.stringify(v.config, null, 2);
        var isCurrent = state.current && state.current.version === v.version;
        $('version-rollback').disabled = Boolean(isCurrent);
        $('version-dialog').showModal();
      })
      .catch(function (e) { showNotice('Could not load version: ' + e.message, true); });
  }

  // --- Publish bar ---

  function renderPublishBar() {
    var dirty = isDirty();
    var bar = $('publish-bar');
    bar.hidden = !dirty;
    $('publish-status').textContent = state.publishing
      ? 'Publishing…'
      : 'Unsaved changes' + (state.current ? ' (based on v' + state.current.version + ')' : ' (first version)');
    $('publish').disabled = state.publishing;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var badge = tab.querySelector('.tab__badge');
      var show = dirty && sectionDirty(tab.dataset.tab);
      if (show && !badge) tab.appendChild(el('span', {class: 'tab__badge', title: 'unsaved changes'}));
      if (!show && badge) badge.remove();
    });
  }

  function sectionDirty(tab) {
    var cur = state.current ? state.current.config : {};
    if (tab === 'bottles') return canonical(state.draft.bottles) !== canonical(cur.bottles) || canonical(state.draft.availableBottles) !== canonical(cur.availableBottles);
    if (tab === 'recipes') return canonical(state.draft.recipes) !== canonical(cur.recipes);
    if (tab === 'settings') return canonical(state.draft.settings) !== canonical(cur.settings);
    return false;
  }

  function onDraftChange() {
    renderBottles();
    renderRecipes();
    renderSettings();
    renderPublishBar();
    $('publish-errors').hidden = true;
  }

  function publish() {
    state.publishing = true;
    renderPublishBar();
    var errorsNode = $('publish-errors');
    errorsNode.hidden = true;
    api('PUT', '/api/admin/config', {
      config: state.draft,
      note: $('publish-note').value.trim() || null,
      baseVersion: state.current ? state.current.version : 0,
    })
      .then(function (result) {
        state.current = {version: result.version, etag: result.etag, createdAt: result.createdAt, config: result.config};
        state.draft = clone(result.config);
        $('publish-note').value = '';
        showNotice(
          result.unchanged
            ? result.bottlesChanged
              ? 'Bottles saved. They apply at once - bottles have no versions.'
              : 'Nothing changed.'
            : 'Published v' + result.version + '. The device applies it on its next check-in.' + (result.bottlesChanged ? ' Bottles were saved live.' : '')
        );
        return Promise.all([api('GET', '/api/admin/config/versions?limit=100'), api('GET', '/api/admin/overview')]);
      })
      .then(function (results) {
        state.versions = results[0].versions;
        state.overview = results[1];
        renderAll();
        schedulePoll();
      })
      .catch(function (e) {
        if (e.message === 'unauthorized') return;
        errorsNode.innerHTML = '';
        if (e.status === 409) {
          errorsNode.appendChild(el('li', {text: 'Someone published v' + e.data.currentVersion + ' meanwhile. Reload the page (your draft will be lost) or load that version and redo your edits.'}));
        } else if (e.data && e.data.errors) {
          e.data.errors.forEach(function (line) { errorsNode.appendChild(el('li', {text: line})); });
        } else {
          errorsNode.appendChild(el('li', {text: e.message}));
        }
        errorsNode.hidden = false;
      })
      .then(function () {
        state.publishing = false;
        renderPublishBar();
      });
  }

  // ---------- events ----------

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      state.tab = tab.dataset.tab;
      renderTabs();
    });
  });

  $('auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    storeToken($('auth-token').value.trim());
    $('auth-token').value = '';
    boot();
  });
  $('auth-toggle').addEventListener('click', function () {
    if (state.token) {
      storeToken('');
      showSignedOut('');
    } else {
      $('auth-token').focus();
    }
  });

  $('import-device').addEventListener('click', function () {
    if (!confirm('Replace the draft\'s bottles, available bottles and recipes with what the device reported? Settings are kept.')) return;
    state.draft = draftFromDevice(state.overview.device);
    onDraftChange();
    state.tab = 'bottles';
    renderTabs();
  });

  $('add-slot').addEventListener('click', function () {
    var name = state.draft.availableBottles.indexOf('empty') !== -1 ? 'empty' : state.draft.availableBottles[0];
    state.draft.bottles.push({name: name, serving: 50, capacity: 1000});
    onDraftChange();
  });
  $('available-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('available-name').value.trim();
    if (!name) return;
    var exists = state.draft.availableBottles.some(function (n) { return bottleKey(n) === bottleKey(name); });
    if (!exists) state.draft.availableBottles.push(name);
    $('available-name').value = '';
    onDraftChange();
  });

  $('add-recipe').addEventListener('click', function () { openRecipeDialog(null); });
  $('add-ingredient').addEventListener('click', function () { addIngredientRow(null); });
  $('recipe-cancel').addEventListener('click', function () { $('recipe-dialog').close(); });
  $('recipe-form').addEventListener('submit', submitRecipeDialog);
  $('recipe-name').addEventListener('input', function () {
    if (!editingRecipeId) $('recipe-id').value = slug($('recipe-name').value);
  });
  IMAGE_NAMES.forEach(function (name) { $('image-names').appendChild(el('option', {value: name})); });

  $('version-close').addEventListener('click', function () { $('version-dialog').close(); });
  $('version-load').addEventListener('click', function () {
    if (!viewingVersion) return;
    state.draft = clone(viewingVersion.config);
    // Bottles aren't part of a version: keep the live ones.
    state.draft.bottles = clone(state.current.config.bottles);
    $('version-dialog').close();
    onDraftChange();
    showNotice('v' + viewingVersion.version + ' loaded into the draft - publish to make it current.');
  });
  $('version-rollback').addEventListener('click', function () {
    if (!viewingVersion) return;
    if (!confirm('Publish v' + viewingVersion.version + ' as the new current version?')) return;
    api('POST', '/api/admin/config/rollback', {version: viewingVersion.version})
      .then(function () {
        $('version-dialog').close();
        boot();
      })
      .catch(function (e) { showNotice('Rollback failed: ' + e.message, true); });
  });

  $('publish').addEventListener('click', publish);
  $('discard').addEventListener('click', function () {
    if (!confirm('Discard unsaved changes?')) return;
    state.draft = state.current ? clone(state.current.config) : draftFromDevice(state.overview && state.overview.device);
    onDraftChange();
  });

  window.addEventListener('beforeunload', function (e) {
    if (state.token && state.draft && isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  boot();
})();
