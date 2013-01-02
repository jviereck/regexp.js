//

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

// node types:
// - character
// - group
// - repeat
// - lookback

function State(str) {
    this.str = str;
    this.idx = 0;
    this.matches = {};
    this.data = {};
    this.counts = {};
}

State.prototype.incr = function() {
    this.idx += 1;
};

State.prototype.finished = function() {
    return this.idx >= this.str.length;
};

State.prototype.getCurrentChar = function() {
    return this.str[this.idx];
};

State.prototype.clone = function() {
    return clone(this);
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

State.prototype.incCounts = function(idx) {
    return this.counts[idx] = (this.counts[idx] || -1) + 1;
};

State.prototype.isSame = function(state) {
    var same = state.idx === this.idx && state.str === this.str;
}


// (|a)bc
// <startGroup:1>
// <alt>
//   -
//   a
// <endGroup:1>
// b
// c

// (|a){2,}bc
// <counter:1:2:inf>
//   <startGroup:1>
//   <alt>
//     -
//     a
//   <endGroup:1>
// b
// c

// "ANY": DOT
// 'a'.match(/[^\n\r\u2028\u2029]/)
//
// <not>
//  \n |
//

function match(state, node) {
    var res;
    while (node) {
        var nextChar = state.getCurrentChar();

        switch (node.type) {
            case Node.REPEAT:
                // StateCounters start at -1 -> first inc makes the counter
                // be zero.
                var counter = state.incCounts(node.id);
                if (counter < node.from) {
                    // Haven't matched the minimum number yet
                    // -> match one more time.
                    res = match(state.clone(), node.child);
                } else if (counter === node.to) {
                    // Have matched the maximum number
                    // -> nothing to change.
                    res = state;
                } else {
                    // match \in {from, to}
                    if (node.greedy) {
                        res = match(state.clone(), node.child);
                        if (!res) {
                            res = match(state.clone(), node.next);
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

                res = node.children.some(function(f) {
                    return f(nextChar);
                });

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
                    return false;
                }
                break;
            case Node.ALTR:
                res = match(state.clone(), node.left);
                if (!res) {
                    return match(state.clone(), node.right);
                } else {
                    return res;
                }
                break;
            case Node.EMPTY:
            case Node.JOIN:
                node = node.next;
                break;

            case Node.GROUP_BEGIN:
                if (node.data !== 0) {
                    state.set(node.data, state.idx);
                }

                node = node.next;
                break;

            case Node.GROUP_END:
                if (node.data !== 0) {
                    var beginState = state.get(node.data);
                    state.recordMatch(node.data, beginState, state.idx);
                }

                node = node.next;
                break;

        }
    }

    if (node) {
        return false;
    }

    return state;
}

function retArr(nodes) {
    return [nodes[0], nodes[nodes.length - 1]];
}

function bText(str) {
    var nodeA, nodeB;

    if (str === '') {
        nodeA = new Node(Node.EMPTY);
        nodeB = new Node(Node.EMPTY);
        nodeA.next = nodeB;
        return [nodeA, nodeB];
    } else if (str.length === 1) {
        nodeA = new Node(Node.CHAR);
        nodeA.data = str;
        nodeB = new Node(Node.EMPTY);

        nodeA.next = nodeB;
        return [nodeA, nodeB];
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
function bGroup(idx, children) {
    var begin = new Node(Node.GROUP_BEGIN);
    var end = new Node(Node.GROUP_END);

    begin.data = end.data = idx;

    begin.next = children[0];
    children[1].next = end;

    return [begin, end];
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

    var nodeB = new Node(Node.EMPTY);
    nodeA.next = nodeB;

    return [nodeA, nodeB];
}

// BuildDot is just a shorthand for a charSet excluding all newlines.
function bDot() {
    return bCharSet(true, '\n\r\u2028\u2029');
}

function bAlt(left, right) {
    var altr = new Node(Node.ALTR);
    var join = new Node(Node.JOIN);

    altr.left = left[0];
    altr.right = right[0];

    left[1].next = join;
    right[1].next = join;

    return [altr, join];
}

function bJoin() {
    var args = arguments;

    for (var i = 0; i < args.length - 1; i++) {
        args[i][1].next = args[i + 1][0];
    }

    return [args[0][0], args[args.length - 1][1]];
}


var idCounter = 0;

function bRepeat(greedy, from, to, children) {
    var node = new Node(Node.REPEAT);
    var nodeEmpty =  new Node(Node.EMPTY);

    node.id = idCounter++;
    node.greedy = greedy;
    node.from = from;
    node.to = to;

    // Create a loop.
    node.child = children[0];
    children[1].next = node;

    node.next = nodeEmpty;

    return [node, nodeEmpty];
}

function run(value) {

    // var str = 'dabc';


    test('dabc', bJoin(
        bDot(),
        bGroup(
            1,
            bAlt(
                bText(''),
                bText('a')
            )
        ),
        bText('bc')
    )[0], 4, {1: 'a'});

    test('abab', bJoin(
        bRepeat(true, 0, 100, bDot()),
        bGroup(
            1,
            bText('b')
        )
    )[0], 4, {1: 'b'});

    test('abab', bJoin(
        bRepeat(false, 0, 100, bDot()),
        bGroup(
            1,
            bText('b')
        )
    )[0], 2, {1: 'b'});

}

function test(str, startNode, lastIdx, matches) {
    var state = new State(str);

    var endState = match(state, startNode);

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

