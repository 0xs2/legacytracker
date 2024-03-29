$('[data-toggle="tooltip"]').tooltip();

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
      $(".serv").text("Error fetching server graph");
      }
    else {
      let builder = [];
      let t = [];

      data.timestamps.forEach(element => {
        t.push(moment.unix(element).format('MM/DD/YYYY (hh:mm:ss a)'));
      });

      data.servers.forEach((element) => {
        let color = element.color;

        $(`td.cl-${element.id}`).css({"color": color});
        $(`td.cl-${element.id} a`).css({"color": color});
        $(`.cb-${element.id}`).css({"color": color + "88"});

         builder.push({
          label: element.name,
          data: element.cnt,
          borderWidth: 2,
          fill: false,
          lineTension: 0,
          pointRadius: 0,
          pointHitRadius: 10,
          pointBackgroundColor: color,
          pointBorderColor: color,
          borderColor: color,
          backgroundColor: color + "22",
        })
      });
      
      options.legend.display = true;

      new Chart("myChart", {
          type: "line",
          data: {
          labels: t,
          datasets: builder,
          },
          options: options
          });
        }
  }
  });
}

  function getServerGraph() {
    let id = $("#id").val();
    let color = $("#color").val();
    $.ajax({
      url: "../api/getServerHistory",
      data: {
        id: id
      },
      method: "GET",
      success: function (data) {

        if (data.success != true) {
          $(".serv").text("Error fetching server graph");
        } else {

          let t = [];

          data.timestamps.forEach(element => {
            t.push(moment.unix(element).format('MM/DD/YYYY (hh:mm:ss a)'));
          });

          $(`.text-${id}`).css({"color": color});
          $(`.cb-${id}`).css({"color": color + "88"});

          new Chart("myChart", {
            type: "line",
            data: {
              labels: t,
              datasets: [{
                label: $("#name").val(),
                lineTension: 0,
                pointRadius: 0,
                pointHitRadius: 10,
                data: data.cnt,
                borderWidth: 2,
                fill: true,
                pointBackgroundColor: color,
                borderColor: color,
                backgroundColor: color + "22",
              }],
            },
            options: options
          });
        }
      }
    });
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

//    if they have webgl, show the model if not show a img of the skin instead
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
      // don't need this if it's not supported
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