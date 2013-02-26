// Whole-script strict mode syntax
"use strict";

var utils = require('./utils');
var parse = require('./parser').parse;


var idCounter = 0;

function Node(type) {
    this.id = idCounter++;
    this.type = type;
}

Node.prototype.patch = function (nextA, nextB) {
    this.nextA = nextA;
    this.nextB = nextB;
};

Node.prototype.match = function (state) {
    if (this.match(state)) {
        if (this.isEnd) {
            return true;
        }
        var newState = state.nextChar();
        var left = this.nextA.match(newState);
        if (!left && this.nextB) {
            return this.nextB.match(newState);
        }
    }
    return false;
};

Node.EMPTY = 'EMPTY';
Node.CHAR = 'CHAR';
Node.CHARSET = 'CHARSET';
Node.ALTR = 'ALTR';
Node.JOIN = 'JOIN';
Node.GROUP_BEGIN = 'GROUP_BEGIN';
Node.GROUP_END = 'GROUP_END';
Node.REPEAT = 'REPEAT';
Node.NOT_MATCH = 'NOT_MATCH';
Node.FUNC = 'FUNC';
Node.BACKTRACK = 'BACK';    // Used in the tracer only.
Node.DONE = 'DONE';    // Used in the tracer only.

var idCounterTrace = 0;
var idCounterTraceEntry = 0;

function TraceEntry(pos, node, previous) {
    idCounterTraceEntry++;
    this.id = idCounterTrace++;
    this.pos = pos;
    this.node = node;
    this.notes = [];
    this.previous = previous;
}

TraceEntry.prototype = {
    addNote: function(pos, node, comment) {
        this.notes.push(node);
    }
}

function State(str, regExpStr, traces) {
    this.str = str;
    this.regExpStr = regExpStr;
    this.idx = 0;
    this.matches = [];
    this.data = {}; // TODO: Is this used anymore?
    this.counts = {};
    this.traces = traces;
    this.currentTrace = traces ? traces[traces.length - 1] : null;
}

State.getCurrentTraceTail = function() {
    return this.currentTraceTail;
},

State.setCurrentTraceTail = function(traceTail) {
    this.currentTraceTail = traceTail;
},

State.prototype.incr = function() {
    this.idx += 1;
};

State.prototype.beginning = function() {
    return this.idx === 0;
}

State.prototype.finished = function() {
    return this.idx >= this.str.length;
};

State.prototype.getCurrentChar = function() {
    return this.str[this.idx];
};

State.prototype.nodeToString = function(node) {
    var parseEntry = node.parseEntry;
    if (parseEntry != null && this.regExpStr != null) {
        return this.regExpStr.substring(parseEntry.from, parseEntry.to);
    } else {
        return 'UNSPECIFIED';
    }
}

State.prototype.clone = function(node, parentNode) {
    // Add a new to the list of traces which is used for the execution
    // of the state.
    var traces = this.traces;
    if (traces) {
        var newTrace = this.currentTrace.slice();
        newTrace.lastBackIdx = this.currentTrace.lastBackIdx;
        // newTrace.forkIdx = this.currentTrace.length - 1;
        traces.push(newTrace);
    }

    var cloned = new State(
        this.str,
        this.regExpStr,
        traces
    );
    cloned.idx = this.idx;
    cloned.matches = this.matches.slice(0, this.matches.length);
    cloned.counts = utils.clone(this.counts);
    cloned.data = utils.clone(this.data);
    return cloned;
};

State.prototype.resetMatch = function(idx) {
    this.matches[idx] = undefined;
};

State.prototype.recordMatch = function(idx, from, to) {
    this.matches[idx] = this.str.substring(from, to);
};

State.prototype.set = function(key, value) {
    this.data[key] = value;
};

State.prototype.get = function(key) {
    return this.data[key];
};

State.prototype.matchString = function(str) {
    var doMatch = this.str.indexOf(str, this.idx) === this.idx;
    if (doMatch) {
        this.idx += str.length;
    }
    return doMatch;
};

State.prototype.incCounts = function(idx) {
    var oldValue = this.counts[idx] === undefined ? -1 : this.counts[idx];
    return this.counts[idx] = oldValue + 1;
};

