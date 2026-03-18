$('[data-toggle="tooltip"]').tooltip();

const legacyDataProvided = typeof legacyServerData !== "undefined" ? legacyServerData : [];
const serverData = Array.isArray(legacyDataProvided) ? legacyDataProvided : [];
let globalChart;
let globalGraphState;
let activeChartIds = new Set();
const sortConfig = {
  name: { attr: 'data-name', type: 'string' },
  ip: { attr: 'data-ip', type: 'string' },
  version: { attr: 'data-version', type: 'string' },
  online: { attr: 'data-online', type: 'number' },
  lastPing: { attr: 'data-last-ping', type: 'number' },
  peak: { attr: 'data-peak', type: 'number' },
  unique: { attr: 'data-unique', type: 'number' }
};
let sortState = { key: 'online', direction: 'desc' };

let options = {
  tooltips: {
    mode: 'index'
  },
  responsive: true,
  maintainAspectRatio: false,
  legend: {display: false},
  elements: {
    point: {
      hoverRadius: 4
    },
  },
  scales: {
    xAxes: [{
      gridLines: {
        display:false
      },
      ticks: {
        display: false
      }
    }],
    yAxes: [{
      gridLines: {
        display:true
      },
      ticks: {
        display: true,
        beginAtZero: true
      }
    }]
  }
}

const cloneAxis = (axis) => ({
  ...axis,
  gridLines: { ...(axis.gridLines || {}) },
  ticks: { ...(axis.ticks || {}) }
});

const serverChartOptions = {
  ...options,
  scales: {
    xAxes: [{
      gridLines: {
        display:false
      },
      ticks: {
        display: true,
        autoSkip: true,
        maxTicksLimit: 10
      }
    }],
    yAxes: options.scales.yAxes.map(cloneAxis)
  }
};

const joinChartOptions = {
  ...options,
  scales: {
    xAxes: [{
      gridLines: {
        display:false
      },
      ticks: {
        display: true
      }
    }],
    yAxes: [{
      gridLines: {
        display:true
      },
      ticks: {
        display: true,
        beginAtZero: true
      }
    }]
  }
};

let chartMode = 'players';
let serverHistoryChart = null;
let serverHistoryData = null;
let serverChartMode = 'players';
let joinChart = null;
const AVERAGE_LINE_COLOR = '#4BC0C0';
const SERVER_MOVING_AVERAGE_WINDOW = 5;
const JOIN_BUCKET_LABELS = {
  week: 'Weekly',
  month: 'Monthly'
};
const DEFAULT_JOIN_BUCKET = 'week';
let joinBucket = null;
const SMOOTHING_WINDOW = 5;

function refreshLastPingLabels() {
  serverData.forEach(server => {
    const row = $(`tr.item-${server.id}`);
    const lastSpan = $(`#lastPing-${server.id}`);
    const firstSpan = $(`#firstPing-${server.id}`);
    const lastTimestamp = parseInt(row.attr("data-last-ping"), 10);
    const firstTimestamp = parseInt(row.attr("data-first-ping"), 10);

    const lastTimeSpan = $(`#lastPingTime-${server.id}`);

    if (!isNaN(lastTimestamp) && lastTimestamp > 0) {
      const formatted = moment.unix(lastTimestamp).fromNow();
      lastSpan.text(formatted).attr("title", moment.unix(lastTimestamp).format("lll"));
      const age = Math.max(0, Math.floor(moment().unix() - lastTimestamp));
      const state = age <= 300 ? 'fresh' : age <= 1800 ? 'warning' : 'stale';
      lastSpan.attr("data-freshness", state);
      lastTimeSpan.text(moment.unix(lastTimestamp).format("lll"));
    } else {
      lastSpan.text("n/a").attr("title", "");
      lastSpan.removeAttr("data-freshness");
      lastTimeSpan.text("");
    }

    if (!isNaN(firstTimestamp) && firstTimestamp > 0) {
      firstSpan.text(`Added ${moment.unix(firstTimestamp).fromNow()}`).attr("title", moment.unix(firstTimestamp).format("lll"));
    } else {
      firstSpan.text("");
    }
  });
}

function updateTableVisibility() {
  const visibleIds = new Set();

  serverData.forEach(server => {
    const isActive = activeChartIds.has(server.id);
    const row = $(`tr.item-${server.id}`);
    row.toggle(isActive);
    if (isActive) {
      visibleIds.add(server.id);
    }
  });

  return visibleIds;
}

