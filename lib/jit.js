var nodeToCharCode = require('./parser').nodeToCharCode;

var Range = require('./utils').Range;
var RangeList = require('./utils').RangeList;

function collectCharRanges(parseTree) {
    // TODO: Merge this function with the one in `exec.js`.
    function buildClassEntryRange(entry) {
        switch (entry.type) {
            case 'character':
            case 'escape':
                var charCode = nodeToCharCode(entry);
                return new Range(charCode, charCode + 1);

            case 'characterClassRange':
                var min = nodeToCharCode(entry.min);
                var max = nodeToCharCode(entry.max);

                if (max < min) {
                    // TODO: Better error message.
                    throw new Error('Character not in right order');
                }
                return new Range(min, max + 1);

            case 'empty':
                return null;

            case 'escapeChar':
            default:
                throw new Error('Unkown classRange entry type: ' + entry.type);
        }
    }

    function walk(node, ranges) {
        switch (node.type) {
            case 'disjunction':
                node.alternatives.forEach(function(node) {
                    walk(node, ranges);
                });
                break;

            case 'alternative':
                node.terms.forEach(function(node) {
                    walk(node, ranges);
                });
                break;

            case 'character':
            case 'escape':
                var charCode = nodeToCharCode(node);
                ranges.push(new RangeList(false, [new Range(charCode, charCode + 1)]));
                break;

            case 'quantifier':
                walk(node.child, ranges);
                break;

            case 'dot':
                var rl = new RangeList(true /* negativeMatch */);
                // '\n\r\u2028\u2029'
                [10, 13, 8232, 8233].forEach(function(charCode) {
                    rl.push(new Range(charCode, charCode + 1));
                });
                ranges.push(rl);
                break;

            case 'characterClass':
                var rl = new RangeList(node.negative);
                node.classRanges.forEach(function(classEntry) {
                    var res = buildClassEntryRange(classEntry);
                    if (res) {
                        rl.push(res);
                    }
                });
                rl.simplify();
                ranges.push(rl);
                break;

            case 'assertion':
            case 'empty':
                break;

            case 'group':
                // Only surpport the `ignore` type of groups (?:) in JIT mode.
                if (node.behavior === 'ignore') {
                    walk(node.disjunction, ranges);
                    break;
                }

                // PASS THROUGH

            case 'escapeChar':
                // TODO: Implement me :)

            case 'ref':
            default:
                throw new Error('Unsupported node type: ' + node.type);
        }
    }

    var ranges = [];
    walk(parseTree, ranges);

    return ranges;
}

/**
 * Takes two lists of ranges and computes a list of ranges, such that
 * - the ranges do not inner-intersect with each other
 * - every range in either of the range list can be written as the sum of
 *   ranges given result range list.
 *
 * Eg.:
 *
 * listA  =         |---|   |----|
 * listB  = |--| |------------|
 *
 * result = |--| |--|---|---|-|--|
 *
 **/
function splitLists(listA, listB) {
    if (listA.length == 0) {
        return listB;
    }

    var listA = listA.slice();
    var listB = listB.slice();

    listBLoop:
    for (var n = 0; n < listB.length; n++) {
        var s = listB[n];
        for (var i = listA.length - 1; i >= 0; i--) {
            var p = listA[i];
            var A = p.subtract(s);
            var B = p.intersect(s);
            var sub = s.subtract(p);

            listA.splice.apply(listA, [i, 1].concat(A, B));

            if (sub.length == 0) {
                continue listBLoop;
            } else if (sub.length == 2) {
                listB.push(sub[1]);
            }
            s = sub[0];
        }
        listA.push(s);
    }

    return listA;
}

function calcAlphabet(ranges) {
    if (ranges.length === 0) {
        return ranges;
    }

    var alphabet = ranges[0].list;
    for (var i = 1; i < ranges.length; i++) {
        var rangeList = ranges[i].list;

        alphabet = splitLists(alphabet, rangeList);
    }
    return new RangeList(false, alphabet);
}

