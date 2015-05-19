/*global console,$,XMLHttpRequest,document,ace,Handlebars,_*/
var app = function () {

    "use strict";
    var esURL = "http://labs.imaginea.com/betterdocs",//"http://localhost:9200/parsed"
        resultSize = 50,
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
        commonMethods = [],
        docsBaseUrl = "http://labs.imaginea.com/java7docs/api/",
		g = {nodes: [],edges: []},
		invisibleNodes = {},
		selectedNodes = {},
		selectedEdges = {},
		defaultNodeColor = '#000',
		selectedNodeColor = '#00f',
		s = new sigma({
		   graph: g,
		   container: 'graph-container',
		   renderer: {
		    container: document.getElementById('graph-container'),
		    type: 'canvas'
		   },
		   settings: {
		    doubleClickEnabled: false,
		    enableEdgeHovering: true,
		    //edgeHoverColor: 'edge',
		    minNodeSize: 3,
		    maxNodeSize: 20,
		    minEdgeSize: 1,
		    maxEdgeSize: 5
		   }
		});

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
			app.submitClassForm($("#searchString").val());
			app.search($("#searchString").val());
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

		s.bind('clickEdge', function (event){onEdgeClick(event);});
		s.bind('clickNode', function (event){onNodeClick(event);});

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
					success : function (result){callGraphSuccess(result, clazz);}
				});

		return false;

	}
	

		function callGraphSuccess(d, clazz) {
		var data = JSON.parse(d.result);
		s.graph.clear();
		s.graph.read(data);
		// this below adds x, y attributes as well as size =
		// degree of the node
		var i, nodes = s.graph.nodes(), edges = s.graph.edges(), len = nodes.length;

		for (var i = 0; i < len; i++) {
			nodes[i].x = Math.random() * (5 - 0) + 0;
			nodes[i].y = Math.random() * (1 - 0) + 0;
			nodes[i].color = defaultNodeColor;
			// nodes[i].size = s.graph.degree(nodes[i].id);

			if (s.graph.degree(nodes[i].id, "out") == 0
					|| nodes[i].label.indexOf(clazz) == -1) {
				nodes[i].type = 'invisible';
				invisibleNodes[nodes[i].id] = true;
			}
		}

		for (var j = 0; j < edges.length; j++) {
			if (edges[j].source in invisibleNodes
					|| edges[j].target in invisibleNodes) {
				edges[j].type = 'invisible';
			}

		}

		s.refresh();
	}

		

	function onNodeClick(e) {
		var srcId = e.data.node.id;
		var srcNode = s.graph.nodes(srcId);

		if (e.data.captor.ctrlKey) {
			if (srcId in selectedNodes) {
				delete selectedNodes[srcId];
				srcNode.color = defaultNodeColor;
			} else {
				selectedNodes[srcId] = true;
				srcNode.color = selectedNodeColor;
			}

		} else {

			// console.log(e.data.node.label);

			var targetNodes = [];
			var edges = s.graph.edges();

			if (srcId in invisibleNodes) {
				return;
			}

			for (var j = 0; j < edges.length; j++) {
				if (edges[j].source == srcId) {
					edges[j].type = 'arrow';
					if (edges[j].target in invisibleNodes) {

						delete invisibleNodes[edges[j].target];
						var targetNode = s.graph.nodes(edges[j].target);
						targetNode.type = '';
						targetNode.y = s.graph.nodes(edges[j].source).y + 3;

						if (s.graph.degree(targetNode.id, "out") == 0) {
							targetNode.color = "#FF0000";
						}

						targetNodes.push(targetNode);
					}
				}
			}
			var len = targetNodes.length;
			for (var i = 0; i < len; i++) {
				targetNodes[i].x = srcNode.x + len / 2 + -i;
			}
		}

		s.refresh();
	}

	function onEdgeClick(e) {
		console.log(e.type, e.data.edge, e.data.captor);
		var edge = e.data.edge;

		if (edge.id in selectedEdges) {
			delete selectedEdges[edge.id];
			edge.color = defaultNodeColor;
		} else {
			selectedEdges[edge.id] = true;
			edge.color = selectedNodeColor;
		}
		s.refresh();
	}


    function highlightLine(editor, lineNumbers) {
        lineNumbers.forEach(function (line) {
            /*IMPORTANT NOTE: Range takes row number starting from 0*/
            var row = line - 1,
                endCol = editor.session.getLine(row).length,
                range = new Range(row, 0, row, endCol);

            editor.getSession().addMarker(range, "ace_selection", "background");
        });
    }

    function foldLines(editor, lineNumbers) {
        var nextLine = 0;
        lineNumbers.forEach(function (n) {
            if (nextLine !== n - 1) {
                var range = new Range(nextLine, 0, n - 1, 0);
                editor.getSession().addFold("...", range);
            }
            nextLine = n;
        });
        editor.getSession().addFold("...", new Range(nextLine, 0, editor.getSession().getLength(), 0));
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

            highlightLine(editor, lineNumbers);
            foldLines(editor, lineNumbers);
        });

        editor.gotoLine(lineNumbers[lineNumbers.length - 1], 0, true);
    }

    function getFileName(filePath) {
        var elements = filePath.split("/"),
            repoName = elements[0] + "-" + elements[1],
            fileName = elements[elements.length - 1];
        return {"repo": repoName, "file": fileName};
    }

    function fetchFileQuery(fileName) {
        return {"query": {"term": {"typesourcefile.fileName": fileName}}}
    }

    function queryES(indexName, queryBody, resultSize, successCallback) {
        $.ajax({
            url: esURL + "/" + indexName + "/_search?size=" + resultSize+"&source="+JSON.stringify(queryBody),
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

    function updateLeftPanel(processedData) {
        var projects = [],
            groupedByRepos = _.groupBy(processedData, function (entry) {
                return entry.repo;
            });

        projects = _.map(groupedByRepos, function (files, label) {
            return {
                name: label,
                files: _.unique(files, _.iteratee('name'))
            }
        });

        fileTab.addClass("active");
        resultTreeContainer.html(resultTreeTemplate({"projects": projects}));
    }

    function renderFileContent(fileInfo, index) {
        queryES("sourcefile", fetchFileQuery(fileInfo.path), 1, function (result) {
            var id = "result" + index,
                content = "";
            if (result.length > 0) {
                content = result[0]._source.fileContent;
                enableAceEditor(id + "-editor", content, fileInfo.lines);
            } else {
                $("#" + id).hide();
            }
        });
    }

    function updateRightSide(processedData) {
        var files = processedData.slice(0, 2);

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
        
        usageTab.addClass("active");
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

    function processResult(searchString, data) {
        var result = [],
            intermediateResult = [],
            groupedData = [], matchingImports = [];

        groupedData = _.groupBy(data, function (entry) {
            return entry._source.file;
        });

        intermediateResult = _.map(groupedData, function (files, fileName) {
            var labels = getFileName(fileName),
                lineNumbers = [];

            files.forEach(function (f) {
                var matchingTokens = filterRelevantTokens(searchString, f._source.tokens),
                    possibleLines = _.pluck(matchingTokens, "lineNumbers");

                matchingImports = matchingImports.concat(matchingTokens.map(function (x) {
                    return x.importName;
                }));

                lineNumbers = lineNumbers.concat(possibleLines);
            });

            lineNumbers = (_.unique(_.flatten(lineNumbers))).sort(function (a, b) {
                return a - b;
            });

            return {
                path: fileName,
                repo: labels.repo,
                name: labels.file,
                lines: lineNumbers,
                score: files[0]._source.score
            };

        });

        /* sort by descending usage/occurrence with weighted score */
        result = _.sortBy(intermediateResult, function (elem) {
            var sortScore = (elem.score * 10000) + elem.lines.length;
            return -sortScore;
        });

        currentResult = result;
        return {classes: _.unique(matchingImports), result: result};
    }

    function updateView(searchString, data) {
        commonMethods = [];
        var processedData = processResult(searchString, data);

        analyzedProjContainer.hide();
        searchMetaContainer.show();

        updateLeftPanel(processedData.result);
        updateRightSide(processedData.result);

        processedData.classes.forEach(function (cName) {
            searchCommonUsage(cName);
        });

    }

    function getQuery(queryString) {
        var terms = queryString.split(","),
            mustTerms = terms.map(function (queryTerm) {
                var prefix = (queryTerm.search(/\*/) >= 0 || queryTerm.search(/\?/) >= 0) ? "wildcard" : "term";
                var result = {};
                result[prefix] = {"custom.tokens.importName": queryTerm.trim()};
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

    function search(queryString) {
        var correctedQuery = buildSearchString(queryString),
            queryBlock = getQuery(correctedQuery);

        queryES("betterdocs", {
            "query": queryBlock,
            "sort": [
                {"score": {"order": "desc"}}]
        }, resultSize, function (result) {
            updateView(correctedQuery, result);
        });
    }

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
        foldLines(editor, lineNumbers);
    }

    function expandAllBlocks(id, lineNumbers) {
        var editor = ace.edit(id);
        editor.getSession().unfold();
        editor.getSession().foldAll();
        lineNumbers.forEach(function (n) {
            editor.getSession().unfold(n);
        });
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
        var index = _.findIndex(currentResult, {name: files[0].name});
        $("#result" + index).remove();
        $("#usage-container").prepend(resultTemplate({"files": files}).replace(/result0/g, "result" + index));
        renderFileContent(files[0], index);
        rightSideContainer.scrollTop(0);
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