State.prototype.isWordChar = function(offset) {
    var idx = this.idx + offset;
    if (idx === -1 || idx === this.str.length) return false;
    return (/[a-zA-Z0-9_]/).test(this.str[idx]);
};

// Things to record a trace on the state.
State.prototype.recordNode = function(node) {
    var currentTrace = this.currentTrace;
    if (currentTrace) {
        // Recording a new entry makes this trace become the last trace in the
        // trace list. Last trace = most advanced trace!
        var traceIdx = this.traces.indexOf(currentTrace);
        if (traceIdx !== this.traces.length - 1) {
            this.traces.splice(traceIdx, 1);
            this.traces.push(currentTrace);
        }
        if (node.parseEntry && !node.parseEntry.dontCountTraceNode)
            this.traces.data.nodeCounter += 1;

        var previous = currentTrace[currentTrace.length - 1];
        var newEntry = new TraceEntry(this.idx, node, previous);
        this.traces.data.traceHash[newEntry.id] = newEntry;
        this.currentTrace.push(newEntry);
    }
};

State.prototype.recordBacktracing = function(node) {
    if (this.currentTrace) {
        this.currentTrace.lastBackIdx = this.currentTrace.length - 1;
        var newNode = new Node(Node.BACKTRACK);
        newNode.parseEntry = node.parseEntry;
        this.recordNode(newNode);

        this.traces.data.backrefCounter += 1;
    }
};

State.prototype.comment = function(node, comment) {
    //this.trace.comment(this.idx, node, comment);
};

State.prototype.failAndUnwind = function() {
    // Don't do anything to the trace. Maybe remove the trace completly?
    return false;
};

State.prototype.fail = function(comment) {
    var currentTrace = this.currentTrace;
    if (currentTrace) {
        currentTrace[currentTrace.length - 1].failed = true;
        currentTrace.isEndTrace = 'failed';
    }
    return false;
};

State.prototype.success = function() {
    var currentTrace = this.currentTrace;
    if (currentTrace) {
        currentTrace[currentTrace.length - 2].matched = true;
        currentTrace.isEndTrace = 'success';
    }
};

