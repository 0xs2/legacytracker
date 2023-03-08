$('.copybtn').tooltip({
    trigger: 'click',
    placement: 'bottom'
  });

  function setTooltip(message, btn) {
    $(btn).tooltip('hide')
      .attr('data-original-title', message)
      .tooltip('show');
  }

  function hideTooltip(btn) {
    setTimeout(function() {
      $(btn).tooltip('hide');
    }, 1000);
  }


var clipboard = new ClipboardJS('.copybtn');

clipboard.on('success', function(e) {
    setTooltip('Copied!', '.copybtn');
    hideTooltip(e.trigger, '.copybtn');
});

  $('[data-toggle="tooltip"]').tooltip(); 

let colorArray = ['#FF6633', '#66991A', '#33FFCC', 
'#4D8066', '#809980', '#E6FF80', '#1AFF33', '#999933', 
'#E64D66', '#4DB380', '#FF4D4D', '#99E6E6', '#6666FF'];
