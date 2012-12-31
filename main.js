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
Node.ALTR = 'ALTR';
Node.JOIN = 'JOIN';
Node.GROUP_BEGIN = 'GROUP_BEGIN';
Node.GROUP_END = 'GROUP_END';

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
    // Not really a clone, but good enough here ;)
    return Object.create(this);
};

State.prototype.recordMatch = function(idx, from, to) {
    this.matches[idx] = this.str.substring(from.idx, to.idx);
};

State.prototype.set = function(key, value) {
    this.data[key] = value;
};

State.prototype.get = function(key) {
    return this.data[key];
}

State.prototype.getCounts = function(idx) {
    return this.counts[idx] || 0;
};

State.prototype.incCounts = function(idx) {
    this.counts[idx] = (this.counts[idx] || 0) + 1;
};


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

function match(state, node) {
    var res;
    while (node && !state.finished()) {
        var nextChar = state.getCurrentChar();

        switch (node.type) {
            case Node.CHAR:
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
                state.set(node.data, state);
                node = node.next;
                break;

            case Node.GROUP_END:
                var beginState = state.get(node.data);
                state.recordMatch(node.data, beginState, state);
                node = node.next;
                break;

        }
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

function bGroup(children, idx) {
    var begin = new Node(Node.GROUP_BEGIN);
    var end = new Node(Node.GROUP_END);

    begin.data = end.data = idx;

    begin.next = children[0];
    children[1].next = end;

    return [begin, end];
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

function bJoin(left, right) {
    left[1].next = right[0];
    return [left[0], right[1]];
}



function run(value) {
    var str = 'abc';


    var state = new State(str);

    var startNode = bJoin(
            bGroup(
                bAlt(
                    bText(''),
                    bText('a')
                ),
                1
            ),
            bText('bc')
        )[0];

    var endState = match(state, startNode);

    console.log(endState.finished(), endState);
}