function match(state, node) {
    function fork(parentNode, childNode, recordFunc, resetMatches) {
        var forkedState = state.clone(childNode, parentNode);

        if (recordFunc) {
            recordFunc(forkedState);
        }

        if (resetMatches) {
            resetRepeatMaches(node, forkedState);
        }

        var res = match(forkedState, childNode);
        return res;
    }

    function resetRepeatMaches(node, stateToReset) {
        var parseEntry = node.parseEntry;
        if (parseEntry && parseEntry.firstMatchIdx != null && parseEntry.firstMatchIdx >= 0) {
            for (var i = parseEntry.firstMatchIdx; i <= parseEntry.lastMatchIdx; i++) {
                stateToReset.resetMatch(i);
            }
        }
    }

    var res;
    while (node) {
        var nextChar = state.getCurrentChar();

        if (node.type !== Node.REPEAT && node.type !== Node.ALTR) {
            state.recordNode(node);
        }

        switch (node.type) {
            case Node.FUNC:
                if (!node.func(state)) {
                    return state.fail();
                }
                node = node.next;
                break;

            case Node.REPEAT:
                var lastIdx = state.get(node.id);
                if (lastIdx !== undefined && lastIdx === state.idx) {
                    // Have the case of an empty match. No process is made
                    // no mather how often this repetition is applied. Therefore
                    // continue with the next node right away.
                    state.set(node.id, undefined);
                    return match(state, node.next);
                } else {
                    state.set(node.id, state.idx);
                }

                // StateCounters start at -1 -> first inc makes the counter be zero.
                var counter = state.incCounts(node.id);
                if (counter < node.min) {
                    resetRepeatMaches(node, state);
                    state.recordNode(node);
                    state.comment(node, 'Need to repeat another time');
                    // Haven't matched the minimum number yet
                    // -> match one more time.
                    res = match(state, node.child);
                } else if (counter === node.max) {
                    // Have matched the maximum number - match next one.
                    res = match(state, node.next);
                } else {
                    // match \in {from, to}
                    if (node.greedy) {
                        // 15.10.2.5: Greedy - repeat child as many times as possible.
                        res = fork(node, node.child, function(fState) {
                            fState.recordNode(node);
                        }, true);
                        if (!res) {
                            state.recordBacktracing(node);
                            res = match(state, node.next);
                        }
                    } else {
                        // 15.10.2.5: non-greedy - repeat child as less times as possible.
                        res = fork(node, node.next, function(fState) {
                            fState.recordNode(node);
                        });
                        if (!res) {
                            state.recordBacktracing(node);
                            state.recordNode(node);
                            resetRepeatMaches(node, state);
                            res = match(state, node.child);
                        }
                    }
                }
                if (!res) {
                    return state.fail();
                }
                return res;

            case Node.CHARSET:
                if (state.finished()) {
                    return state.fail();
                }

                if (node.children.length !== 0) {
                    res = node.children.some(function(f) {
                        return f(nextChar);
                    });
                } else {
                    res = true;
                }


                if (node.not) {
                    res = !res;
                }

                if (res) {
                    state.incr();
                    node = node.next;
                } else {
                    return state.fail();
                }
                break;


            case Node.CHAR:
                if (state.finished()) {
                    return state.fail();
                }

                if (node.data === nextChar) {
                    state.incr();
                    node = node.next;
                } else {
                    return state.fail();
                }
                break;
            case Node.ALTR:
                for (var i = 0; i < node.children.length; i++) {
                    res = fork(node, node.children[i], function(fState) {
                        if (i == 0) {
                            fState.recordNode(node);
                        } else {
                            fState.recordBacktracing(node);
                        }
                    });
                    if (res) {
                        return res;
                    }
                }
                return state.failAndUnwind();

            case Node.EMPTY:
            case Node.JOIN:
                node = node.next;
                break;

            case Node.GROUP_BEGIN:
                state.set(node.matchIdx, state.idx);

                node = node.next;
                break;

            case Node.GROUP_END:
                // If node.idx > 0, then it's a group to store the match.
                if (node.matchIdx >= 0) {
                    var beginState = state.get(node.matchIdx);
                    state.recordMatch(node.matchIdx, beginState, state.idx);
                }

                // node.data === -1 // don't remember the match

                // Case of: x(?=y)
                if (node.matchIdx < -1) {
                    state.idx = state.get(node.matchIdx);
                }

                node = node.next;
                break;

            case Node.NOT_MATCH:
                // Case of: x(?!y)
                res = fork(node, node.child);
                if (res) {
                    return state.fail();
                }
                node = node.next;
                break;

            default:
                throw "Unkown node type: " + node.type;

        }
    }

    if (node) {
        return state.fail();
    }

    state.success();

    return state;
}

function retArr(nodes) {
    return [nodes[0], nodes[nodes.length - 1]];
}

function bText(str) {
    var nodeA, nodeB;

    if (str === '') {
        nodeA = new Node(Node.EMPTY);
        return [nodeA, nodeA];
    } else if (str.length === 1) {
        nodeA = new Node(Node.CHAR);
        nodeA.data = str;
        return [nodeA, nodeA];
    }

    var nodes = str.split('').map(function(ch, idx) {
        var node = new Node(Node.CHAR, idx, idx + 1);
        node.data = ch;
        return node;
    });
    for (var i = 0; i < nodes.length - 1; i++) {
        nodes[i].next = nodes[i + 1];
    }

    return retArr(nodes);
}

// If group should be a not-remember-group like `(?:x)`, then set
// `idx=0`.
function bGroup(children, matchIdx, lastMatchIdx) {
    if (lastMatchIdx === undefined) {
        lastMatchIdx = matchIdx;
    }

    var begin = new Node(Node.GROUP_BEGIN);
    var end = new Node(Node.GROUP_END);

    begin.matchIdx = end.matchIdx = matchIdx;
    begin.lastMatchIdx = end.lastMatchIdx = lastMatchIdx;

    begin.next = children[0];
    children[1].next = end;

    return [begin, end];
}