function isJITAble(parseTree, ignoreCase) {
    var assertionCounter = 0;

    function walk(node) {
        switch (node.type) {
            case 'disjunction':
                return node.alternatives.every(walk);

            case 'alternative':
                return node.terms.every(walk);

            case 'quantifier':
                if (!node.greedy) {
                    return false;
                }
                return walk(node.child);

            case 'character':
            case 'escape':
            case 'dot':
            case 'empty':
                return true;

            case 'characterClass':
                // TODO: Implement support for escapeChar in classRanges in
                // `collectCharRanges()` function.
                return node.classRanges.every(function(entry) {
                    return entry.type !== 'escapeChar';
                });

            case 'group':
                // Only surpport the `ignore` type of groups (?:) in JIT mode.
                if (node.behavior !== 'ignore') {
                    return false;
                }

                return walk(node.disjunction);

            case 'escapeChar':
                // TODO: Not simple to enable this, but needs to add
                // functionality for this case to `collectCharRanges()`.
                return false;

            case 'assertion':
                if (assertionCounter++ === 0) {
                    return true;
                }
                return false;

            case 'ref':
                return false;

            default:
                throw new Error('Unsupported node type: ' + node.type);
        }
    }

    if (parseTree.type !== 'alternative' ||
        parseTree.terms[0].type !== 'assertion' ||
        parseTree.terms[0].sub !== 'start')
    {
        // TODO: Support other regexps than the ones that start with a ^ as well.
        return false;
    }

    if (ignoreCase === true) {
        // TODO: Support `ignoreCase` flag.
        return false;
    }

    return walk(parseTree);
}

// -----------------------------------------------------------------------------

function objectValues(obj) {
    var keys = Object.keys(obj).sort();
    var res = [];

    for (var i = 0; i < keys.length; i++) {
        res.push(obj[keys[i]]);
    }
    return res;
}

function State(id) {
    this.id = id;
    this.name = this.id;
    this.transitions = [];
    this.epsilonClosure = null;
}

State.prototype.addTransition = function(rangeList, targetState) {
    this.epsilonClosure = null;
    this.transitions.push({
        matches: rangeList,
        target: targetState
    });
};

State.prototype.getEpsilonClosure = function() {
    if (this.epsilonClosure) {
        return this.epsilonClosure;
    }

    var self = this;
    var closure = {};

    function walk(state) {
        closure[state.id] = state;

        state.transitions.forEach(function(trans) {
            if (trans.matches.hasIntersectRange(EPSILON_CHAR) && trans.target !== self) {
                walk(trans.target);
            }
        });
    }
    walk(this);
    return this.epsilonClosure = objectValues(closure).sort(function(a, b) {
        return a.id - b.id;
    });
}

State.prototype.toString = function() {
    return this.name + '\n     ' + this.transitions.map(function(trans) {
        return trans.matches.toString() + ' => ' + trans.target.name;
    }).join('  \n     ');
}

// The empty match :)
var EPSILON = new RangeList(false, [new Range(-2, -1)]);
var OTHERS = new RangeList(false, [new Range(-3, -2)]);

var EPSILON_CHAR = EPSILON.list[0];
var OTHERS_CHAR = OTHERS.list[0];

EPSILON.toString = function() { return '[EPSILON]'; }
OTHERS.toString = function() { return '[OTHERS]'; }

function NFA(parseTree) {
    this.initalState = new State(0);
    this.finalState = new State(1);
    this.states = [this.initalState, this.finalState];

    var charRanges = collectCharRanges(parseTree);
    var alphabet = calcAlphabet(charRanges);
    this.alphabet = alphabet;

    function walk(node, nfa, fromState, toState) {
        var i;
        switch(node.type) {
            case 'disjunction':
                node.alternatives.forEach(function(node) {
                    walk(node, nfa, fromState, toState);
                });
                break;

            case 'alternative':
                var terms = node.terms;

                var states = [fromState];
                // Create one state less than counter of terms.
                for (i = 1; i < terms.length; i++) {
                    states.push(nfa.newState());
                }
                states.push(toState);

                for (i = 0; i < terms.length; i++) {
                    walk(terms[i], nfa, states[i], states[i + 1]);
                }
                break;

            case 'character':
            case 'escape':
            case 'dot':
            case 'characterClass':
                var rangeList = collectCharRanges(node)[0];
                var negative = !!node.negative;

                // Calculate the characters/ranges of the alphabet, that are
                // required to write all the possible ranges in rangeList.
                // In the case of a negative list, reverse to get all the
                // other that are not matched.
                var matches = alphabet.intersect(rangeList, negative);

                if (negative) {
                    matches.push(OTHERS);
                }

                fromState.addTransition(matches, toState);
                break;

            case 'assertion':
            case 'empty':
                fromState.addTransition(EPSILON, toState);
                break;

            default:
                throw new Error('Need to implement ' + node.type + ' support in NFA builder');
        }
    }

    console.log('alphabet:', alphabet.toString());

    walk(parseTree, this, this.initalState, this.finalState);
}

