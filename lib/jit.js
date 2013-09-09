var nodeToCharCode = require('./parser').nodeToCharCode;

function Range(min, max) {
    if (max - min <= 0) {
        throw new Error('Range min/max not possible: ' + min + ' ' + max);
    }
    this.min = min;
    this.max = max;
}

Range.prototype.toString = function() {
    var minChar = String.fromCharCode(this.min);
    var maxChar = String.fromCharCode(this.max - 1);

    return '[' + minChar + '-' + maxChar + ']';
}

Range.prototype.clone = function() {
    return new Range(this.min, this.max);
}

/**
 * Return true if the two sets intersect. If they are just edge on, this
 * function returns false.
 *
 *   |----|
 *      |----| => true
 *
 *   |----|
 *        |--| => false
 */
Range.prototype.hasIntersect = function(other) {
    return (this.min < other.max && this.max > other.min);
}

Range.prototype.edgeOnTo = function(other) {
    return this.min == other.max || this.max == other.min;
}

Range.prototype.intersect = function(other) {
    if (!this.hasIntersect(other, true)) {
        return [];
    }

    var min = Math.max(this.min, other.min);
    var max = Math.min(this.max, other.max);

    return [new Range(min, max)];
}

Range.prototype.subtract = function(other) {
    if (!this.hasIntersect(other, true)) {
        // No real intersection -> nothing to subtract.
        return [new Range(this.min, this.max)];
    }

    // This range is totally inside the `other` range and therefore removes it.
    if (this.min >= other.min && this.max <= other.max) {
        return []
    }
    // The other range is inside this range and therefor split this
    // range up.
    if (other.min >= this.min && other.max <= this.max) {
        if (this.min == other.min) {
            return [new Range(other.max, this.max)];
        } else if (this.max == other.max) {
            return [new Range(this.min, other.min)];
        } else {
            return [new Range(this.min, other.min), new Range(other.max, this.max)];
        }
    }

    if (this.min < other.min) {
        return [new Range(this.min, other.min)];
    } else {
        return [new Range(other.max, this.max)];
    }
}

function RangeList(negative, initialItem) {
    this.list = initialItem ? [initialItem] : [];
    this.negative = negative;
}

RangeList.prototype.push = function(range) {
    this.list.push(range);
    this.length = this.list.length;
}

// Merge the ranges if possible and merge overlaying ranges.
RangeList.prototype.simplify = function() {
    if (this.list.length == 0) {
        return;
    }

    this.list.sort(function(a, b) {
        return a.min - b.min;
    });

    var merged = [];
    var current = this.list[0].clone();
    for (var i = 1; i < this.list.length; i++) {
        var range = this.list[i];
        if (current.hasIntersect(range) || current.edgeOnTo(range)) {
            // The list is sorted. Therefore current.min <= range.min.
            if (range.max > current.max) {
                current.max = range.max;
            }
        } else {
            merged.push(current);
            current = range.clone()
        }
    }
    merged.push(current);
    this.list = merged;
    this.length = this.list.length;
}

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
                ranges.push(new RangeList(false, new Range(charCode, charCode + 1)));
                break;

            case 'quantifier':
                walk(node.child, ranges);
                break;

            case 'dot':
                var rl = new RangeList(true);
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

            case 'assertion':
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
    return alphabet;
}

function isJITAble(parseTree, ignoreCase) {
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
                return false;

            case 'ref':
                return false;

            default:
                throw new Error('Unsupported node type: ' + node.type);
        }
    }

    if (ignoreCase === true) {
        // TODO: Support `ignoreCase` flag.
        return false;
    }

    return walk(parseTree);
}

exports.Range = Range;
exports.RangeList = RangeList;
exports.isJITAble = isJITAble;
exports.collectCharRanges = collectCharRanges;
exports.calcAlphabet = calcAlphabet;
