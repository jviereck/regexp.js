function parseHash() {
    var hash = location.hash.substring(1);
    if (!hash) return {};

    var parts = hash.split('&');
    var keys = {};
    parts.forEach(function(part) {
        var splits = part.split('=');
        keys[splits[0]] = decodeURIComponent(splits[1]);
    });
    return keys;
}

function saveOnHash() {
    var regexp = regExpEditor.getValue();
    var input = editor.getValue();
    location.hash = 'regexp=' + encodeURIComponent(regexp) + '&' + 'input=' + encodeURIComponent(input);

    alert('Stored current RegExp and input on the URL. Feel free to pass the URL to someone else for sharing.')
}

var lastRes = null;
var currentTrace = null;

function selectRegExpDom(from, to) {
    regExpDom.selectionStart = from;
    regExpDom.selectionEnd = to;
}

function reflectSelection(trace) {
    var selection;
    var pos;
    currentTrace = trace;
    if (!trace || !trace.node || !trace.node.parseEntry) {
        selection = { from: 0, to: 0 };
    } else {
        selection = trace.node.parseEntry;
    }
    if (trace) {
        pos = { from: trace.pos, to: trace.pos + 1 };
    } else {
        pos = { from: 0, to: 0 };
    }


    if (editor._overlay) {
        editor._overlay.clear();
        editor.removeOverlay(editor._overlay);
        regExpEditor._overlay.clear();
        regExpEditor.removeOverlay(editor._overlay);
    }
    var doc = editor.getDoc();
    editor._overlay = doc.markText(
        doc.posFromIndex(pos.from),
        doc.posFromIndex(pos.to),
        {className: 'matchhighlight'}
    );

    var doc = regExpEditor.getDoc();
    regExpEditor._overlay = doc.markText(
        doc.posFromIndex(selection.from),
        doc.posFromIndex(selection.to),
        {className: 'matchhighlight'}
    );
}

function traceToHTML(trace) {
    function traceNodeToHTML(traceNode, className) {
        if (traceNode == null || traceNode.node.dontCountTraceNode ) {
            return '';
        }
        var display = '';

        if (traceNode.node.type == 'GROUP_BEGIN') {
            display = ''; //(';
        } else if (traceNode.node.type == 'GROUP_END') {
            display = ''; //')';
        } else if (traceNode.node.type == 'BACK') {
            display = 'B';
            className += 'arrow_box';
        } else if (traceNode.node.type == 'FORWARD') {
            display = '>>';
        } else {
            display = traceNode.node.parseEntry.raw;
        }

        display = display.replace(/\s/g, '&nbsp;');

        var html = '';
        if (display) {
            html = '<span class="' + className + '" data-trace-id="' + traceNode.id + '">' + display + '</span>';
        }
        return html;
    }

    var html = '';
    var forkIdx = trace.lastBackIdx;
    var lastVisibleNodeIdx = trace.length;

    for (var i = trace.length - 1; i >= 0; i--) {
        if (!trace[i].node.dontCountTraceNode) {
            lastVisibleNodeIdx = i;
            break;
        }
    }

    for (var i = 0; i < trace.length; i++) {
        var className = '';
        if (i <= forkIdx) {
            className = 'hide ';
        } else if (trace.isEndTrace && i === lastVisibleNodeIdx) {
            className = trace.isEndTrace + ' ';
        }
        html += traceNodeToHTML(trace[i], className);
    }

    return html;
}

function matchIt() {
    try {
        var regExp = new RegExpJS(regExpEditor.getValue());
    } catch (e) {
        regExpErrorDom.textContent = e.toString();
        return;
    }
    regExpErrorDom.textContent = '';

    var input = editor.getValue();

    try {
        var res = window.res = lastRes = regExp.execDebug(input, regexp);
    } catch (exp) {
        alert('Sorry: ' + exp);
        return;
    }

    var resOutput;
    if (res.matches) {
        resOutput = JSON.stringify(res.matches, null, 4);
    } else {
        resOutput = 'null';
    }

    var traceOutput = '';
    traceOutput += res.traces.filter(function(trace) {
        return trace.isEndTrace;
    }).map(function(trace) {
        var html = traceToHTML(trace);
        return '<div class="traceRun"><nobr>' + html + '</nobr></div>';
    }).join('\n');
    tracesDom.innerHTML = traceOutput;

    document.getElementById('result').value = resOutput;
    document.getElementById('parseTree').value = JSON.stringify(res.parseTree, null, 4);
}

var editor;
var regExpEditor;
var regExpErrorDom;
var tracesDom;

window.onload = function() {
    // Leak globally.
    editor = null;
    regExpDom = document.getElementById('regexp');
    regExpErrorDom = document.getElementById('regexperror');
    tracesDom = document.getElementById('traces');

    tracesDom.addEventListener('mouseover', function(e) {
        var target = e.target;
        var traceId = target.getAttribute('data-trace-id');
        var trace = lastRes.traces.data.traceHash[traceId];

        reflectSelection(trace);
    });

    var inputDom = document.getElementById('area');

    regExpEditor = CodeMirror.fromTextArea(regExpDom);

    editor = CodeMirror.fromTextArea(inputDom);
    editor.setSize(null, '100px');
    editor._overlay = null;

    var hashData = parseHash();
    if ('regexp' in hashData) regExpEditor.setValue(hashData.regexp);
    if ('input' in hashData) editor.setValue(hashData.input);

    var matchItTimer = null;
    function scheduleMatchIt() {
        if (matchItTimer) {
            clearTimeout(matchItTimer);
        }
        matchItTimer = setTimeout(matchIt, 200);
    }

    regExpEditor.on('change', scheduleMatchIt);
    editor.on('change', scheduleMatchIt);

    var previousRegExpDomValue = null;
    regExpDom.addEventListener('keyup', scheduleMatchIt);

    matchIt();
}