NFA.prototype.newState = function() {
    var state = new State(this.states.length);
    this.states.push(state);
    return state;
}

NFA.prototype.toString = function() {
    return 'NFA dump\n  ' + this.states.map(function(state) {
        return state.toString();
    }).join('  \n  ');
};

function DFAState(id, nfaStates) {
    State.call(this, id);
    this.nfaStates = nfaStates;
    this.final = false;
    this.name = id + ': NFA-States={' + nfaStates.map(function(state) {return state.name}).join(', ') + '} ';
}

DFAState.prototype = new State(0);

/**
 * moveNFA(A, a)
 *
 *   returns all states that can be reached from a state in A by doing the
 *   transition with the character `a`
 */
function moveNFA(dfaState, character) {
    var res = {};
    dfaState.nfaStates.forEach(function(state) {
        state.transitions.forEach(function(trans) {
            if (trans.matches.hasIntersectRange(character)) {
                var target = trans.target;
                res[target.id] = target;
            }
        })
    });
    return objectValues(res);
}

/**
 *
 */
function epsilonClosureFromStates(states) {
    var res = {};
    states.forEach(function(state) {
        state.getEpsilonClosure().forEach(function(closureState) {
            res[closureState.id] = closureState;
        });
    });
    var id = Object.keys(res).map(function(a) {return parseInt(a, 10);}).sort().join(',');
    var res = objectValues(res);
    res.id = id;
    return res;
}

function DFA(nfa) {
    var nfaStates = nfa.states;
    var alphabet = nfa.alphabet.clone();
    alphabet.push(OTHERS_CHAR);

    // Actual NFA -> DFA algorith.
    // Following the slides from
    // http://web.cecs.pdx.edu/~harry/compilers/slides/LexicalPart3.pdf

    var idCounter = 0;
    var initialState = new DFAState(idCounter++, nfaStates[0].getEpsilonClosure());

    // Use this map to identify if a set of states is already mapped to a
    // DFAState.
    var closureMap = {};
    closureMap[initialState.nfaStates.id] = initialState;

    var states = this.states = [initialState];

    var unmarkedStates = [initialState];

    var current;
    while (current = unmarkedStates.shift()) {
        alphabet.list.forEach(function(ch) {
            var t = moveNFA(current, ch);

            // No moves from current for this character -> nothing todo.
            if (t.length === 0) {
                return;
            }

            var S = epsilonClosureFromStates(t);

            var targetState = closureMap[S.id];
            if (!targetState) {
                targetState = new DFAState(idCounter++, S);
                closureMap[S.id] = targetState
                unmarkedStates.push(targetState);
                states.push(targetState);
            }

            current.addTransition(ch, targetState);
        });
    }

    // Get all the final states.
    // Do this by a nasty hack. Look at all closure ids that contain a `1` state
    // which is by definition the final state.
    var finalStates = Object.keys(closureMap).filter(function(name) {
        return /\b1\b/.test(name);
    }).map(function(id) {
        return closureMap[id];
    });
    finalStates.forEach(function(dfaState) {
        dfaState.final = true;
    });

    this.finalStates = finalStates;

    console.log('all states', this.toString());

    var names = finalStates.map(function(state) {
        return state.name;
    });

    console.log('final states:', '\n  ' + names.join('\n  '));

}

DFA.prototype.toString = function() {
    return 'DFA dump\n  ' + this.states.map(function(state) {
        return state.toString();
    }).join('  \n  ');
};


exports.EPSILON = EPSILON;
exports.State = State;
exports.isJITAble = isJITAble;
exports.collectCharRanges = collectCharRanges;
exports.calcAlphabet = calcAlphabet;

exports.NFA = NFA;
exports.DFA = DFA;