function attachSortHandlers() {
  $("#serversTable").on("click", ".sort-header", function () {
    const key = $(this).data("sort");
    sortTableBy(key);
  });
}

function updateSortIndicators() {
  $(".sort-indicator").text("");
  const indicator = $(`#serversTable th[data-sort="${sortState.key}"] .sort-indicator`);
  if (indicator.length) {
    indicator.text(sortState.direction === 'asc' ? '▲' : '▼');
  }
}

function sortTableBy(key, options = {}) {
  const config = sortConfig[key];
  if (!config) {
    return;
  }

  const { direction = null, skipRebuild = false } = options;

  if (direction) {
    sortState.key = key;
    sortState.direction = direction;
  } else if (sortState.key === key) {
    sortState.direction = sortState.direction === 'desc' ? 'asc' : 'desc';
  } else {
    sortState.key = key;
    sortState.direction = 'desc';
  }

  const tbody = $("#serversTable tbody");
  const rows = tbody.children("tr").get();

  rows.sort((a, b) => {
    const valA = a.getAttribute(config.attr) || "";
    const valB = b.getAttribute(config.attr) || "";

    let cmp = 0;

    if (config.type === 'number') {
      const numA = parseFloat(valA) || 0;
      const numB = parseFloat(valB) || 0;
      cmp = numA - numB;
    } else {
      cmp = valA.toString().localeCompare(valB.toString(), undefined, { numeric: true, sensitivity: 'base' });
    }

    return sortState.direction === 'asc' ? cmp : -cmp;
  });

  tbody.append(rows);
  updateSortIndicators();
  updateTableVisibility();

  if (!skipRebuild) {
    rebuildChart();
  }
}

function resetSortState() {
  sortState = { key: 'online', direction: 'desc' };
  sortTableBy(sortState.key, { direction: 'desc', skipRebuild: true });
}

function initChartToggles(servers) {
  const container = $(".chart-controls");
  container.empty().off("change", ".chart-toggle");
  activeChartIds = new Set();

  servers.forEach(server => {
    const sanitized = server.name ? server.name.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : server.id;
    container.append(`
      <div class="form-check form-check-inline">
        <input class="form-check-input chart-toggle" type="checkbox" id="chartToggle-${server.id}" data-id="${server.id}" checked>
        <label class="form-check-label text-truncate" for="chartToggle-${server.id}">${sanitized}</label>
      </div>
    `);
    activeChartIds.add(server.id);
  });

  container.on("change", ".chart-toggle", function () {
    const id = Number($(this).data("id"));
    if ($(this).is(":checked")) {
      activeChartIds.add(id);
    } else {
      activeChartIds.delete(id);
    }
    rebuildChart();
  });
}

function applyTableColors(servers) {
  servers.forEach(server => {
    const color = server.color || "#ffffff";
    $(`td.cl-${server.id}`).css({"color": color});
    $(`td.cl-${server.id} a`).css({"color": color});
    $(`.cb-${server.id}`).css({"color": color + "88"});
  });
}

function rebuildChart() {
  if (!globalGraphState) {
    return;
  }

  const visibleIds = updateTableVisibility();
  const datasets = [];

  globalGraphState.serverList.forEach(server => {
    if (!visibleIds.has(server.id) || !activeChartIds.has(server.id)) {
      return;
    }
    const dataset = globalGraphState.datasetMap[server.id];
    if (!dataset) {
      return;
    }

    const color = dataset.color || "#ffffff";
    const values = Array.isArray(dataset.cnt) ? dataset.cnt.map(value => Number(value) || 0) : [];
    const chartValues = chartMode === 'average' ? smoothValues(values, SMOOTHING_WINDOW) : values;

    datasets.push({
      label: server.name,
      data: chartValues,
      borderWidth: 2,
      fill: false,
      lineTension: 0,
      pointRadius: 0,
      pointHitRadius: 10,
      pointBackgroundColor: color,
      pointBorderColor: color,
      borderColor: color,
      backgroundColor: color + "22",
    });
  });

  renderChart(datasets);
}

