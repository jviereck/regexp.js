var nodeToCharCode = require('./parser').nodeToCharCode;

function Range(min, max) {
    this.min = min;
    this.max = max + 1;
}

/**
 * Inclusive intersection of two ranges.
 * Inclusive means, that two touching ranges intersect as well.
 */
Range.prototype.intersect = function(other) {
    if (this.min <= other.max && this.max >= other.min) {
        return true;
    } else {
        return false;
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
    var current = this.list[0];
    for (var i = 1; i < this.list.length; i++) {
        var range = this.list[i];
        if (current.intersect(range)) {
            // The list is sorted. Therefore current.min <= range.min.
            if (range.max > current.max) {
                current.max = range.max;
            }
        } else {
            merged.push(current);
            current = range;
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
                var charCode = nodeToCharCode(node);
                return new Range(charCode, charCode);

            case 'characterClassRange':
                var min = nodeToCharCode(entry.min);
                var max = nodeToCharCode(entry.max);

                if (max < min) {
                    // TODO: Better error message.
                    throw new Error('Character not in right order');
                }
                return new Range(min, max);

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
                ranges.push(new RangeList(false, new Range(charCode, charCode)));
                break;

            case 'quantifier':
                walk(node.child, ranges);
                break;

            case 'dot':
                var rl = new RangeList(true);
                // '\n\r\u2028\u2029'
                [10, 13, 8232, 8233].forEach(function(charCode) {
                    rl.push(new Range(charCode, charCode));
                });
                ranges.push(rl);
                break;

            case 'characterClass':
                var rl = new RangeList(true);
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

function isJITAble(parseTree, ignoreCase) {
    function walk(node) {
        switch (node.type) {
            case 'disjunction':
                return node.alternatives.every(walk);

            case 'alternative':
                return node.terms.every(walk);

            case 'quantifier':
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
