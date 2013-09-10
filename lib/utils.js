function clone(src) {
  function mixin(dest, source, copyFunc) {
    var name, s, i, empty = {};
    for(name in source){
      // the (!(name in empty) || empty[name] !== s) condition avoids copying properties in "source"
      // inherited from Object.prototype.   For example, if dest has a custom toString() method,
      // don't overwrite it with the toString() method that source inherited from Object.prototype
      s = source[name];
      if(!(name in dest) || (dest[name] !== s && (!(name in empty) || empty[name] !== s))){
        dest[name] = copyFunc ? copyFunc(s) : s;
      }
    }
    return dest;
  }

  if(!src || typeof src != "object" || Object.prototype.toString.call(src) === "[object Function]"){
    // null, undefined, any non-object, or function
    return src;  // anything
  }
  if(src.nodeType && "cloneNode" in src){
    // DOM Node
    return src.cloneNode(true); // Node
  }
  if(src instanceof Date){
    // Date
    return new Date(src.getTime());  // Date
  }
  if(src instanceof RegExp){
    // RegExp
    return new RegExp(src);   // RegExp
  }
  var r, i, l;
  if(src instanceof Array){
    // array
    r = [];
    for(i = 0, l = src.length; i < l; ++i){
      if(i in src){
        r.push(clone(src[i]));
      }
    }
    // we don't clone functions for performance reasons
    //    }else if(d.isFunction(src)){
    //      // function
    //      r = function(){ return src.apply(this, arguments); };
  }else{
    // generic objects
    r = src.constructor ? new src.constructor() : {};
  }
  return mixin(r, src, clone);
}

// As specified in section 15.10.2.8.
// When calling this function `ignoreCase` is assumed to be true.
function canonicalize(ch) {
  var u = String.prototype.toUpperCase.call(ch);

  if (u.length !== 1) {
    return ch;
  }

  if (ch.charCodeAt(0) >= 128 && u.charCodeAt(0) < 128) {
    return ch;
  }

  return u;
}

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

function RangeList(negative, initialList) {
    this.list = initialList || [];
    this.negative = negative;
    this.length = this.list.length;
}

RangeList.prototype.clone = function() {
    return new RangeList(this.negative, this.list.slice());
}

RangeList.prototype.toString = function() {
    return '[' + this.list.map(function(e) { return e.toString() }) + ']';
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

/**
 * Returns from the current RangeList a new RangeList with all the ranges of
 * this range that intersect with any of the otherRangeList ranges.
 */
RangeList.prototype.intersect = function(otherRangeList, reverse) {
    reverse = !!reverse;
    var matches = this.list.filter(function(range) {
        return otherRangeList.list.some(function(otherRange) {
            return range.hasIntersect(otherRange);
        }) !== reverse;
    });
    return new RangeList(false, matches);
};

RangeList.prototype.hasIntersectRange = function(otherRange) {
    return this.list.some(function(range) {
        return range.hasIntersect(otherRange);
    });
}

RangeList.prototype.hasIntersect = function(otherRangeList, reverse) {
    return this.intersect(otherRangeList, reverse).length !== 0;
}


exports.isSameArray = function(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

exports.Range = Range;
exports.RangeList = RangeList;

exports.clone = clone;
exports.canonicalize = canonicalize;
