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
      $(".stats").html(`<p>Servers: <strong class="text-bolder text-success">${data.totalServers}</strong>, Online Users: <strong class="text-bolder text-success">${data.totalUsersOnline}</strong>, Unique Users: <strong class="text-bolder text-success">${data.totalUsers}</strong></p>`);
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

        $(`td.cl-${element.id}`).css({"background": color + "11", "color": color});
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
      $(".chart").show();
      $("#toggle").text("Hide Chart");


      isToggled = false;
    } else {
      $(".chart").hide();
      $("#toggle").text("Show Chart");
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
      url:"api/getPlayer",
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
        let builder = [];
        data.servers.forEach(element => {
            builder.push(element.server);
        });

        if(data.uuid != null) {
          img = `https://crafatar.com/avatars/${data.uuid}?size=100&overlay`;
        }
        else {
          img = `https://crafatar.com/avatars/8667ba71-b85a-4004-af54-457a9734eed7?size=100`;
        }
      
        Swal.fire({
          title: data.player,
          imageUrl: img,
          imageHeight: 100,
          imageAlt: data.player,
          html: `Is a Mojang Account: <strong>${data.isValid}</strong><br>Servers: <strong>${builder.join("</strong><strong>, ")}</strong>`,
          allowOutsideClick: false,
          allowEscapeKey: false
          }) 
      }
    }
    });
    });