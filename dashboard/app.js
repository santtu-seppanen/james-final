(function () {
  'use strict';

  var API_BASE = window.JAMES_API_BASE;
  var LOW_FILL_THRESHOLD = 0.2; // 20% remaining or less is shown as "low"

  var state = {bottles: [], recipes: [], availableBottles: []};
  var adminToken = readToken();
  var editMode = false;

  function readToken() {
    try {
      return sessionStorage.getItem('jamesAdminToken') || '';
    } catch (e) {
      return '';
    }
  }

  function storeToken(token) {
    adminToken = token;
    try {
      if (token) sessionStorage.setItem('jamesAdminToken', token);
      else sessionStorage.removeItem('jamesAdminToken');
    } catch (e) {
      // sessionStorage unavailable; the token just lasts until reload
    }
  }

  function formatMl(ml) {
    if (ml >= 1000) {
      return (ml / 1000).toFixed(1) + ' L';
    }
    return ml + ' ml';
  }

  function formatRelativeTime(isoString) {
    if (!isoString) {
      return 'never';
    }
    var deltaMs = Date.now() - new Date(isoString).getTime();
    var minutes = Math.round(deltaMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + ' h ago';
    return Math.round(hours / 24) + ' d ago';
  }

  function renderStatus(status) {
    var badge = document.getElementById('status-badge');
    var text = document.getElementById('status-text');

    badge.className = 'status-badge ' + (status.online ? 'status-badge--online' : 'status-badge--offline');
    text.textContent = status.online ? 'Online' : 'Offline';

    document.getElementById('stat-drinks').textContent = status.drinksServed;
    document.getElementById('stat-alcohol').textContent = formatMl(status.alcoholServedMl);
    document.getElementById('stat-lastseen').textContent = formatRelativeTime(status.lastSeen);
  }

  function renderBottles(bottles) {
    var list = document.getElementById('bottle-list');
    list.innerHTML = '';

    if (bottles.length === 0) {
      list.innerHTML = '<li class="empty-state">No bottles configured yet.</li>';
      return;
    }

    bottles.forEach(function (bottle) {
      var ratio = bottle.originalCapacityMl > 0 ? bottle.capacityMl / bottle.originalCapacityMl : 0;
      var percent = Math.max(0, Math.min(1, ratio)) * 100;
      var isLow = ratio <= LOW_FILL_THRESHOLD;

      var li = document.createElement('li');
      li.className = 'bottle-row';
      li.innerHTML =
        '<span class="bottle-row__name">' + escapeHtml(bottle.name) + '</span>' +
        '<span class="bottle-row__track"><span class="bottle-row__fill' +
        (isLow ? ' bottle-row__fill--low' : '') +
        '" style="width:' + percent.toFixed(0) + '%"></span></span>' +
        '<span class="bottle-row__value">' + formatMl(bottle.capacityMl) + '</span>';
      if (editMode) {
        li.className += ' bottle-row--editable';
        li.appendChild(makeButton('Edit', function () { openBottleDialog(bottle); }));
      }
      list.appendChild(li);
    });
  }

  function renderRecipes(recipes) {
    var grid = document.getElementById('recipe-grid');
    grid.innerHTML = '';

    if (recipes.length === 0) {
      grid.innerHTML = '<p class="empty-state">No recipes configured yet.</p>';
      return;
    }

    recipes.forEach(function (recipe) {
      var card = document.createElement('div');
      card.className = 'recipe-card';
      var ingredientItems = (recipe.ingredients || [])
        .map(function (i) {
          return '<li>' + escapeHtml(i.name) + ' (' + i.serving + ' ml)</li>';
        })
        .join('');
      card.innerHTML =
        '<div class="recipe-card__name">' + escapeHtml(recipe.friendlyName) + '</div>' +
        '<ul class="recipe-card__ingredients">' + ingredientItems + '</ul>';
      if (editMode) {
        var actions = document.createElement('div');
        actions.className = 'recipe-card__actions';
        actions.appendChild(makeButton('Edit', function () { openDialog(recipe); }));
        actions.appendChild(makeButton('Delete', function () { deleteRecipe(recipe); }));
        card.appendChild(actions);
      }
      grid.appendChild(card);
    });
  }

  function renderPours(pours) {
    var body = document.getElementById('pours-body');
    body.innerHTML = '';

    if (pours.length === 0) {
      body.innerHTML = '<tr><td colspan="3" class="empty-state">No pours recorded yet.</td></tr>';
      return;
    }

    pours.forEach(function (pour) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(pour.friendly_name || pour.drink_name) + '</td>' +
        '<td>' + formatMl(pour.alcohol_ml) + '</td>' +
        '<td>' + formatRelativeTime(pour.poured_at) + '</td>';
      body.appendChild(tr);
    });
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value == null ? '' : value);
    return div.innerHTML;
  }

  function loadDashboard() {
    fetch(API_BASE + '/api/dashboard')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        state.bottles = data.bottles;
        state.recipes = data.recipes;
        state.availableBottles = data.availableBottles || [];
        renderStatus(data.status);
        renderBottles(data.bottles);
        renderRecipes(data.recipes);
        renderPours(data.recentPours);
      })
      .catch(function (err) {
        document.getElementById('status-text').textContent = 'Could not reach backend';
        console.error('Failed to load dashboard data', err);
      });
  }

  // --- Recipe editing (needs the admin token; edits are queued for the Pi) ---

  var dialog = document.getElementById('recipe-dialog');
  var editingRecipeId = null;

  function makeButton(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--ghost btn--small';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function showNotice(message, isError) {
    var el = document.getElementById('edit-notice');
    el.textContent = message;
    el.className = 'notice' + (isError ? ' notice--error' : '');
    el.hidden = !message;
  }

  function sendCommand(command) {
    return sendAdmin('/api/admin/recipes', command);
  }

  function sendAdmin(path, command) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: 'Bearer ' + adminToken},
      body: JSON.stringify(command),
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (response.status === 401) {
          storeToken('');
          setEditMode(false);
          throw new Error('Wrong admin token.');
        }
        if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status);
        return body;
      });
    });
  }

  function setEditMode(on) {
    editMode = on;
    document.getElementById('edit-toggle').textContent = on ? 'Done' : 'Edit';
    document.getElementById('add-recipe').hidden = !on;
    showNotice(on ? 'Changes reach the bot within about a minute.' : '', false);
    renderRecipes(state.recipes);
    renderBottles(state.bottles);
  }

  function deleteRecipe(recipe) {
    if (!confirm('Delete "' + recipe.friendlyName + '"?')) return;
    sendCommand({op: 'delete', recipeId: recipe.id})
      .then(function () { showNotice('Delete queued - the bot applies it within about a minute.', false); })
      .catch(function (e) { showNotice(e.message, true); });
  }

  function addIngredientRow(ingredient) {
    var row = document.createElement('div');
    row.className = 'ingredient-row';

    var select = document.createElement('select');
    select.required = true;
    state.bottles.forEach(function (bottle) {
      var option = document.createElement('option');
      option.value = bottle.name;
      option.textContent = bottle.name + ' (' + bottle.servingMl + ' ml steps)';
      option.dataset.step = bottle.servingMl;
      select.appendChild(option);
    });
    if (ingredient) select.value = ingredient.name;

    var amount = document.createElement('input');
    amount.type = 'number';
    amount.min = 1;
    amount.required = true;
    amount.value = ingredient ? ingredient.serving : '';
    amount.placeholder = 'ml';

    var remove = makeButton('✕', function () { row.remove(); });
    remove.setAttribute('aria-label', 'Remove ingredient');

    row.appendChild(select);
    row.appendChild(amount);
    row.appendChild(remove);
    document.getElementById('ingredient-rows').appendChild(row);
  }

  function openDialog(recipe) {
    editingRecipeId = recipe ? recipe.id : null;
    document.getElementById('dialog-title').textContent = recipe ? 'Edit drink' : 'Add drink';
    document.getElementById('recipe-name').value = recipe ? recipe.friendlyName : '';
    document.getElementById('ingredient-rows').innerHTML = '';
    var existing = recipe ? recipe.ingredients || [] : [];
    // Ingredients for bottles that are no longer loaded can't be poured; drop them.
    existing.filter(function (i) {
      return state.bottles.some(function (b) { return b.name.toUpperCase() === String(i.name).toUpperCase(); });
    }).forEach(function (i) {
      var bottle = state.bottles.filter(function (b) { return b.name.toUpperCase() === String(i.name).toUpperCase(); })[0];
      addIngredientRow({name: bottle.name, serving: i.serving});
    });
    if (!document.getElementById('ingredient-rows').children.length) addIngredientRow();
    var err = document.getElementById('dialog-error');
    err.hidden = true;
    dialog.showModal();
  }

  function submitDialog(event) {
    event.preventDefault();
    var err = document.getElementById('dialog-error');
    var ingredients = [];
    var problem = '';
    Array.prototype.forEach.call(document.querySelectorAll('.ingredient-row'), function (row) {
      var select = row.querySelector('select');
      var serving = Number(row.querySelector('input').value);
      var step = Number(select.selectedOptions[0].dataset.step);
      if (!serving || serving % step !== 0) problem = select.value + ': amount must be a multiple of ' + step + ' ml';
      ingredients.push({name: select.value, serving: serving});
    });
    if (problem) {
      err.textContent = problem;
      err.hidden = false;
      return;
    }

    sendCommand({
      op: 'upsert',
      recipeId: editingRecipeId,
      recipe: {friendlyname: document.getElementById('recipe-name').value.trim(), ingredients: ingredients},
    })
      .then(function () {
        dialog.close();
        showNotice('Saved - the bot applies it within about a minute.', false);
      })
      .catch(function (e) {
        err.textContent = e.message;
        err.hidden = false;
      });
  }

  // --- Bottle editing ---

  var bottleDialog = document.getElementById('bottle-dialog');
  var editingSlot = null;

  function openBottleDialog(bottle) {
    editingSlot = bottle.slot;
    document.getElementById('bottle-dialog-title').textContent = 'Slot ' + (bottle.slot + 1);

    var select = document.getElementById('bottle-name');
    select.innerHTML = '';
    var names = state.availableBottles.slice();
    if (names.indexOf(bottle.name) === -1) names.unshift(bottle.name);
    names.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    select.value = bottle.name;

    document.getElementById('bottle-capacity').value = bottle.capacityMl;
    document.getElementById('bottle-serving').value = String(bottle.servingMl);
    document.getElementById('bottle-error').hidden = true;
    bottleDialog.showModal();
  }

  function submitBottleDialog(event) {
    event.preventDefault();
    var err = document.getElementById('bottle-error');
    sendAdmin('/api/admin/bottles', {
      slot: editingSlot,
      bottle: {
        name: document.getElementById('bottle-name').value,
        capacity: Number(document.getElementById('bottle-capacity').value),
        serving: Number(document.getElementById('bottle-serving').value),
      },
    })
      .then(function () {
        bottleDialog.close();
        showNotice('Saved - the bot applies it within about a minute.', false);
      })
      .catch(function (e) {
        err.textContent = e.message;
        err.hidden = false;
      });
  }

  document.getElementById('bottle-cancel').addEventListener('click', function () { bottleDialog.close(); });
  document.getElementById('bottle-form').addEventListener('submit', submitBottleDialog);

  document.getElementById('edit-toggle').addEventListener('click', function () {
    if (editMode) return setEditMode(false);
    if (!adminToken) {
      var token = window.prompt('Admin token');
      if (!token) return;
      storeToken(token.trim());
    }
    setEditMode(true);
  });
  document.getElementById('add-recipe').addEventListener('click', function () { openDialog(null); });
  document.getElementById('add-ingredient').addEventListener('click', function () { addIngredientRow(); });
  document.getElementById('dialog-cancel').addEventListener('click', function () { dialog.close(); });
  document.getElementById('recipe-form').addEventListener('submit', submitDialog);

  loadDashboard();
  setInterval(loadDashboard, 30000);
})();
