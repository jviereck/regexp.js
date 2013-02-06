// Whole-script strict mode syntax
"use strict";


// Cool debugger written in Perl.
// perl -E "use Regexp::Debugger; 'ababc' =~ / (a|b) b+ c /x"

function Node(type, from, to) {
    this.type = type;
    this.from = from;
    this.to = to;
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

function Trace(parent) {
    this.children = [];
    this.parent = parent || null;
    this.finalTrace = false;
    this.items = [];
}

Trace.prototype = {
    createChild: function() {
        var child = new Trace(this);
        this.children.push(child);
        return child;
    },

    isFinalTrace: function() {
        return this.finalTrace || this.children.some(function(child) {
            return child.isFinalTrace();
        });
    },

    record: function(node, title) {
        var from, to, parseEntry = node.parseEntry;
        if (parseEntry) {
            from = parseEntry.from;
            to = parseEntry.to;
        }
        this.items.push({
            node: node,
            title: title,
            from: from,
            to: to,
            comments: []
        });
    },

    comment: function(node, comment) {
        var last = this.items[this.items.length - 1];
        last.comments.push({
            node: node,
            comment: comment
        });
    }
}

function State(str, regExpStr) {
    this.str = str;
    this.regExpStr = regExpStr;
    this.idx = 0;
    this.matches = [];
    this.data = {}; // TODO: Is this used anymore?
    this.counts = {};
    this.trace = new Trace(null);
}

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

State.prototype.clone = function() {
    var cloned = new State(this.str, this.regExpStr);
    cloned.idx = this.idx;
    cloned.matches = clone(this.matches);
    cloned.counts = clone(this.counts);
    cloned.data = clone(this.data);
    cloned.trace = this.trace.createChild();
    return cloned;
};

State.prototype.resetMatch = function(idx) {
    this.matches[idx] = undefined;
}

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
    return /[a-zA-Z0-9_]/.test(this.str[idx]);
}

// Things to record a trace on the state.
State.prototype.try = function(node) {
    var comment = '';
    var parseEntry = node.parseEntry;
    if (parseEntry) {
        comment = 'Execute ' + this.regExpStr.substring(parseEntry.from, parseEntry.to)
    }
    this.trace.record(node, comment)
}
State.prototype.comment = function(node, comment) {
    this.trace.comment(node, comment);
}
State.prototype.fail = function() { return false; }
State.prototype.success = function() { return true; }

function match(state, node) {
    var res;
    while (node) {
        var nextChar = state.getCurrentChar();

        state.try(node);

        switch (node.type) {
            case Node.FUNC:
                if (!node.func(state)) {
                    return state.fail();
                }
                state.success();
                node = node.next;
                break;

            case Node.REPEAT:
                // TODO: Reset values of groups.

                // Don't use a for/while loop for the repetitions here as
                // otherwise it's hard to get the matching for alt working
                // without tracking some additional state.

                // StateCounters start at -1 -> first inc makes the counter
                // be zero.
                var counter = state.incCounts(node.id);
                if (counter < node.min) {
                    state.comment(node, 'Need to repeat another time');
                    // Haven't matched the minimum number yet
                    // -> match one more time.
                    res = match(state, node.child);
                } else if (counter === node.max) {
                    // Have matched the maximum number
                    // -> nothing to change.
                    res = state;
                } else {
                    // match \in {from, to}
                    if (node.greedy) {
                        res = match(state.clone(), node.child);
                        if (!res) {
                            res = match(state.clone(), node.next);
                            if (!res) {
                                return state.fail();
                            }
                        }
                    } else {
                        res = match(state.clone(), node.next);
                        if (!res) {
                            res = match(state.clone(), node.child);
                        }
                    }
                }
                return res;

            case Node.CHARSET:
                if (state.finished()) {
                    return false;
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
                    return false;
                }
                break;


            case Node.CHAR:
                if (state.finished()) {
                    return false;
                }

                if (node.data === nextChar) {
                    state.incr();
                    node = node.next;
                } else {
                    state.fail();
                    return false;
                }
                break;
            case Node.ALTR:
                for (var i = 0; i < node.children.length; i++) {
                    state.try(node)
                    res = match(state.clone(), node.children[i]);
                    if (res) {
                        return res;
                    }
                }
                return null;

            case Node.EMPTY:
            case Node.JOIN:
                node = node.next;
                break;

            case Node.GROUP_BEGIN:
                state.set(node.matchIdx, state.idx);
                if (node.lastMatchIdx != null && node.lastMatchIdx >= 0) {
                    for (var i = node.matchIdx; i <= node.lastMatchIdx; i++) {
                        state.resetMatch(i);
                    }
                }

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
                res = match(state.clone(), node.child);
                if (res) {
                    return false;
                }
                node = node.next;
                break;

            default:
                throw "Unkown node type: " + node.type;

        }
    }

    if (node) {
        return false;
    }

    return state;
}

