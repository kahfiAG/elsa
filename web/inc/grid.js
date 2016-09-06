var viz_map = {
  sankey: build_sankey
};

var TRANSCRIPT = [];
var RESULT_HISTORY = [];

function AnalysisTree(){
  var self = this;
  self.tree = {
    name: '',
    data: {},
    children: [],
    parent: null
  };
  self.last = self.tree;
}
AnalysisTree.prototype.propagate = function(scope, data, branch){
  var self = this;
  var node = {
    name: scope,
    data: data,
    children: []
  };
  if (branch){
    // get parent
    console.log('last', self.last);
    if (self.last.parent){
      var parent = self.last.parent;
      node.parent = parent;
      parent.children.push(node);
    }
    else {
      node.parent = self.tree;
      self.tree.children.push(node);
    }
  }
  else {
    // Link to previous
    node.parent = self.last;
    self.last.children.push(node);
  }
  self.last = node;
  console.log(self.tree);
};

AnalysisTree.prototype.visualize = function(dom_element){
  var self = this;
  function clean_data(data){
    delete data.data;
    delete data.parent;
    for (var i = 0, len = data.children.length; i < len; i++){
      clean_data(data.children[i]);
    }
    return data;
  }
  var data = clean_data(_.cloneDeep(self.tree));
  
  console.log('clean data', data);
  $(dom_element).empty();
  var margin = {top: 20, right: 190, bottom: 30, left: 190},
  width = 660 - margin.left - margin.right,
  height = 500 - margin.top - margin.bottom;

  // declares a tree layout and assigns the size
  var treemap = d3.tree()
  .size([height, width]);

  //  assigns the data to a hierarchy using parent-child relationships
  var nodes = d3.hierarchy(data, function(d) {
    return d.children;
    });

  // maps the node data to the tree layout
  nodes = treemap(nodes);

  // append the svg object to the body of the page
  // appends a 'group' element to 'svg'
  // moves the 'group' element to the top left margin
  var svg = d3.select(dom_element).append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom),
    g = svg.append("g")
      .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

  // adds the links between the nodes
  var link = g.selectAll(".link")
    .data( nodes.descendants().slice(1))
    .enter().append("path")
    .attr("class", "link")
    .attr("d", function(d) {
       return "M" + d.y + "," + d.x
       + "C" + (d.y + d.parent.y) / 2 + "," + d.x
       + " " + (d.y + d.parent.y) / 2 + "," + d.parent.x
       + " " + d.parent.y + "," + d.parent.x;
       });

  // adds each node as a group
  var node = g.selectAll(".node")
    .data(nodes.descendants())
    .enter().append("g")
    .attr("class", function(d) { 
      return "node" + 
      (d.children ? " node--internal" : " node--leaf"); })
    .attr("transform", function(d) { 
      return "translate(" + d.y + "," + d.x + ")"; });

  // adds the circle to the node
  node.append("circle")
    .attr("r", 2.5);

  var last_pos = false;
  // adds the text to the node
  node.append("text")
    .attr("dy", 3)
    .attr("y", function(d) { 
      if (last_pos){ last_pos = false; return 13 } 
      else { last_pos = true; return -13 } })
    .attr("x", function(d) { return d.children ? -13 : 13; })
    .style("text-anchor", function(d) { 
      return d.children ? "end" : "start"; })
    .text(function(d) { return d.data.name; });

}

function Transcript(){
  var self = this;
  self.result_history = [];
  self.transcript = [];
}

Transcript.prototype.counter = function(){
  return this.result_history.length;
}

Transcript.prototype.log_query = function (data){
  this.result_history.push(data);
};

