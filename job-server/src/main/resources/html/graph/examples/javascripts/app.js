/*global console,$,XMLHttpRequest,document,ace,Handlebars,_*/
var app = function () {

    "use strict";
    var esURL = "http://labs.imaginea.com/betterdocs",//"http://localhost:9200/parsed"
        localesURL="http://172.16.12.241:9200/parsed",
        resultSize = 100,
        analyzedProjContainer = $("#analyzedProj"),
        resultTreeContainer = $("#resultTreeContainer"),
        resultTreeTemplateHTML = $("#result-tree-template").html(),
        resultTemplateHTML = $("#result-template").html(),
        resultTreeTemplate = Handlebars.compile(resultTreeTemplateHTML),
        resultTemplate = Handlebars.compile(resultTemplateHTML),
        Range = ace.require('ace/range').Range,
        errorElement = $("#connectionError"),
        leftPanel = $("#leftPanel"),
        rightSideContainer = $("#rightSideContainer"),
        expandIcon = $("#expand"),
        compressIcon = $("#compress"),
        errorMsgContainer = $("#errorMsg"),
        searchMetaContainer = $('#searchMeta'),
        methodsContainer = $("#methodsContainer"),
        methodsContainerTemplateHTML = $("#common-usage-template").html(),
        methodsContainerTemplate = Handlebars.compile(methodsContainerTemplateHTML),
        fileTab = $("#fileTab"),
        methodTab = $("#methodTab"),
        graphTab = $("#graphTab"),
        usageTab = $("#usageTab"),
        usageContainer = $("#usage-container"),
        graphContainer = $("#graph-container"),
        currentResult = [],
        currentResultInRightUsagePane=[],
        commonMethods = [],
        docsBaseUrl = "http://labs.imaginea.com/java7docs/api/",
        g = {nodes: [],edges: []},
        invisibleNodes = {},
        selectedNodes = {},
        selectedEdges = {},
        defaultNodeColor = '#000',
        selectedNodeColor = '#00f',
        svg,
        selectedPath=[],
        graph,
        orginalLinks,
        orginalNodes,
        maxNodeSize,
        maxLinkSize,
        graphTabWidth,
        graphTabHeight,
        noOfFilesInUsage=10;

    Handlebars.registerHelper('stringifyFunc', function (fnName, index, lines) {
        return "app." + fnName + "All('result" + index + "-editor',[" + lines + "])";
    });

    Handlebars.registerHelper('updateEditorFn', function (file) {
        return "app.showFileContent([" + JSON.stringify(file) + "])";
    });

    Handlebars.registerHelper('displayDoc', function (method) {
        var result = "";
        if (method.url.search("java") === 0) {
            result = "app.showDocumentation(" + JSON.stringify(method) + ")";
        }
        return result;
    });

    Handlebars.registerHelper('docUrl', function (url) {
        var result = "javascript:void(0);";
        if (url.search("java") === 0) {
            result = "http://docs.oracle.com/javase/7/docs/api/" + url;
        }
        return result;
    });

    function loadRepoList() {
        queryES("repository", {
            "query" : {
                "match_all" : {}
            },
            "sort" : [ {
                "stargazersCount" : {
                    "order" : "desc"
                }
            } ]
        }, 750, function(result) {
            result.forEach(function(repo) {
                var repoLabel = repo._source.login + "/" + repo._source.name;
                $("#repoList").append($('<option>', {
                    value : repoLabel,
                    text : repoLabel
                }));
            });

        });
    }

      function init() {

        var width=5000,
            height=5000;
        graphTabWidth=graphTab.width();
        graphTabHeight=graphTab.height();
        
        //create SVG tag
        svg = d3.select("#graph-container").append("svg:svg")
            .attr("width", width)
            .attr("height", height);
        var screenHeight = screen.availHeight, topPanel = $(".topPanel")
                .outerHeight(), containerHeight;

        if (screenHeight < 800) {
            containerHeight = screenHeight - 2 * (topPanel + 10);
        } else {
            containerHeight = screenHeight - 3 * topPanel;
        }

        $(".container").height(containerHeight);

        var ht = Math.floor(($("#leftPanel").height() - 21) / 14);
        ht = (ht <= 40) ? ht - 8 : ht - 11;

        $("#repoList").attr("size", ht);
        $("#searchByFQN").submit(function(evt) {
            evt.preventDefault();
            app.search($("#searchString").val());
            app.submitClassForm($("#searchString").val());
            
        });

        $(document).on(
                'close',
                '.remodal',
                function(e) {
                    if (e.reason === "confirmation") {
                        app.saveConfig($("#elasticSearchURL").val(), $(
                                "#resultSize").val());
                    }
                });

        searchMetaContainer.hide();
        compressIcon.hide();
        // hack for setting same height for both containers on different screens
        $(".leftPanelContent").height(rightSideContainer.height() - 40);
        loadRepoList();
    }

    function submitClassForm(clazz) {
        $.ajax({
                    url : 'http://172.16.12.241:8090/jobs?appName=test&classPath=com.betterdocs.spark.jobs.BuildCallGraphJob&context=test-context&sync=true',
                    type : 'POST',
                    data : 'class="' + clazz
                            + '",support="0.25",excludeTests="true"',
                    success : function (result){
                        callGraphSuccess(result, clazz);
                        updateCommonMethods(result,clazz);
                    }
                });

        return false;

    }

    function updateCommonMethods(d,clazz){
        var jsonData = JSON.parse(d.result);
        var nodes=jsonData.nodes;
        var processedData=processGraphData(nodes);

        var groupedByClass = _.groupBy(processedData, function (entry) {
                return entry.fullClassPath;
            }),
            groupedMethods = _.map(groupedByClass, function (nodesData, label) {
            return {
                className: label,
                url:nodesData[0].url,
                methods: _.unique(nodesData, _.iteratee('method'))
            }
            });

        methodsContainer.html("");    

        methodsContainer.html(methodsContainerTemplate({"groupedMethods": groupedMethods}));
    }
    

    function processGraphData(nodes){
        var result=[];
        nodes.forEach(function(node){
           var element={};
            element.id=node.id;
            element.size=node.size;
            var objectWithDetails=getclassAndMethodFromNode(node);
            element.fullClassPath=(objectWithDetails).className;
            element.method=(objectWithDetails).methodName;
            element.url=(objectWithDetails).url;
            result.push(element);
        });

        return result;
    }

    function getclassAndMethodFromNode(node){
        var tokens=node.label.split(".");
        var methodName=tokens[tokens.length-1];
        var className=tokens[0];
        var url=tokens[0];
        for(var ii=1,ll=tokens.length-1;ii<ll;ii++){
            className+='.';
            className+=tokens[ii];
            url+='/';
            url+=tokens[ii];
        }
        url+='.html';
        return {
            className:className,
            methodName:methodName,
            url:url
        };
    }

    function callGraphSuccess(d, clazz) {
            //Read the data from d.result
            graph = JSON.parse(d.result);
            orginalLinks=graph.edges;
            orginalNodes=graph.nodes;
            maxNodeSize=orginalNodes[0].size;
            maxLinkSize=orginalLinks[0].size;
            checkIfMultipleLinkBetweenTwoNode(orginalNodes,orginalLinks);
            populateDegreeAndFindMaxLinkSize(orginalNodes,orginalLinks);
            findMaxNodeSize(orginalNodes);
            selectedPath=[];
            var startNodes=[],
                startLinks=[];
            var rootNode=getRootNode(); 
            startNodes[0]=rootNode;
            svg.selectAll("*").remove();
            createGraph(startNodes,startLinks);

            $('#graph-usage-submit').on('click',function(){
                var searchString="";
                if(selectedPath && selectedPath.length>0){
                    selectedPath.forEach(function(pathId){
                        searchString+=lookupLink("id",pathId).source.label;
                        searchString+=',';
                    });

                    searchString+=lookupLink("id",selectedPath[selectedPath.length-1]).target.label;
                    search(searchString);
                }
            });
            function lookupLink(property,propertyValue ) {
                for(var i = 0, len = orginalLinks.length; i < len; i++) {
                    if( orginalLinks[ i ][property] === propertyValue ){
                            return orginalLinks[i];
                        }
                    }
            }
            function lookupNode(property,propertyValue ) {
                for(var i = 0, len = orginalNodes.length; i < len; i++) {
                    if( orginalNodes[ i ][property] === propertyValue ){
                            return orginalNodes[i];
                        }
                    }
            }

            function checkIfMultipleLinkBetweenTwoNode(nodes,links){
                for(var ii=0,ll=links.length;ii<ll;ii++){
                    for(var jj=ii;jj<links.length;jj++){
                        if(links[ii].source===links[jj].target &&
                            links[ii].target===links[jj].source){
                                links[ii].linknum = "yes";
                        }
                    }
                }
            }

            //This function act as init method and add out degree and as well as max size
            function populateDegreeAndFindMaxLinkSize(nodes,links){
                for(var ii=0,ll=links.length;ii<ll;ii++){
                    var sourceNode=lookupNode("id",links[ii].source);
                    var targetNode=lookupNode("id",links[ii].target);
                    if(sourceNode){
                        if(sourceNode.outDegree){
                            sourceNode.outDegree.push(links[ii]);
                        }else{
                            sourceNode.outDegree=[links[ii]];
                        }
                    }
                    links[ii].source=sourceNode;
                    links[ii].target=targetNode;

                    if(links[ii].size>maxLinkSize){
                        maxLinkSize=links[ii].size;
                    }
                }
            }
            function findMaxNodeSize(nodes){
                for(var ii=0,ll=nodes.length;ii<ll;ii++){
                    if(nodes[ii].size>maxNodeSize){
                        maxNodeSize=nodes[ii].size;
                    }
                }
            }
            function getRootNode(){
                for(var ii=0,ll=orginalNodes.length;ii<ll;ii++){
                    if(orginalNodes[ii].outDegree && orginalNodes[ii].outDegree.length>0 
                        && orginalNodes[ii].label.indexOf(clazz)!=-1){
                        return orginalNodes[ii];
                    }
                }
            }
            function getCircleRadius(size){
                var maxRadiusAllowed=30;
                return (maxRadiusAllowed/maxNodeSize)*size;
            }
            function getLinkThickness(size){
                var maxThicknessAllowed=3;
                var thikness=(maxThicknessAllowed/maxLinkSize)*size;
                if(thikness<.5){
                    thikness=.5;
                }
                return thikness;
            }

            function getTextFromData(d){
                var fullLabel=d.label;
                var labelToken=fullLabel.split(".");
                if(labelToken && labelToken.length>=1){
                    return labelToken[labelToken.length-2]+"."+labelToken[labelToken.length-1];
                }else{
                    return d.label;
                }
            }


            function createGraph(nodes,links){
                var width=1000,
                height=1000;
                var actualLength=100;

                nodes[0].fixed=true;
                nodes[0].x=graphTabWidth/2;
                nodes[0].y=40;

                var force = d3.layout.force()
                    .nodes(d3.values(nodes))
                    .links(links)
                    .linkStrength(1)
                    .linkDistance(200)
                    .on("tick", tick)
                    .start();

                //Per-type markers, as they don't inherit styles.
                var marker=svg.append("svg:defs").selectAll("marker");
                var circle=svg.append("svg:g").selectAll("circle");
                var path = svg.append("svg:g").selectAll("path");
                var text = svg.append("svg:g").selectAll("text");
                var textShallow=svg.append("svg:g").selectAll("text");

                marker=marker.data(["suit","changedSuit"])
                    .enter().append("svg:marker")
                    .attr("id", String)
                    .attr("viewBox", "0 -5 10 10")
                    .attr("refX", 10)
                    .attr("markerWidth", 6)
                    .attr("markerHeight", 6)
                    .attr("orient", "auto")
                    .append("svg:path")
                    .attr("class",function(d){return d+"Path";})
                    .attr("d", "M0,-5L10,0L0,5");

                path=path.data(force.links(),function(d) { return d.source.id + "-" + d.target.id; })
                .enter().append("svg:path")
                .attr("class", "link")
                .attr("marker-end", "url(#suit)")
                .attr("id",function(d){return "path"+d.id})
                .on("click",pathClicked)
                .on("mouseover",pathMouseOver)
                .on("mouseout",pathMouseOut);

                circle=circle.data(force.nodes(),function(d) { return d.id;})
                .enter().append("svg:circle")
                .attr("class",function(d){
                    var outDegreeOfNode=(lookupNode("id",d.id)).outDegree;
                    return (outDegreeOfNode && outDegreeOfNode.length>0)? "clickableNode" : "NonClickableNode";
                })
                .attr("id",function(d) { return 'circle'+d.id;})
                .attr("r", function(d){
                        return getCircleRadius(d.size);
                })
                .on("mouseover",circleMouseOver)
                .on("mouseout",circleMouseOut)
                .on("click",circleDoubleClicked);

                
                textShallow=textShallow.data(force.nodes(),function(d) { return d.id;}).enter().append("svg:text")
                    .attr("x", 8)
                    .attr("y", ".31em")
                    .attr("class", "nodeShadow")
                    .attr("id",function(d){return "textShadow"+d.id})
                text=text.data(force.nodes(),function(d) { return d.id;})
                    .enter().append("svg:text")
                    .attr("x", 8)
                    .attr("y", ".31em")
                    .attr("class", "nodeText")
                    .attr("id",function(d){return "text"+d.id})

                // Use elliptical arc path segments to doubly-encode directionality.
                function tick() {
                      if(path.attr){
                        path.attr("d", linkArc);
                      }

                    // circle.each(gravity(e.alpha))
                    // .attr("cx", function(d) { return d.x = Math.max(getCircleRadius(d.size), Math.min((width - getCircleRadius(d.size))+20, d.x))})

                    // .attr("cy", function(d) { return d.y = Math.max(getCircleRadius(d.size), Math.min((svgHeight - getCircleRadius(d.size))+20, d.y)); });;


                      circle.attr("transform", function(d) {
                        return "translate(" + d.x + "," + d.y + ")";
                      });

                      text.attr("transform", function(d) {
                        return "translate(" + d.x + "," + d.y + ")";
                      });
                      textShallow.attr("transform", function(d) {
                        return "translate(" + d.x + "," + d.y + ")";
                      });

                    function linkArc(d){
                        var targetX=d.target.x,
                            targetY=d.target.y,
                            sourceX=d.source.x,
                            sourceY=d.source.y;
                        var dx = d.target.x - d.source.x,
                            dy = d.target.y - d.source.y;
                        var dr = 90;  //linknum is defined above
                        var distance=Math.sqrt((Math.pow((dx),2))+(Math.pow((dy),2))),
                            radius=getCircleRadius(d.target.size);
                        var distanceFromEdgeOfCircle=distance-radius;   
                        var x=((targetX*distanceFromEdgeOfCircle)+(sourceX*radius))/(distance);
                        var y=((targetY*distanceFromEdgeOfCircle)+(sourceY*radius))/(distance);

                        if(d.linknum){
                            return "M" + sourceX + "," + sourceY + "A" + dr + "," + dr + " 0 0,1 " + x + "," + y;
                        }else{
                            return "M" + sourceX + "," + sourceY + "A" + 0 + "," + 0 + " 0 0,1 " + x + "," + y;
                        }
                    }
                }

            //*********************************************************************************************************************
                function circleMouseOver(d){
                    var hoveredElementId=(d3.select(this).attr('id')).replace('circle','');
                    var hoveredElement=lookupNode("id",hoveredElementId);
                    var hoveredElementOutDegree=(hoveredElement).outDegree;
                        d3.select(this).transition()
                                    .attr("r",getCircleRadius(d.size)*1.2);
                        if(hoveredElementOutDegree && hoveredElementOutDegree.length>0){
                            for(var ii=0,ll=hoveredElementOutDegree.length;ii<ll;ii++){
                                colorPathClickAndHover(hoveredElementOutDegree[ii].id);
                            }
                        }
                        showCompleteText(hoveredElement);
                }

                function circleMouseOut(d){
                    d3.select(this).transition()
                                .attr("r",getCircleRadius(d.size));
                    var hoveredElementId=(d3.select(this).attr('id')).replace('circle','');
                    var hoveredElement=lookupNode("id",hoveredElementId);
                    var hoveredElementOutDegree=(hoveredElement).outDegree;
                    if(hoveredElementOutDegree && hoveredElementOutDegree.length>0){
                        for(var ii=0,ll=hoveredElementOutDegree.length;ii<ll;ii++){
                            if(selectedPath.indexOf(hoveredElementOutDegree[ii].id)==-1){
                                removeColorPathClickAndHover(hoveredElementOutDegree[ii].id);
                            }
                        }
                    }
                    showShortName(hoveredElement);
                }

                function colorPathClickAndHover(id){
                   var currentValue=$('#path'+id).attr('stroke-width');

                   if(currentValue){
                        currentValue=parseFloat(currentValue.replace('px',''));
                        $('#path'+id).css('stroke-width', ((currentValue*1.2)+'px'));
                        $('#path'+id).css('stroke', '#F30');
                        $('#path'+id).attr('marker-end','url(#changedSuit)');
                    }
                }

                function removeColorPathClickAndHover(id){
                        $('#path'+id).removeAttr('style');
                        $('#path'+id).attr('marker-end','url(#suit)');
                }

                function circleDoubleClicked() {
                    var clickedNode=lookupNode("id",($(this).attr('id')).replace('circle',''));    
                    if(!clickedNode.isExpanded){
                        addNodesAndPath(clickedNode);
                        $(this).css('stroke','#F30');
                        clickedNode.isExpanded=true;
                    }else{
                        removeNodesAndPath(clickedNode);
                        $(this).css('stroke','#333');
                        clickedNode.isExpanded=false;
                    }
                }

                function pathClicked() {
                            var clickedElementId=$(this).attr('id').replace("path","");
                            var clickedElementIndexInSelectedPath=selectedPath.indexOf(clickedElementId);
                            if(clickedElementIndexInSelectedPath==-1){
                                    colorPathClickAndHover(clickedElementId);
                                    colorCircleInSelectedPath(clickedElementId);
                                    selectedPath.push(clickedElementId);
                            }else{
                                if(clickedElementIndexInSelectedPath!=-1){
                                    for(var ii=clickedElementIndexInSelectedPath,ll=selectedPath.length;ii<ll;ii++){
                                        removeColorPathClickAndHover(selectedPath[ii]);
                                        removeColorCircleInDeselectedPath(selectedPath[ii]);
                                    }
                                    selectedPath.splice(clickedElementIndexInSelectedPath,(selectedPath.length-clickedElementIndexInSelectedPath));
                                    colorAllCirclesInSelectedPath();
                                }
                            }
                    }
                function colorCircleInSelectedPath(linkId){
                    var clickedlink=lookupLink("id",linkId);
                    $('#circle'+clickedlink.source.id).css('fill','rgb(255, 133, 102)');
                    $('#circle'+clickedlink.target.id).css('fill','rgb(255, 133, 102)');
                }   

                function removeColorCircleInDeselectedPath(linkId){
                    var link=lookupLink("id",linkId);
                    $('#circle'+link.source.id).css('fill','#93B1C6');
                    $('#circle'+link.target.id).css('fill','#93B1C6');
                }

                function colorAllCirclesInSelectedPath(){
                    for(var ii=0,ll=selectedPath.length;ii<ll;ii++){
                        var pathLink=lookupLink("id",selectedPath[ii]);
                        $('#circle'+pathLink.source.id).css('fill','rgb(255, 133, 102)');
                        $('#circle'+pathLink.target.id).css('fill','rgb(255, 133, 102)');
                    }
                }

                function pathMouseOver(d) {
                          colorPathClickAndHover(($(this).attr('id')).replace("path",""));
                }

                function pathMouseOut(d) {
                    var clickedElementId=$(this).attr('id').replace("path","");
                    if(selectedPath.indexOf(clickedElementId)==-1){
                      removeColorPathClickAndHover(clickedElementId);
                    }
                }

                function showCompleteText(node){
                    var nodeFullLabel=node.label;
                    $("#text"+node.id).text(nodeFullLabel);
                    $("#textShadow"+node.id).text(nodeFullLabel);
                    $("#text"+node.id).css('font-size','20px');
                    $("#textShadow"+node.id).css('font-size','20px');
                    $("#text"+node.id).css('opacity','1');
                    $("#text"+node.id).css('fill','#000000');
                }

                function showShortName(node){
                    var shortLabel=getTextFromData(node);
                    // $("#text"+node.id).removeAttr('style');
                    // $("#textShadow"+node.id).removeAttr('style');
                    $("#text"+node.id).text('');
                    $("#textShadow"+node.id).text('');

                }
            //**************************************************************************************************************************    
                function addNodesAndPath(sourceNode){
                    //add links of the source to destination
                    var links=force.links();
                    var nodes=force.nodes();
                    var destinationNodes=[];
                    var sourceOutLinks=sourceNode.outDegree;
                    var shouldChangeActualLength=false;
                    if(sourceOutLinks){
                        for(var ii=0,ll=sourceOutLinks.length;ii<ll;ii++){
                            links.push(sourceOutLinks[ii]);
                            var nodeIndex=nodes.indexOf(sourceOutLinks[ii].target);
                            if(nodeIndex===-1){
                                var actualSourceX=sourceNode.x;
                                var actualSourceY=sourceNode.y;
                                sourceOutLinks[ii].target.fixed=true;
                                sourceOutLinks[ii].target.y=actualLength;
                            
                                if(ii%2==0 || actualSourceX<40){
                                    sourceOutLinks[ii].target.x=actualSourceX+40*ii;
                                }else{
                                    sourceOutLinks[ii].target.x=actualSourceX-40*ii;                   
                                }
                                nodes.push(sourceOutLinks[ii].target);
                                shouldChangeActualLength=true;
                            }
                        }
                                updateGraph(); 
                                if(shouldChangeActualLength)   
                                actualLength=actualLength+60;                
                    }
                }

                function removeNodesAndPath(sourceNode){
                    var links=force.links();
                    var nodes=force.nodes();
                    var destinationNodes=[];
                    if(sourceNode.isExpanded){
                        var sourceOutLinks=sourceNode.outDegree;
                        if(sourceOutLinks){
                            for(var ii=0,ll=sourceOutLinks.length;ii<ll;ii++){
                                var linkIndex=links.indexOf(sourceOutLinks[ii]);
                                if(linkIndex!=-1){
                                    links.splice(linkIndex,1);
                                }
                                if(sourceOutLinks[ii].target!=rootNode){
                                var targetNodeIndex=nodes.indexOf(sourceOutLinks[ii].target);
                                var isNodeHasSomeOtherLink=checkForLinks(sourceOutLinks[ii].target,links);
                                if(targetNodeIndex!=-1 && !isNodeHasSomeOtherLink){
                                    nodes.splice(targetNodeIndex,1);
                                    removeNodesAndPath(sourceOutLinks[ii].target);          
                                    sourceOutLinks[ii].target.isExpanded=false;
                                    }
                                }
                            }
                        updateGraph();
                        }
                    }
                }

                function checkForLinks(node,links){
                    for(var ii=0,ll=links.length;ii<ll;ii++){
                        if(links[ii].target.id===node.id){
                            return true;
                        }
                    }
                    return false;
                }

                function updateGraph(){
                        force.start();
                        path=path.data(force.links(),function(d) {
                            return d.source.id + "-" + d.target.id; 
                        })

                        path.enter().append("svg:path")
                        .attr("class", "link")
                        .attr("marker-end", "url(#suit)")
                        .attr("id",function(d){return "path"+d.id})
                        .attr("stroke-width",function(d){return getLinkThickness(d.size)+"px"})
                        .on("click",pathClicked)
                        .on("mouseover",pathMouseOver)
                        .on("mouseout",pathMouseOut);

                        path.exit().remove();

                        circle = circle.data(force.nodes(),function(d) {return d.id;})
                        circle.enter().append("svg:circle")
                        .attr("id",function(d) {return 'circle'+d.id;})
                        .attr("r", function(d){return getCircleRadius(d.size);})
                        .attr("class",function(d){
                        var outDegreeOfNode=(lookupNode("id",d.id)).outDegree;
                            return (outDegreeOfNode && outDegreeOfNode.length>0)? "clickableNode" : "NonClickableNode";
                        })
                        .on("mouseover",circleMouseOver)
                        .on("mouseout",circleMouseOut)
                        .on("click",circleDoubleClicked);
                        circle.exit().remove();

                        textShallow=textShallow.data(force.nodes(),function(d) { return d.id;});
                        textShallow.enter().append("svg:text")
                            .attr("x", 8)
                            .attr("y", ".31em")
                            .attr("class", "nodeShadow")
                            .attr("id",function(d){return "textShadow"+d.id});
                        textShallow.exit().remove();    
                        text=text.data(force.nodes(),function(d) { return d.id;})
                        text.enter().append("svg:text")
                            .attr("x", 8)
                            .attr("y", ".31em")
                            .attr("class", "nodeText")
                            .attr("id",function(d){return "text"+d.id});
                        text.exit().remove();   

                        for (var i = 100000; i > 0; i--) force.tick();
                        force.stop();

                        force.tick();
                }

                return{
                    expandNode:addNodesAndPath,
                    compressNode:removeNodesAndPath
                };
            }
    }




    function displayCommonMethods() {
        fileTab.removeClass("active");
        resultTreeContainer.hide();
        methodTab.addClass("active");
        methodsContainer.html("");
        var groupedMethods = _.map(_.groupBy(commonMethods, "className"), function (matches, className) {
            return {
                className: className, methods: matches, url: matches[0].url
            }
        });
        methodsContainer.html(methodsContainerTemplate({"groupedMethods": groupedMethods}));
        //calling addMethodDoc on grouped Methods to reduce number of requests for toolTip (making it faster)
        addMethodDoc(groupedMethods);
    }

    function enableAceEditor(id, content, lineNumbers) {
        $("#" + id).html("");
        var editor = ace.edit(id);

        editor.setValue(content);
        editor.setReadOnly(true);
        editor.resize(true);

        editor.setTheme("ace/theme/github");
        editor.getSession().setMode("ace/mode/java", function () {
        });

        foldLines(editor, lineNumbers);
        //highlightLine(editor, lineNumbers);
       //editor.gotoLine(lineNumbers[lineNumbers.length - 1], 0, true);
    }

    function highlightLine(editor, lineNumbers) {
        for(var ii=lineNumbers[0],ll=lineNumbers[1];ii<ll;ii++){
            hightLight(ii);
        }

        function hightLight(line) {
            /*IMPORTANT NOTE: Range takes row number starting from 0*/
            var row = line - 1,
                endCol = editor.session.getLine(row).length,
                range = new Range(row, 0, row, endCol);
                if(endCol>0)
                editor.getSession().addMarker(range, "ace_selection", "background");
        }
    }

    function foldLines(editor, lineNumbers) {
        var firstFoldRange = new Range(0, 0, lineNumbers[0]-1, 0);
        editor.getSession().addFold("...", firstFoldRange);
        var secondFoldRange = new Range(lineNumbers[1], 0,editor.getSession().getLength(), 0);
        if(editor.getSession().getLength()-lineNumbers[1]>2)
        editor.getSession().addFold("...", secondFoldRange);
        // var nextLine = 0;
        // lineNumbers.forEach(function (n) {
        //     if (nextLine !== n - 1) {
        //         var range = new Range(nextLine, 0, n - 1, 0);
        //         editor.getSession().addFold("...", range);
        //     }
        //     nextLine = n;
        // });
        // editor.getSession().addFold("...", new Range(nextLine, 0, editor.getSession().getLength(), 0));
    }

    function getFileName(filePath) {
        var elements = filePath.split("/"),
            repoName = elements[0] + "-" + elements[1],
            fileName = elements[elements.length - 1];
        return {"repo": repoName, "file": fileName};
    }

    // function fetchFileQuery(fileName) {
    //     return {"query": {"term": {"typesourcefile.fileName": fileName}}}
    // }

    function fetchFileQuery(fileName) {
        return {"query": {"term": {"fileUrl": fileName}}}
    }


    function updateLeftPanel(processedData) {
        var projects = [],
            groupedByRepos = _.groupBy(processedData, function (entry) {
                return entry.repo;
            });

        projects = _.map(groupedByRepos, function (files, label) {
            return {
                name: label,
                files: _.unique(files, _.iteratee('class'))
            }
        });

        showRelevantFiles();
        resultTreeContainer.html(resultTreeTemplate({"projects": projects}));
    }

    function renderFileContent(fileInfo, index) {
        queryES("content", fetchFileQuery(fileInfo.filePath), 1, function (result) {
            var id = "result" + index,
                content = "";
            if (result.length > 0) {
                content = result[0]._source.content;
                enableAceEditor(id + "-editor", content, fileInfo.lines);
            } else {
                $("#" + id).hide();
            }
        });
    }

    function getFileLines(methodString){
        var lineNoString=methodString.match(/#L(.*)#/);
        var lineTokens=lineNoString[1].split("-");
        return lineTokens;
    }

    // function updateRightSide(processedData) {
    //     var files = processedData.slice(0, 2);

    //     files.forEach(function (fileInfo, index) {
    //         renderFileContent(fileInfo, index);
    //     });

    //     $("#usage-container").html(resultTemplate({"files": files}));

    //     $('.fa-caret-square-o-right').tooltipster({
    //         theme: 'tooltipster-light',
    //         content: "Expand"
    //     });

    //     $('.fa-caret-square-o-down').tooltipster({
    //         theme: 'tooltipster-light',
    //         content: "Collapse"
    //     });
        
    //     usageTab.addClass("active");
    //     usageContainer.show();
    // }

    function updateRightSide(processedData) {

        // for(var ii=0,ll=noOfFilesInUsage-1;ii<ll;ii++){
        //     renderFileContent(processedData[ii], ii);
        // }

        
        var files=processedData.slice(0,noOfFilesInUsage);
        currentResultInRightUsagePane=files;
        files.forEach(function (fileInfo, index) {
            renderFileContent(fileInfo, index);
        });

        $("#usage-container").html(resultTemplate({"files": files}));

        $('.fa-caret-square-o-right').tooltipster({
            theme: 'tooltipster-light',
            content: "Expand"
        });

        $('.fa-caret-square-o-down').tooltipster({
            theme: 'tooltipster-light',
            content: "Collapse"
        });
        
        showUsage();
        usageContainer.show();
    }


    function filterRelevantTokens(searchString, tokens) {
        var result = searchString.split(",").map(function (term) {

            var matchingTokens = [],
                correctedTerm = term.trim().replace(/\*/g, ".*").replace(/\?/g, ".{1}");

            matchingTokens = tokens.filter(function (tk) {
                return (tk["importName"]).search(correctedTerm) >= 0;
            });

            return matchingTokens;
        });

        return _.flatten(result);
    }

    function buildSearchString(str) {
        var result = "";
        if (str[0] === "\'") {
            result = str.substr(1, str.length - 2);
        } else {
            result = str.split(",").map(function (entry) {
                return "*" + entry.trim();
            }).join(",");
        }
        return result;
    }

    // function processResult(searchString, data) {
    //     var result = [],
    //         intermediateResult = [],
    //         groupedData = [], matchingImports = [];

    //     groupedData = _.groupBy(data, function (entry) {
    //         return entry._source.file;
    //     });

    //     intermediateResult = _.map(groupedData, function (files, fileName) {
    //         var labels = getFileName(fileName),
    //             lineNumbers = [];

    //         files.forEach(function (f) {
    //             var matchingTokens = filterRelevantTokens(searchString, f._source.tokens),
    //                 possibleLines = _.pluck(matchingTokens, "lineNumbers");

    //             matchingImports = matchingImports.concat(matchingTokens.map(function (x) {
    //                 return x.importName;
    //             }));

    //             lineNumbers = lineNumbers.concat(possibleLines);
    //         });

    //         lineNumbers = (_.unique(_.flatten(lineNumbers))).sort(function (a, b) {
    //             return a - b;
    //         });

    //         return {
    //             path: fileName,
    //             repo: labels.repo,
    //             name: labels.file,
    //             lines: lineNumbers,
    //             score: files[0]._source.score
    //         };

    //     });

    //     /* sort by descending usage/occurrence with weighted score */
    //     result = _.sortBy(intermediateResult, function (elem) {
    //         var sortScore = (elem.score * 10000) + elem.lines.length;
    //         return -sortScore;
    //     });

    //     currentResult = result;
    //     return {classes: _.unique(matchingImports), result: result};
    // }

    function getFileRepoName(fullPath){
        var pathTokens=fullPath.split("/");
        return pathTokens[0]+"/"+pathTokens[1];
    }

    // function updateView(searchString, data) {
    //     commonMethods = [];
    //     var processedData = processResult(searchString, data);

    //     analyzedProjContainer.hide();
    //     searchMetaContainer.show();

    //     updateLeftPanel(processedData.result);
    //     updateRightSide(processedData.result);

    //     processedData.classes.forEach(function (cName) {
    //         searchCommonUsage(cName);
    //     });

    // }

    function updateView(searchString,data){
        var result=[];
        data.forEach(function(dataObj){
            var fileObj={};
            fileObj.repo=getFileRepoName(dataObj._source.file);
            fileObj.lines=getFileLines(dataObj._source.method);
            fileObj.filePath=dataObj._source.file;
            fileObj.fileMethodPath=dataObj._source.method;
            fileObj['class']=dataObj._source['class'];
            result.push(fileObj);
        });

        currentResult=result;

        updateLeftPanel(result);
        analyzedProjContainer.hide();
        searchMetaContainer.show();

        updateRightSide(result);
        // updateRightSide(result);
    }

    function getQuery(queryString) {
        var terms = queryString.split(","),
            mustTerms = terms.map(function (queryTerm) {
                var prefix = (queryTerm.search(/\*/) >= 0 || queryTerm.search(/\?/) >= 0) ? "wildcard" : "term";
                var result = {};
                result[prefix] = {"events": queryTerm.trim()};
                return result;
            });

        return {
            "bool": {
                "must": mustTerms,
                "must_not": [],
                "should": []
            }
        };
    }

    function getUsageQuery(queryString) {
        var terms = queryString.split(","),
            shouldTerms = terms.map(function (queryTerm) {
                var prefix =(queryTerm.search(/\*/) >= 0 || queryTerm.search(/\?/) >= 0) ? "wildcard" : "term";
                var result = {};
                result[prefix] = {"events": queryTerm.trim()};
                return result;
            });

        return {
            "bool": {
                "should" : shouldTerms,    
                "minimum_should_match" : 1,    
                "boost" : 1.0  
            }
        };
    }

    function search(queryString) {
        var correctedQuery = buildSearchString(queryString),
            // queryBlock = getQuery(correctedQuery);
            queryBlock=getUsageQuery(correctedQuery);

        queryES("transactions", {
            "query": queryBlock
            // "sort": [
            //     {"score": {"order": "desc"}}]
        }, resultSize, function (result) {
            updateView(correctedQuery, result);
        });
    }

    function queryES(indexName, queryBody, resultSize, successCallback) {
        $.ajax({
            url: localesURL + "/" + indexName + "/_search?"
            +"size=" + resultSize
            +"&source="+JSON.stringify(queryBody),
            success: function (result) {
                successCallback(result.hits.hits);
            },
            error: function (err) {
                errorMsgContainer.text(err.message);
                errorElement.slideDown("slow");
                errorElement.slideUp(2500);
            }
        });
    }

    // function queryES(indexName, queryBody, resultSize, successCallback) {
    //     $.ajax({
    //         url: esURL + "/" + indexName + "/_search?size=" + resultSize+"&source="+JSON.stringify(queryBody),
    //         success: function (result) {
    //             successCallback(result.hits.hits);
    //         },
    //         error: function (err) {
    //             errorMsgContainer.text(err.message);
    //             errorElement.slideDown("slow");
    //             errorElement.slideUp(2500);
    //         }
    //     });
    // }

    function updateConfig(url, size) {
        esURL = url.trim();
        resultSize = size;
    }

    function expandResultView() {
        leftPanel.hide();
        expandIcon.hide();
        rightSideContainer.addClass("fullWidth");
        compressIcon.show();
    }

    function compressResultView() {
        leftPanel.show();
        compressIcon.hide();
        rightSideContainer.removeClass("fullWidth");
        expandIcon.show();
    }

    function collapseUnnecessaryLines(id, lineNumbers) {
        var editor = ace.edit(id);
        //editor.getSession().unfold();
        foldLines(editor, lineNumbers);
    }

    function expandAllBlocks(id, lineNumbers) {
        var editor = ace.edit(id);
        editor.getSession().unfold();
        highlightLine(editor,lineNumbers);
        //editor.getSession().foldAll();
        // lineNumbers.forEach(function (n) {
        //     editor.getSession().unfold(n);
        // });
    }

    function showRelevantFiles() {
        methodsContainer.hide();
        methodTab.removeClass("active");
        fileTab.addClass("active");
        resultTreeContainer.show();
    }

    function showFreqUsedMethods() {
        resultTreeContainer.hide();
        fileTab.removeClass("active");
        methodTab.addClass("active");
        methodsContainer.show();
    }
    
    function showUsage() {
        graphContainer.hide();
        graphTab.removeClass("active");
        usageTab.addClass("active");
        usageContainer.show();
    }

    function showGraph() {
        usageContainer.hide();
        usageTab.removeClass("active");
        graphTab.addClass("active");
        graphContainer.show();
    }

    function searchCommonUsage(className) {

        var query = {
            "query": {
                "filtered": {
                    "query": {
                        "bool": {
                            "must": [{"term": {"body": className}}]
                        }
                    },
                    "filter": {
                        "and": {
                            "filters": [
                                {"term": {"length": "1"}}
                            ],
                            "_cache": true
                        }
                    }
                }
            },
            "sort": [{"freq": {"order": "desc"}}, "_score"]
        };

        queryES("fpgrowth/patterns", query, 10, function (result) {
            result.forEach(function (entry) {
                var src = entry._source,
                    methodName, methodRegex,
                    location = src.body[0].search(className),
                    pageUrl = className.replace(/\./g, "/") + ".html";

                if (location > -1) {
                    methodName = src.body[0].substr(className.length + 1); //taking length+1 so that '.' is excluded
                    methodRegex = "(" + pageUrl + "#" + methodName + "\\([\\w\\.\\d,%]*\\))";
                    commonMethods.push({
                        className: className,
                        method: methodName,
                        freq: src.freq,
                        id: className.replace(/\./g, "") + "-" + methodName,
                        url: pageUrl,
                        regex: new RegExp(/\".*/.source + methodRegex + /\"/.source)
                    });
                }
            });

            displayCommonMethods();
        })
    }

    function addFileToView(files) {
        var index = _.findIndex(currentResult, {fileMethodPath: files[0].fileMethodPath});
        var indexInCurrentFiles=_.findIndex(currentResultInRightUsagePane,{fileMethodPath: files[0].fileMethodPath});
        if(indexInCurrentFiles==-1){
            var fileToBeRemoved=_.findIndex(currentResult,{fileMethodPath: currentResultInRightUsagePane[noOfFilesInUsage-1].fileMethodPath});

            currentResultInRightUsagePane.splice(noOfFilesInUsage-1,1);
            currentResultInRightUsagePane.splice(0,0,files[0]);

            $("#result" + fileToBeRemoved).remove();
            $("#usage-container").prepend(resultTemplate({"files": files}).replace(/result0/g, "result" + index));
            renderFileContent(files[0], index);
            rightSideContainer.scrollTop(0);
        }else{
            $("#result" + index).remove();
            $("#usage-container").prepend(resultTemplate({"files": files}).replace(/result0/g, "result" + index));
            renderFileContent(files[0], index);
            rightSideContainer.scrollTop(0);

        }
    }

    function addMethodDoc(classWiseMethods) {
        classWiseMethods.forEach(function (entry) {
            var url = entry.url;

            if (url.search("java") === 0) {
                $.get(docsBaseUrl + url, function (result) {

                    entry.methods.forEach(function (methodInfo) {
                        var methodDoc = "",
                            linkToMethod = "",
                            matchedResult = result.match(methodInfo.regex);

                        //temporary hack to avoid error for inherited methods
                        if (matchedResult && matchedResult.length > 1) {
                            linkToMethod = matchedResult[1].split("#")[1].replace(/[\(\)]/g, "\\$&").replace(/%20/g, " ");

                            //regex to capture the content from the anchor for the method. Fetches anchor to li end.
                            var contentRegex = new RegExp((/<a\sname=\"/).source + linkToMethod + (/\">.*?<\/a><ul((?!<\/li>).)*/).source);

                            methodDoc = result.replace(/\n/g, "").match(contentRegex);
                            methodDoc = methodDoc[0].substring(methodDoc[0].search("<h4"));
                            methodDoc = methodDoc.replace(/\s\s+/g, "").replace(new RegExp("../../../", "g"), docsBaseUrl);
                            methodDoc = methodDoc.replace(/<a/g, "<a target='_blank'");

                        } else {
                            methodDoc = "Sorry!! This could be an inherited method. Please see the complete documentation."
                        }
                        $("#" + methodInfo.id).tooltipster({
                            theme: 'tooltipster-light',
                            content: $("<div>" + methodDoc + "</div>"),
                            position: 'right',
                            interactive: true,
                            maxWidth: leftPanel.width() * 2
                        });
                    });

                });
            }
        });
    }

    return {
        initialize: init,
        search: search,
        saveConfig: updateConfig,
        expand: expandResultView,
        compress: compressResultView,
        collapseAll: collapseUnnecessaryLines,
        expandAll: expandAllBlocks,
        showFiles: showRelevantFiles,
        showMethods: showFreqUsedMethods,
        showFileContent: addFileToView,
        submitClassForm: submitClassForm,
        showUsage: showUsage,
        showGraph: showGraph
    };
}();