function renderChart(datasets) {
  const messageEl = $(".chart-empty-message");
  if (globalChart) {
    globalChart.destroy();
    globalChart = null;
  }

  if (!datasets.length) {
    $("#myChart").hide();
    messageEl.removeClass("d-none").text("No servers selected for the chart.");
    return;
  }

  messageEl.addClass("d-none");
  $("#myChart").show();

  globalChart = new Chart("myChart", {
    type: "line",
    data: {
      labels: globalGraphState.labels,
      datasets: datasets,
    },
    options: options
  });
}


function getStats() {
  $.ajax({
    url:"api/getStats",
    method: "GET",
    success: function(data){
      if(data.success != true) {
        $(".stats").html(`<p class="text-danger">Error fetching statistics</p>`);
      }
      else {
        $(".stats").html(`<p><div class="d-flex justify-content-between"><div class="item">Servers: <strong class="text-bolder text-success">${data.totalServers.toLocaleString()}</strong>, Online Users: <strong class="text-bolder text-success">${data.totalUsersOnline.toLocaleString()}</strong>, Unique Users: <strong class="text-bolder text-success">${data.totalUsers.toLocaleString()}</strong></div><div class="item">Pings: <strong class="text-bolder text-danger">${data.totalPings.toLocaleString()}</strong></div></div></p>`);
      }
    }
  });
}

function getGlobalGraph() {
  $.ajax({
    url:"api/getGlobalHistory",
    method: "GET",
    success: function(data){
      if(data.success != true) {
        $(".chart-empty-message").removeClass("d-none").text("Error fetching server graph");
        $("#myChart").hide();
        return;
      }

      const serverList = data.servers || [];
      const datasetMap = serverList.reduce((acc, server) => {
        acc[server.id] = server;
        return acc;
      }, {});

      globalGraphState = {
        labels: data.timestamps.map(timestamp => moment.unix(timestamp).format('MM/DD/YYYY (hh:mm:ss a)')),
        serverList: serverList,
        datasetMap: datasetMap
      };

      initChartToggles(serverList);
      resetSortState();
      applyTableColors(serverList);
      rebuildChart();
    }
  });
}

function getServerGraph() {
  const id = $("#id").val();
  const color = $("#color").val() || "#ffffff";
  const messageEl = $("#serverHistoryEmpty");
  const chartEl = $("#serverHistoryChart");

  if (!id) {
    if (messageEl.length) {
      messageEl.removeClass("d-none").text("Invalid server ID.");
    }
    return;
  }

  $.ajax({
    url: "../api/getServerHistory",
    data: {
      id: id
    },
    method: "GET",
    success: function (data) {
      if (!data.success || !Array.isArray(data.cnt) || !data.cnt.length) {
        if (chartEl.length) {
          chartEl.hide();
        }
        if (messageEl.length) {
          messageEl.removeClass("d-none").text("No history data available yet.");
        }
        serverHistoryData = null;
        return;
      }

      const labels = data.timestamps.map(element => moment.unix(element).format('MM/DD/YYYY (hh:mm:ss a)'));
      const playerHistory = data.cnt.map(value => Number(value) || 0);
      const averageHistory = smoothValues(playerHistory, SERVER_MOVING_AVERAGE_WINDOW);

      serverHistoryData = {
        labels,
        playerDataset: {
          label: $("#name").val(),
          lineTension: 0,
          pointRadius: 0,
          pointHitRadius: 10,
          data: playerHistory,
          borderWidth: 2,
          fill: true,
          pointBackgroundColor: color,
        borderColor: color,
        backgroundColor: color + "22",
      },
      averageDataset: {
        label: "Average",
          lineTension: 0,
          pointRadius: 0,
          pointHitRadius: 10,
          data: averageHistory,
          borderWidth: 2,
          fill: false,
          borderDash: [6, 6],
          pointBackgroundColor: AVERAGE_LINE_COLOR,
          borderColor: AVERAGE_LINE_COLOR,
          backgroundColor: AVERAGE_LINE_COLOR + "22",
        }
      };

      if (messageEl.length) {
        messageEl.addClass("d-none");
      }
      if (chartEl.length) {
        chartEl.show();
      }

      $(`.text-${id}`).css({"color": color});
      $(`.cb-${id}`).css({"color": color + "88"});

      renderServerHistoryChart();
    },
    error: function () {
      if (chartEl.length) {
        chartEl.hide();
      }
      if (messageEl.length) {
        messageEl.removeClass("d-none").text("Error fetching server graph");
      }
      serverHistoryData = null;
      }
  });
}

