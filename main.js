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

Node.CHAR = 'CHAR';
Node.ALTR = 'ALTR';
Node.GROP = 'GROP';

// node types:
// - character
// - group
// - repeat
// - lookback

function State(str) {
    this.str = str;
    this.idx = 0;
    this.matches = {};
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
}

State.prototype.store = function(idx, from, to) {
    this.matches[idx] = this.str.substring(from.idx, to.idx);
}



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
            case Node.GROP:
                res = match(state.clone(), node.left);
                if (!res) {
                    return false;
                }
                res.store(node.data, state, res);
                state = res;
                node = node.next;
                break;
        }
    }
    return state;
}

function buildNodesForStr(str) {
    var nodes = str.split('').map(function(ch, idx) {
        var node = new Node(Node.CHAR, idx, idx + 1);
        node.data = ch;
        return node;
    });
    for (var i = 0; i < nodes.length - 1; i++) {
        nodes[i].next = nodes[i + 1];
    }

    return nodes;
}

function run(value) {
    var str = 'foo';

    var left = buildNodesForStr('foa')[0];
    var right = buildNodesForStr('foo')[0];

    var group = new Node(Node.GROP, 0 , 0);
    group.left = right;
    group.data = 1;


    var node = new Node(Node.ALTR, 0, 7);
    node.left = left;
    node.right = group;

    var state = new State(str);

    console.log(match(state, node));
}