Transcript.prototype.update = function(action, data){
  var self = this;
  var scope = '';
  if (action) scope += action + ' ';
  if (typeof(data) === 'object'){
    scope += data.es_query.query.query_string.query;
    if (typeof(data.query.groupby) !== 'undefined'){
      console.log(data.query.groupby[1]);
      scope += ' (' + data.query.groupby.slice(1, data.query.groupby[0].length).join(",")
        + ')';
    }
  }
  else {
    scope += data;
  }
  self.transcript.push([action, scope]);
  $('#transcript_container').empty();
  $('#transcript_container').addClass('respect-whitespace');
  var table = document.createElement('table');
  var tbody = document.createElement('tbody');
  var indent_level = 0;
  for (var i = 0, len = self.transcript.length; i < len; i++){
    var item = self.transcript[i];
    if (item[0] === 'PIVOT') indent_level++;
    var row = document.createElement('tr');
    var cell = document.createElement('td');
    var tabs = '';
    for (var j = 0, jlen = indent_level; j < jlen; j++){
      tabs += '    ';
    }
    var text = document.createTextNode(tabs + item[1]);
    cell.appendChild(text);
    row.appendChild(cell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  $('#transcript_container').append(table);
  
  return scope;
};

var ANALYSIS_TREE = new AnalysisTree();
var TRANSCRIPT = new Transcript();

$(document).on('ready', function(){
  $('#search_form input').val('123 OR 456 | groupby srcip,srcport | sankey');

  $('#submit').on('click', function(e){
    e.preventDefault();

    //if (transcript.length) $('#transcript_container').style('height:500px;');

    var query = $('#search_form input').val();
    console.log('query: ' + query);
    $.get('http://localhost:8080/search?q=' + query
     //+ '&alerts=1'
     , 
     function(data, status, xhr){
      console.log(data, xhr, status);
      var action = TRANSCRIPT.update('', data);
      ANALYSIS_TREE.propagate(action);
      // build_bar_chart(data);
      // Draw grid of results
      // var grid_el = document.createElement('div');
      // grid_el.id = 'grid';
      // $('body').append(grid_el);
      var raw_data = [];
      for (var i = 0, len = data.results.hits.hits.length; i < len; i++){
        raw_data.push(data.results.hits.hits[i]._source);
      }
      $('#grid_container').empty();
      $('#grid_container').append(get_table(raw_data, raw_data));

      if (typeof(data.query.viz) !== 'undefined'){
        console.log(data.query.viz);
        for (var i = 0, len = data.query.viz.length; i < len; i++){
          var viz = data.query.viz[i][0];
          for (var k in data.results.aggregations){ 
            var graph = build_graph_from_hits(data.results.aggregations[k].buckets);
            viz_map[viz](graph);
          }
        }
      }
    });
  });
});


function key_as_string(datum){
  if (typeof(datum.key_as_string) !== 'undefined') return datum.key_as_string;
  return datum.key;
}

function build_bar_chart(data){
  for (var k in data.aggregations){
    var new_el = document.createElement('div');
    new_el.id = 'histogram_' + k;
    $('#container').append(new_el);
    var columns = [];
    for (var i = 0, len = data.aggregations[k].buckets.length; i < len; i++){
      console.log('bucket', data.aggregations[k].buckets[i]);

      var col = [ 
        key_as_string(data.aggregations[k].buckets[i]),
        data.aggregations[k].buckets[i].doc_count
      ];
      columns.push(col);
    }
    console.log('columns', columns);
    var chart = c3.generate({
      bindto: new_el,
      data: {
        columns: columns,
        type: 'bar'
      }
    });
    console.log('chart', chart);
  }
}

function build_histogram(data){
  for (var k in data.aggregations){
    var new_el = $('#container').appendChild('div');
    new_el.id = 'histogram_' + k;
    var x = [], y = [];
    for (var i = 0, len = data.aggregations[k].buckets.length; i < len; i++){
      x.push(data.aggregations[k].buckets[i]['key as string']);
      y.push(data.aggregations[k].buckets[i]['doc count']);
    }
  }
}

function get_table(data, full_data, onclicks, onhovers, reorder, sortby, sortdir, filter_field, filter_text){
  console.log('get_table', onclicks, onhovers, reorder, sortby, sortdir);
  if (typeof(onclicks) === 'undefined'){
    onclicks = {};
  }
  if (typeof(onhovers) === 'undefined'){
    onhovers = {};
  }
  if (typeof(reorder) === 'undefined'){
    reorder = true;
  }
  
  if (typeof(sortdir) === 'undefined') sortdir = 'asc';

  // Loop once to get all cols
  var cols = Array();
  for (var i = 0, len = full_data.length; i < len; i++){
    for (var j in full_data[i]){
      if (_.indexOf(cols, j) < 0){
        if (j === 'timestamp' || j === 'meta_ts'){
          cols.unshift(j);
        }
        else {
          cols.push(j);
        }
      }
    }
  }
  console.log('cols', cols.join(','));

  console.log('reorder', reorder);
  if (reorder){
    console.log('reordering');
    var preferredCols = ['meta_ts', 'class', 'program', 'rawmsg'];

    var ret = [];
    var others = [];
    for (var i = 0, len = cols.length; i < len; i++){
      var preferredPosition = _.indexOf(preferredCols, cols[i]);
      if (preferredPosition > -1){
        ret[preferredPosition] = preferredCols[preferredPosition];
        console.log('spliced ' + preferredCols[preferredPosition] + ' to ' + preferredPosition);
      }
      else {
        others.push(cols[i]);
      }
    }
    ret.push.apply(ret, others.sort());
    ret = _.filter(ret, function(item){ return typeof(item) !== 'undefined'; });
    cols = ret;
  }

  console.log('reordered cols', cols);

  // Now lay out the table
  var table_el = document.createElement('table');
  $(table_el).addClass('pure-table');
  
  function sortTable(l_sortby){
    console.log('sorting by ' + l_sortby);
    var parent = table_el.parentNode;
    $(table_el).empty();
    
    if (l_sortby === sortby){
      if (sortdir === 'asc'){
        sortdir = 'desc';
      }
      else {
        sortdir = 'asc';
      }
    }
    if (sortdir === 'asc'){
      $(parent).append(get_table(_.sortBy(data, l_sortby), full_data, onclicks, onhovers, reorder, l_sortby, sortdir));
    }
    else {
      $(parent).append(get_table(_.sortBy(data, l_sortby).reverse(), full_data, onclicks, onhovers, reorder, l_sortby, sortdir));      
    }
    return;
  }

  function onkeyup(e){
    var l_filter_text = this.value;
    var l_filter_field = this.name;
    console.log('filter_text', filter_text);
    
    var l_data;
    // Avoid unnecessary and unhelpful early filtering
    if (l_filter_text.length > 0 && l_filter_text.length < 3) return;
    if (l_filter_text === ''){
      l_data = full_data;
    }
    else {
      l_data = _.filter(data.slice(), function(n){
        if (n[l_filter_field] && n[l_filter_field].match(l_filter_text)) return true;
        return false;
      });
    }

    $(table_el).empty();
    var parent = table_el.parentNode;
    $(parent).append(get_table(l_data, full_data, onclicks, onhovers, reorder, sortby, sortdir, l_filter_field, l_filter_text));
    var input_el = $('input[name="' + l_filter_field + '"]')[0];
    input_el.focus();
    var val = input_el.value; //store the value of the element
    input_el.value = ''; //clear the value of the element
    input_el.value = val; 
  }

  var thead_el = document.createElement('thead');
  //$(thead_el).addClass('etch-complex-table__thead');
  var tr_el = document.createElement('tr');
  $(tr_el).addClass('etch-complex-table__thead__row');
  for (var i = 0, len = cols.length; i < len; i++){
    var field = cols[i];
    // Figure out if we are sorting by this col and if it is desc
    var sortclass = 'etch-complex-table__cell--sortasc';
    if (field === sortby && sortdir !== 'asc') 
      sortclass = 'etch-complex-table__cell--sortdesc';
    var th_el = document.createElement('th');
    $(th_el).addClass('etch-complex-table__thead__th '
      + 'etch-complex-table__cell '
      + 'etch-complex-table__cell--sortable '
      + 'etch-complex_table__cell--alignright '
      + sortclass);
    var text_el = document.createTextNode(field);
    var span_el = document.createElement('span');
    $(span_el).addClass('etch-column__title');
    $(span_el).append(text_el);
    span_el.data = field;
    $(span_el).on('click', function(e){
      console.log('click', this.data);
      sortTable(this.data);
    })
    $(th_el).append(span_el);
    var div_el = document.createElement('div');
    $(div_el).addClass('etch-field');
    var input_el = document.createElement('input');
    input_el.type = 'text';
    input_el.name = field;
    if (field === filter_field){
      input_el.value = filter_text;
    }
    $(div_el).append(input_el);
    $(input_el).on('keyup', function(e){
      if (e.keyCode !== 13) return;
      console.log('keypress');
      onkeyup.bind(this).call(e)
      // clearTimeout(EVENT_ON_KEYUP);
      // EVENT_ON_KEYUP = setTimeout(onkeyup.bind(this).call(e), 1500);
    });
    $(th_el).append(div_el);
    th_el.appendChild(text_el);
    tr_el.appendChild(th_el);
  }
  thead_el.appendChild(tr_el);
  table_el.appendChild(thead_el);

  var tbody_el = document.createElement('tbody');
  $(tbody_el).addClass('context-menu-one');

  for (var i = 0, len = data.length; i < len; i++){
    var tr_el = document.createElement('tr');
    //$(tr_el).addClass('etch-complex-table__tbody__row');
    if (i % 2 === 0){
      $(tr_el).addClass('pure-table-even');
    }
    else {
      $(tr_el).addClass('pure-table-odd');
    }
    var row = Array();
    for (var j in data[i]){
      if (_.indexOf(cols, j) > -1)
        row[_.indexOf(cols, j)] = data[i][j];
    }
    for (var j = 0; j < row.length; j++){
      var td_el = document.createElement('td');
      // $(td_el).addClass('etch-complex-table__cell '
      //   + 'etch-complex-table__cell--filtered '
      //   + 'etch-complex-table__cell--nowrap');
      var text = row[j];
      if (typeof(text) === 'undefined'){
        text = '';
      }
      $(td_el).attr('data_field', cols[j]);
      $(td_el).attr('data_value', encodeURIComponent(text));
      var text_el = document.createTextNode(text);
      if (typeof(onclicks[ cols[j] ]) !== 'undefined' 
        || typeof(onhovers[ cols[j] ]) !== 'undefined'){
        var a_el = document.createElement('a');
        // $(a_el).addClass('etch-anchor');
        a_el.href = 'javascript:void(0)';
        if (typeof(onclicks[ cols[j] ]) !== 'undefined'){
          $(a_el).on('click', onclicks[ cols[j] ]);  
        }
        if (typeof(onhovers[ cols[j] ]) !== 'undefined'){
          $(a_el).on('mouseenter', onhovers[ cols[j] ]);
        }
        a_el.appendChild(text_el);
        td_el.appendChild(a_el);
      }
      else {
        td_el.appendChild(text_el);
      }
      
      tr_el.appendChild(td_el);
    }
    tbody_el.appendChild(tr_el);
  }

  table_el.appendChild(tbody_el);
  $(table_el).contextMenu({
    selector: 'td',
    callback: function(key, options) {
      var content = $(this).text();
      console.log(this, content, key, options);
      var key = key.toUpperCase();
      
      if (key === 'PIVOT'){
        var scope = TRANSCRIPT.update(key, content);
        ANALYSIS_TREE.propagate(content, 
          TRANSCRIPT.transcript[TRANSCRIPT.transcript.length - 1], true);
      }
      else if (key === 'NOTE'){
        var div = document.createElement('div');
        div.id = 'write-note';
        var form = document.createElement('form');
        div.appendChild(form);
        var fieldset = document.createElement('fieldset');
        form.appendChild(fieldset);
        var label = document.createElement('label');
        label.innerHTML = 'Note';
        fieldset.appendChild(label);
        var input = document.createElement('input');
        input.type = 'text';
        input.size = 80;
        input.name = 'note';
        input.id = 'note';
        $(input).attr('class', 'text ui-widget-content ui-corner-all');
        fieldset.appendChild(input);
        var submit = document.createElement('input');
        submit.type = 'submit';
        $(submit).attr('tabindex', -1);
        $(submit).attr('style', 'position:absolute; top:-1000px');
        fieldset.appendChild(submit);
        
        $('#transcript_container').append(div);
        // modal
        var dialog; dialog = $( "#write-note" ).dialog({
          autoOpen: false,
          height: 200,
          width: 900,
          modal: true,
          buttons: {
            //"Create an account": function(){ console.log('here'); },
            Cancel: function() {
              dialog.dialog( "close" );
            }
          },
          close: function() {
            form[ 0 ].reset();
            allFields.removeClass( "ui-state-error" );
          }
        });
     
        var form; form = dialog.find( "form" ).on( "submit", function( event ) {
          event.preventDefault();
          console.log('SUBMIT', this);
          TRANSCRIPT.update('NOTE', $('#note').val());
          dialog.dialog('close');
        });
     
        //$( "#create-user" ).button().on( "click", function() {
          dialog.dialog( "open" );
        //});
      }
      else {
        var scope = TRANSCRIPT.update(key, content);
        ANALYSIS_TREE.propagate(content, 
          TRANSCRIPT.transcript[TRANSCRIPT.transcript.length - 1]);
      }
    },
    items: {
      pivot: {name: 'Pivot', icon: function(){ return 'fa fa-level-down fa-fw'} },
      sep: '-----',
      scope: {name: 'Scope', icon: function(){ return 'fa fa-binoculars fa-fw'} },
      sep1: '-----',
      note: {name: 'Note', icon: function(){ return 'fa fa-comment fa-fw'} },
      sep2: '-----',
      tag: {name: 'Tag', icon: function(){ return 'fa fa-hashtag fa-fw'} },
      sep3: '-----',
      like: {name: 'Like', icon: function(){ return 'fa fa-heart fa-fw'} },
    }
  });

  // $(table_el).on('click', function(e){
  //   console.log('clicked', this);
  // });
  return table_el;
}

function add_node(graph, name){
  // See if value already exists in nodes
  for (var i = 0, len = graph.nodes.length; i < len; i++){
    if (graph.nodes[i].label === name){
      return graph.nodes[i].name;
    }
  }
  
  graph.nodes.push({
    name: graph.nodes.length,
    label: name
  });
  console.log('added new node', graph.nodes[graph.nodes.length - 1]);

  return graph.nodes.length - 1;
}

function add_link(graph, src_id, dst_id, value){
  // See if this link already exists so we can add to the value
  for (var i = 0, len = graph.links.length; i < len; i++){
    if (graph.links[i].source === src_id && graph.links[i].target === dst_id){
      graph.links[i].value += value;
      return;
    }
  }
  console.log('linking ' + src_id + ' to ' + dst_id + ' with values ' +
    graph.nodes[src_id] + ' and ' + graph.nodes[dst_id]);
  graph.links.push({
    source: src_id,
    target: dst_id,
    value: value
  });
}

function build_graph_from_hits(data){
  // data should point to results.aggregations.bucketname
  var graph = {
    nodes: [],
    links: []
  };

  // Build nodes/links
  for (var i = 0, len = data.length; i < len; i++){
    for (var j = 0, jlen = data[i].keys.length; j < jlen - 1; j++){
      var src = data[i].keys[j];
      var dst = data[i].keys[j + 1];
      graph.links.push({
        source: data[i].keys[j],
        target: data[i].keys[j + 1],
        value: data[i].doc_count
      });
      // var src_id = add_node(graph, src);
      // var dst_id = add_node(graph, dst);
      // add_link(graph, src_id, dst_id, data[i].doc_count); 
    }
  }

  // Add in nodes
  for (var i = 0, len = graph.links.length; i < len; i++){
    var found = false;
    for (var j = 0, jlen = graph.nodes.length; j < jlen; j++){
      if (graph.nodes[j].name === graph.links[i].source){
        found = true;
        break;
      }
    }
    if (!found){
      console.log('Did not find ' + graph.links[i].source);
      graph.nodes.push({name: graph.links[i].source});
    }

    found = false;
    for (var j = 0, jlen = graph.nodes.length; j < jlen; j++){
      if (graph.nodes[j].name === graph.links[i].target){
        found = true;
        break;
      }
    }
    if (!found){
      console.log('Did not find ' + graph.links[i].target);
      graph.nodes.push({name: graph.links[i].target});
    }
  }

  return graph;
}

function build_sankey(graph){
  var units = "Count";
 
  var margin = {top: 10, right: 10, bottom: 10, left: 10},
      width = $('#viz_container').width() - margin.left - margin.right,
      height = $('#viz_container').height() - margin.top - margin.bottom;
  console.log('width', width, 'height', height);
   
  var formatNumber = d3.format(",.0f"),    // zero decimal places
      format = function(d) { return formatNumber(d) + " " + units; },
      color = d3.scaleOrdinal(d3.schemeCategory20);

  // var el = document.createElement('div');
  // el.id = 'chart';
  // $('body').append(el);
   
  // append the svg canvas to the page
  $("#viz_container").empty();
  var svg = d3.select("#viz_container").append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", 
            "translate(" + margin.left + "," + margin.top + ")");
   
  // Set the sankey diagram properties
  var sankey = d3.sankey()
      .nodeWidth(36)
      .nodePadding(10)
      .size([width, height]);
   
  var path = sankey.link();
   
  
   
  var nodeMap = {};
  graph.nodes.forEach(function(x) { nodeMap[x.name] = x; });
  graph.links = graph.links.map(function(x) {
    return {
      source: nodeMap[x.source],
      target: nodeMap[x.target],
      value: x.value
    };
  });

  console.log('graph', graph);

  sankey
    .nodes(graph.nodes)
    .links(graph.links)
    .layout(32);
  console.log('graph.links', graph.links);

  // add in the links
  var link = svg.append("g").selectAll(".link")
      .data(graph.links)
    .enter().append("path")
      .attr("class", "link")
      .attr("d", path)
      .style("stroke-width", function(d) { return Math.max(1, d.dy); })
      .sort(function(a, b) { return b.dy - a.dy; });

  // add the link titles
  link.append("title")
    .text(function(d) {
      return d.source.name + " → " + d.target.name + "\n" + format(d.value); 
    });

  // add in the nodes
  var node = svg.append("g").selectAll(".node")
      .data(graph.nodes)
    .enter().append("g")
      .attr("class", "node")
      .attr("transform", function(d) { 
      return "translate(" + d.x + "," + d.y + ")"; })
    .call(d3.drag()
      .subject(function(d) { return d; })
      .on("start", function() { 
      this.parentNode.appendChild(this); })
      .on("drag", dragmove));

  // add the rectangles for the nodes
  node.append("rect")
    .attr("height", function(d) { return d.dy; })
    .attr("width", sankey.nodeWidth())
    .style("fill", function(d) { 
      return d.color = color(d.name.replace(/ .*/, "")); })
    .style("stroke", function(d) { 
      return d3.rgb(d.color).darker(2); })
    .append("title").text(function(d) { 
      return d.name + "\n" + format(d.value); 
    });

  // add in the title for the nodes
  node.append("text")
    .attr("x", -6)
    .attr("y", function(d) { return d.dy / 2; })
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .attr("transform", null)
      .text(function(d) { return d.name; })
    .filter(function(d) { return d.x < width / 2; })
    .attr("x", 6 + sankey.nodeWidth())
    .attr("text-anchor", "start");

  // the function for moving the nodes
  function dragmove(d) {
    d3.select(this).attr("transform", 
        "translate(" + (
             d.x = Math.max(0, Math.min(width - d.dx, d3.event.x))
          ) + "," + (
                   d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))
            ) + ")");
    sankey.relayout();
    link.attr("d", path);
  }
}