function renderServerHistoryChart() {
  const chartEl = $("#serverHistoryChart");
  const messageEl = $("#serverHistoryEmpty");
  if (!chartEl.length) {
    return;
  }

  if (!serverHistoryData || !serverHistoryData.labels || !serverHistoryData.labels.length) {
    chartEl.hide();
    if (messageEl.length) {
      messageEl.removeClass("d-none").text("No history data to display.");
    }
    return;
  }

  const dataset = serverChartMode === 'average' ? serverHistoryData.averageDataset : serverHistoryData.playerDataset;
  if (!dataset || !Array.isArray(dataset.data) || !dataset.data.length) {
    chartEl.hide();
    if (messageEl.length) {
      messageEl.removeClass("d-none").text("No history data to display.");
    }
    return;
  }

  if (messageEl.length) {
    messageEl.addClass("d-none");
  }
  chartEl.show();

  if (serverHistoryChart) {
    serverHistoryChart.destroy();
  }

  serverHistoryChart = new Chart("serverHistoryChart", {
    type: "line",
    data: {
      labels: serverHistoryData.labels,
      datasets: [dataset]
    },
    options: serverChartOptions
  });
}

function smoothValues(values, windowSize = SMOOTHING_WINDOW) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }
  const result = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const windowSlice = values.slice(start, i + 1);
    const sum = windowSlice.reduce((total, val) => total + val, 0);
    result.push(sum / windowSlice.length);
  }
  return result;
}

function setServerChartMode(mode) {
  if (!mode || serverChartMode === mode) {
    return;
  }
  serverChartMode = mode;
  $(".server-chart-mode").removeClass("active");
  $(`.server-chart-mode[data-mode="${mode}"]`).addClass("active");
  renderServerHistoryChart();
}

function initServerChartModeSwitch() {
  const buttons = $(".server-chart-mode");
  if (!buttons.length) {
    return;
  }
  buttons.on("click", function () {
    const mode = $(this).data("mode");
    setServerChartMode(mode);
  });
}

function getPlayerJoins(bucketParam) {
  const id = $("#id").val();
  if (!id) {
    return;
  }

  const bucket = bucketParam && JOIN_BUCKET_LABELS[bucketParam] ? bucketParam : (joinBucket || DEFAULT_JOIN_BUCKET);
  joinBucket = bucket;
  const label = JOIN_BUCKET_LABELS[bucket] || JOIN_BUCKET_LABELS[DEFAULT_JOIN_BUCKET];

  const messageEl = $("#joinChartEmpty");
  const chartEl = $("#joinChart");

  if (messageEl.length) {
    messageEl.removeClass("d-none").text(`Loading ${label} join data...`);
  }

  $.ajax({
    url:"../api/getServerJoins",
    data: {id: id, bucket: bucket},
    method: "GET",
    success: function(data) {
      if (!data.success || !Array.isArray(data.timestamps) || !data.timestamps.length) {
        if (chartEl.length) {
          chartEl.hide();
        }
        if (messageEl.length) {
          messageEl.removeClass("d-none").text(`No ${label.toLowerCase()} join data available yet.`);
        }
        return;
      }

      const labels = data.timestamps.map(timestamp => moment.unix(timestamp).format('MM/DD/YYYY (hh:mm a)'));
      const counts = Array.isArray(data.counts) ? data.counts.map(value => Number(value) || 0) : [];

      if (!counts.length) {
        if (chartEl.length) {
          chartEl.hide();
        }
        if (messageEl.length) {
          messageEl.removeClass("d-none").text(`No ${label.toLowerCase()} join activity recorded yet.`);
        }
        return;
      }

      if (messageEl.length) {
        messageEl.addClass("d-none");
      }
      if (chartEl.length) {
        chartEl.show();
      }

      if (joinChart) {
        joinChart.destroy();
      }

      const fillColor = $("#color").val() ? $("#color").val() + "66" : "#4BC0C0";
      const borderColor = $("#color").val() || "#4BC0C0";

      joinChart = new Chart("joinChart", {
        type: "bar",
        data: {
          labels: labels,
          datasets: [{
            label: `${label} player joins`,
            data: counts,
            backgroundColor: fillColor,
            borderColor: borderColor,
            borderWidth: 1
          }]
        },
        options: joinChartOptions
      });
    },
    error: function() {
      if (chartEl.length) {
        chartEl.hide();
      }
      if (messageEl.length) {
        messageEl.removeClass("d-none").text("Error fetching join data.");
      }
    }
  });
}