var idCounter = 0;

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
    't': buildNodeFromRegStr('\\u0009'),
    'n': buildNodeFromRegStr('\\u000A'),
    'v': buildNodeFromRegStr('\\u000B'),
    'f': buildNodeFromRegStr('\\u000C'),
    'r': buildNodeFromRegStr('\\u000D'),
    'd': buildNodeFromRegStr('[0-9]'),
    'D': buildNodeFromRegStr('[^0-9]'),
    'w': buildNodeFromRegStr('[A-Za-z0-9_]'),
    'W': buildNodeFromRegStr('[^A-Za-z0-9_]'),
    's': buildWhitespaceLineOrTerminator(false),
    'S': buildWhitespaceLineOrTerminator(true),
    'b': bBoundary(false),
    'B': bBoundary(true)
}
function bEscapedChar(value) {  // 15.10.2.12
    if (value in escapedChars) {
        return escapedChars[value];
    } else {
        throw new Error('Unkown escaped char: ' + value);
    }
}

function bAny() {
    return bCharSet(false, '');
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

    node.id = idCounter++;
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

    assertEndState(exec('a', 'a+'), 1, ['a']);
    assertEndState(exec('da', '[cba]'), 2, ['a']);
    assertEndState(exec('abc', 'a(?:b)c'), 3, ['abc']); // Not remember
    assertEndState(exec('abdabc', 'ab(?!d)'), 5, ['ab']); // Only if not followed by
    assertEndState(exec('abdabc', 'ab(?=c)'), 5, ['ab']); // Only if not followed by
    assertEndState(exec('a ', '\\u0020'), 2, [' ']);
    assertEndState(exec('a ', '[\\u0020]'), 2, [' ']);
    assertEndState(exec('d', '[a-z]'), 1, ['d']);
    assertEndState(exec('a', '(a)|(b)'), 1, ['a', 'a', undefined]);
    assertEndState(exec('b', '(a)|(b)'), 1, ['b', undefined, 'b']);
    assertEndState(exec('a', '\\w'), 1, ['a']);
    assertEndState(exec('foo bar', '\\s\\w*'), 7, [' bar']);
    assertEndState(exec('foo bar', '\\S\\w*'), 3, ['foo']);

    // Boundary \b and \B tests.
    assertEndState(exec('ab cd', '\\bab'), 2, ['ab']);
    assertEndState(exec('ab cd', 'ab\\b'), 2, ['ab']);
    assertEndState(exec('ab cd', '\\bcd'), 5, ['cd']);
    assertEndState(exec('ab cd', 'cd\\b'), 5, ['cd']);
    assertEndState(exec('hallo', '\\Blo'), 5, ['lo']);
    assertEndState(exec('hal la', 'l\\B'), 5, ['l']);

    // Referencing
    assertEndState(exec('abab', 'a(.)a\\1'), 4, ['abab', 'b']);

}

function nodeToCharCode(node) {
    switch (node.type) {
        case 'character':
            return node.char.charCodeAt(0);

        case 'escape':
            switch (node.name) {
                case 'unicode':
                    return parseInt(node.value, 16);
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
            res = bJoin.apply(null, arr);
            break;

        case 'character':
        case 'escape':
            res = bText(nodeToChar(node));
            break;

        case 'escapeChar':
            res = bEscapedChar(node.value);
            break;

        case 'quantifier':
            res = bRepeat(node.greedy, node.min, node.max, walk(node.child));
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

function exec(matchStr, regExpStr) {
    // tests: 'abc', 'a+'

    var parseTree = parse(regExpStr);

    groupCounter = 1;
    var nodes = bGroup(walk(parseTree), 0, parseTree.lastMatchIdx);

    var startNode = bJoin(
        bRepeat(false, 0, matchStr.length + 1, bAny()),
        nodes//,
    )[0];

    var state = new State(matchStr, regExpStr);
    var endState = match(state, startNode);

    if (!endState) {
        endState = {};
    }
    endState.parseTree = parseTree;
    return endState;
}

function assertEndState(endState, lastIdx, matches) {
    function fail(msg) {
        console.error(msg);
    }

    function pass() {
        console.log('PASSED TEST');
    }

    if (endState) {
        if (lastIdx === -1) {
            return fail('Got match but did not expect one');
        }

        if (endState.idx !== lastIdx) {
            return fail('State lastIdx does not match expected one');
        }

        if (Object.keys(endState.matches).length !== Object.keys(matches).length) {
            return fail('Matches number does not match');
        }

        for (var i in endState.matches) {
            if (matches[i] !== endState.matches[i]) {
                return fail('Expected match does not match');
            }
        }
    } else {
        if (lastIdx !== -1) {
            return fail('Did not match but expected to do so');
        }
    }
    pass();
}

function test(str, nodes, lastIdx, matches) {
    // Note: Add to each start node the /(.)*?/ pattern to make the match
    // work also from not only the beginning
    var startNode = bJoin(
        bRepeat(false, 0, str.length + 1, bDot()),
        bGroup(nodes, 0)
    )[0];

    var state = new State(str, '');
    var endState = match(state, startNode);

    assertEndState(endState, lastIdx, matches);
}