function bFollowMatch(children) {
    var id = idCounter++;
    return bGroup(children, -id - 1);
}

function bNotFollowMatch(children) {
    var node = new Node(Node.NOT_MATCH);
    node.child = children[0];
    return [node, node];
}

function bCharacterClass(isNegative, matches) {
    var nodeA = new Node(Node.CHARSET);
    nodeA.not = isNegative;
    nodeA.children = matches;

    return [nodeA, nodeA];
}

function bCharSet(isNot, str) {
    var nodeA = new Node(Node.CHARSET);
    nodeA.not = isNot;

    // TODO: Add proper parsing of charSet here.
    nodeA.children = str.split('').map(function(matchChar) {
        return function(inputChar) {
            return inputChar === matchChar;
        };
    });

    return [nodeA, nodeA];
}

// BuildDot is just a shorthand for a charSet excluding all newlines.
function bDot() {
    return bCharSet(true, '\n\r\u2028\u2029');
}

function bBoundary(isNegative) {
    return bFunc(function(state) {
        // See: 15.10.2.6
        var a = state.isWordChar(-1);
        var b = state.isWordChar(0);
        res = (a === true && b === false) || (a === false && b === true);
        if (isNegative) {
            res = !res;
        }
        return res;
    })
}

function bFunc(func) {
    var node = new Node(Node.FUNC);
    node.func = func;
    return [node, node];
}

function buildNodeFromRegStr(str) {
    return walk(parse(str), false);
}


// TAKEN FROM ESPRIMA! BEGIN >>

// 7.2 White Space

