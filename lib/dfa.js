
var utils = require('./utils');

var Range = utils.Range;
var RangeList = utils.RangeList;

function State(id) {
    this.id = id;
    this.transitions = [];
}

State.prototype.addTransition = function(rangeList, targetState) {
    this.transitions.push({
        matches: rangeList,
        target: targetState
    });
};

State.prototype.toString = function() {
    return this.id + '  ' + this.transitions.map(function(trans) {
        return trans.matches.toString() + ' => ' + trans.target.id;
    }).join('  \n     ');
}

function NFA() {
    this.initalState = new State(0);
    this.finalState = new State(1);
    this.states = [this.initalState, this.finalState];
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

// The empty match :)
var EPSILON = new RangeList(false, [new Range(-2, -1)]);
var OTHERS = new RangeList(false, [new Range(-3, -2)]);

EPSILON.toString = function() { return '[EPSILON]'; }
OTHERS.toString = function() { return '[OTHERS]'; }

function buildNFA(parseTree, alphabet) {
    var collectCharRanges = require('./jit').collectCharRanges;

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
                var matches = alphabet.intersectWith(rangeList, negative);

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

    var nfa = new NFA();
    walk(parseTree, nfa, nfa.initalState, nfa.finalState);

    console.log(nfa.toString());

    return nfa;
}

exports.buildNFA = buildNFA;