function setJoinBucket(bucket) {
  if (!bucket || !JOIN_BUCKET_LABELS[bucket]) {
    bucket = DEFAULT_JOIN_BUCKET;
  }
  joinBucket = bucket;
  $(".join-chart-bucket").removeClass("active");
  $(`.join-chart-bucket[data-bucket="${bucket}"]`).addClass("active");
  getPlayerJoins(bucket);
}

function initJoinChartControls() {
  const buttons = $(".join-chart-bucket");
  if (!buttons.length) {
    return;
  }
  buttons.on("click", function () {
    const bucket = $(this).data("bucket");
    setJoinBucket(bucket);
  });
  setJoinBucket(DEFAULT_JOIN_BUCKET);
}

var isToggled = true;

$("#toggle").click(function () {
  if (isToggled == true) {
    $(".chart").hide();
    $("#toggle").text("Show Chart");
    isToggled = false;
  } else {
    $(".chart").show();
    $("#toggle").text("Hide Chart");
    isToggled = true;
  }
});

$('.copybtn').tooltip({
  trigger: 'click',
  placement: 'bottom'
});

function setTooltip(btn, message) {
  $(btn).tooltip('hide')
    .attr('data-original-title', message)
    .tooltip('show');
}

function hideTooltip(btn) {
  setTimeout(function () {
    $(btn).tooltip('hide');
  }, 1000);
}

var clipboard = new ClipboardJS('.copybtn');

clipboard.on('success', function (e) {
  setTooltip(e.trigger, 'Copied to Clipboard');
  hideTooltip(e.trigger);
});

$("#searchForm").on("submit", function(event){
  event.preventDefault();
  var query = $("#search").val();
  $.ajax({
    url:"../api/getPlayer",
    data: {player: query},
    method: "GET",
    success: function(data){
      if(!data.success) {
        Swal.fire({
          title: "Uh oh!",
          icon: "error",
          text: "This user was not found in any servers.",
          allowOutsideClick: false,
          allowEscapeKey: false
        })
      }
      else {
        window.location = `../user/${data.player}`;
      }
    }
  });
});

function getPlayers() {
  $.ajax({
    url:"../api/getPlayersOnline",
    data: {id: $("#id").val()},
    method: "GET",
    success: function(data){
      if(data.count == 0) {
        $(".player-list").html(`<p class="text-danger text-bold">No players are online :(</p>`);
      }
      else {
        let d = [];
        data.players.forEach(element => {
          d.push(`<a href="../user/${element}">${element}</a>`);
        });
        $(".player-list").html(d.join(", "));
      }
    }
  });
}

function showPlayerModel(uuid) {
  if (checkWebGLSupport()) {
    let skinViewer = new skinview3d.SkinViewer({
      canvas: document.getElementById("player"),
      skin: `https://skins.legacyminecraft.com/skins/${!uuid ? '00000000-0000-0000-0000-000000000000' : uuid}`
    });

    skinViewer.width = 350;
    skinViewer.height = 350;
    skinViewer.controls.enableZoom = false
    skinViewer.zoom = 0.8;
    skinViewer.fov = 85;
    skinViewer.animation = new skinview3d.WalkingAnimation();
    skinViewer.animation.headBobbing = false;
    skinViewer.animation.speed = 0.5;
  } else {
    $("#player").hide()
    $("#playerImg").attr({
      "src": `https://visage.surgeplay.com/full/250/${!uuid ? 'null.png' : uuid}`
    }).show();
  }
}

function checkWebGLSupport() {
  if (window.WebGLRenderingContext) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (context && context instanceof WebGLRenderingContext) {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}

function initChartModeButtons() {
  const buttons = $(".chart-mode-btn");
  if (!buttons.length) {
    return;
  }
  buttons.on("click", function () {
    const mode = $(this).data("mode");
    if (!mode) {
      return;
    }
    chartMode = mode;
    buttons.removeClass("active");
    $(this).addClass("active");
    rebuildChart();
  });
}

initChartModeButtons();
initServerChartModeSwitch();