function isWhiteSpace(ch) {
    return (ch === 32) ||  // space
        (ch === 9) ||      // tab
        (ch === 0xB) ||
        (ch === 0xC) ||
        (ch === 0xA0) ||
        (ch >= 0x1680 && '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(String.fromCharCode(ch)) > 0);
}

// 7.3 Line Terminators

function isLineTerminator(ch) {
    return (ch === 10) || (ch === 13) || (ch === 0x2028) || (ch === 0x2029);
}

// TAKEN FROM ESPRIMA! << END

function buildWhitespaceLineOrTerminator(negative) {
    // The functions taken from esprima expect to get the charCode of the
    // character. Therefore wrap the functions, such that the input string
    // gets converted to an integer before calling the funciton.
    function strToChar(func) {
        return function(input) {
            return func(input.charCodeAt(0));
        }
    }

    return bCharacterClass(negative, [
        strToChar(isWhiteSpace),
        strToChar(isLineTerminator)
    ]);
}

var escapedChars = {
    // The build functions are wrapped in a function to create a fresh node
    // for every escapedChar. Otherwise setting the `next` property on a
    // node used at multiple places fails.
    't': function() { return buildNodeFromRegStr('\\u0009'); },
    'n': function() { return buildNodeFromRegStr('\\u000A'); },
    'v': function() { return buildNodeFromRegStr('\\u000B'); },
    'f': function() { return buildNodeFromRegStr('\\u000C'); },
    'r': function() { return buildNodeFromRegStr('\\u000D'); },
    'd': function() { return buildNodeFromRegStr('[0-9]'); },
    'D': function() { return buildNodeFromRegStr('[^0-9]'); },
    'w': function() { return buildNodeFromRegStr('[A-Za-z0-9_]'); },
    'W': function() { return buildNodeFromRegStr('[^A-Za-z0-9_]'); },
    's': function() { return buildWhitespaceLineOrTerminator(false); },
    'S': function() { return buildWhitespaceLineOrTerminator(true); },
    'b': function() { return bBoundary(false); },
    'B': function() { return bBoundary(true) }
}
function bEscapedChar(value) {  // 15.10.2.12
    if (value in escapedChars) {
        return escapedChars[value]();
    } else {
        throw new Error('Unkown escaped char: ' + value);
    }
}

function bAlt() {
    var altr = new Node(Node.ALTR);
    var join = new Node(Node.JOIN);

    var children = Array.prototype.slice.call(arguments, 0);
    altr.children = children.map(function(list) {
        list[1].next = join;
        return list[0];
    });

    return [altr, join];
}

function bJoin() {
    var args = arguments;

    for (var i = 0; i < args.length - 1; i++) {
        args[i][1].next = args[i + 1][0];
    }

    return [args[0][0], args[args.length - 1][1]];
}


function bRepeat(greedy, min, max, children) {
    var node = new Node(Node.REPEAT);

    node.greedy = greedy;
    node.min = min;
    node.max = max;

    // Create a loop.
    node.child = children[0];
    children[1].next = node;

    return [node, node];
}

function bEmpty() {
    var node = new Node(Node.EMPTY);
    return [node, node];
}

function runTests() {
    test('dabc', bJoin(
        bDot(),
        bGroup(
            bAlt(
                bText(''),
                bText('a')
            ),
            1
        ),
        bText('bc')
    ), 4, ['dabc', 'a']);

    test('abab', bJoin(
        bRepeat(true, 0, 100, bDot()),
        bGroup(
            bText('b'),
            1
        )
    ), 4, ['abab', 'b']);

    test('abab', bJoin(
        bRepeat(false, 0, 100, bDot()),
        bGroup(
            bText('b'),
            1
        )
    ), 2, ['ab', 'b']);

    test('abcabd', bJoin(
        bGroup(
            bText('abd'),
            1
        )
    ), 6, ['abd', 'abd']);

    test('abcabd', bGroup(bJoin(
        bText('b'),
        bFollowMatch(
            bText('d')
        )
    ), 1), 5, ['b', 'b']);

    test('abcabd', bGroup(bJoin(
        bText('b'),
        bNotFollowMatch(
            bText('c')
        )
    ), 1), 5, ['b', 'b']);


}

function nodeToCharCode(node) {
    switch (node.type) {
        case 'character':
            return node.char.charCodeAt(0);

        case 'escape':
            switch (node.name) {
                case 'unicode':
                    return parseInt(node.value, 16);
                case 'controlLetter':
                    return node.value.charCodeAt(0) % 32;
                default:
                    throw new Error('Unsupported node escape name: ' + node.name);
            }
    }

    return null;
}

function nodeToChar(node) {
    var code = nodeToCharCode(node);
    if (code === null) {
        return null;
    }
    return String.fromCharCode(code);
}

function buildClassMatcher(entry) {
    switch (entry.type) {
        case 'character':
        case 'escape':
            var ch = nodeToChar(entry);
            return function(input) {
                return ch === input;
            }
            break;

        case 'characterClassRange':
            var min = nodeToCharCode(entry.min);
            var max = nodeToCharCode(entry.max);

            if (max < min) {
                // TODO: Better error message.
                throw new Error('Character not in right order');
            }
            return function(input) {
                var ch = input.charCodeAt(0);
                return ch >= min && ch <= max;
            }

        case 'empty':
            return function(input) { return true; }

        case 'escapeChar':
            return function(input) {
                // escapeChar are made up of RegExp again. Do the simpliest way
                // possible ATM and test the escapeChar against the input string
                // using the match function itself again ;)
                // This is not a problem, as escapeChars don't have circular
                // dependencies.
                var state = new State(input);
                var firstNode = bEscapedChar(entry.value)[0];
                return !!match(state, firstNode);
            }

        default:
            throw new Error('Unkown classRange entry type: ' + entry.type);
    }
}

var groupCounter = 1;
function walk(node, inCharacterClass) {
    var arr;
    var res;
    switch (node.type) {
        case 'disjunction':
            arr = node.alternatives.map(walk);
            res = bAlt.apply(null, arr);
            break;

        case 'alternative':
            arr = node.terms.map(walk);
            // Return here directly and don't finish the funciton. This way
            // the parseEntry of the `alternative` is not set.
            return  bJoin.apply(null, arr);

        case 'character':
        case 'escape':
            res = bText(nodeToChar(node));
            break;

        case 'escapeChar':
            res = bEscapedChar(node.value);
            break;

        case 'quantifier':
            res = bRepeat(node.greedy, node.min, node.max, walk(node.child));
            res.firstMatchIdx = node.firstMatchIdx;
            res.lastMatchIdx = node.lastMatchIdx;
            break;

        case 'group':
            res = walk(node.disjunction);
            if (node.behavior === 'onlyIfNot') {
                res = bNotFollowMatch(res);
            } else {
                var idx;
                var endIdx;
                if (node.behavior === 'onlyIf') {
                    idx = -2;
                } else if (node.behavior === 'ignore') {
                    idx = -1;
                } else {
                    idx = node.matchIdx;
                    endIdx = node.lastMatchIdx;
                }
                res = bGroup(res, idx, endIdx);
            }

            res[1].parseEntry = node;
            break;

        case 'characterClass':
            var matcher = node.classRanges.map(buildClassMatcher);
            res = bCharacterClass(node.negative, matcher);
            break;

        case 'empty':
            res = bEmpty();
            break;

        case 'dot':
            res = bDot();
            break;

        case 'assertion':
            if (node.sub === 'start') {
                res = bFunc(function(state) {
                    return state.beginning();
                });
            } else {
                res = bFunc(function(state) {
                    return state.finished();
                });
            }
            break;

        case 'ref':
            res = bFunc(function(state) {
                var refMatch = state.matches[node.ref];
                if (refMatch === undefined) {
                    throw new Error('Accessing match that is not set.');
                }
                state.comment(null, 'referenced value: ' + refMatch);
                return state.matchString(refMatch);
            });
            break;

        default:
            throw new Error('Unsupported node type: ' + node.type);
    }
    res[0].parseEntry = node;
    return res;
}

function buildFakeParseEntry(from, to, bit) {
    return {
        from: from,
        to: to,
        bit: bit,
        booting: true
    };
}

function getStartNodeFromPattern(regExpStr) {
    idCounter = 0;
    groupCounter = 1;

    var parseTree = parse(regExpStr);
    if (parseTree.error) {
        throw parseTree.error;
    }

    var bootDot = bDot();
    bootDot[0].parseEntry = buildFakeParseEntry(-4, -3, '.');

    var bootRepeat = bRepeat(false, 0, undefined, bootDot);
    bootRepeat[0].parseEntry = buildFakeParseEntry(-3, -1, '*?');

    var bootGroup = bGroup(walk(parseTree), 0, parseTree.lastMatchIdx);
    var bootGroupParseEntry = buildFakeParseEntry(-1, Number.MAX_VALUE, '()');
    bootGroupParseEntry.dontCountTraceNode = true;
    bootGroup[0].parseEntry = bootGroup[1].parseEntry = bootGroupParseEntry;

    var startNode = bJoin(
        bootRepeat,
        bootGroup
    )[0];

    startNode.regExpStr = regExpStr;
    startNode.lastMatchIdx = parseTree.lastMatchIdx;
    startNode.parseTree = parseTree;

    return startNode;
}

function exec(matchStr, startNode, lastIndex) {
    idCounterTrace = 0;
    idCounterTraceEntry = 0;
    var regExpStr = startNode.regExpStr;
    var lastMatchIdx = startNode.lastMatchIdx;

    var firstTrace = [];
    firstTrace.lastBackIdx = -1;
    var traces = [firstTrace];
    traces.data = {
        traceHash: {},
        nodeCounter: 0,
        backrefCounter: 0
    };

    var state = new State(matchStr, regExpStr, traces);
    state.idx = lastIndex;
    state.matches = new Array(lastMatchIdx + 1);
    var endState = match(state, startNode);
    // trace.entryCount = idCounterTraceEntry;
    // endState.trace = trace;

    if (!endState) {
        endState = {};
    } else {
        // This is necessary as otherwise the length of the matches might fit
        // but calling Object.keys don't return the right thing.
        for (var i = 0; i < lastMatchIdx + 1; i++) {
            if (endState.matches[i] === undefined) {
                endState.matches[i] = undefined;
            }
        }
    }

    endState.traces = traces;
    endState.parseTree = startNode.parseTree;
    return endState;
}

exports.getStartNodeFromPattern = getStartNodeFromPattern;
exports.exec = exec;
