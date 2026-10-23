(function () {
  'use strict';

  var API_BASE = window.JAMES_API_BASE;
  var LOW_FILL_THRESHOLD = 0.2; // 20% remaining or less is shown as "low"

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

  loadDashboard();
  setInterval(loadDashboard, 30000);
})();
