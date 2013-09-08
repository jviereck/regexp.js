// Whole-script strict mode syntax
"use strict";

var getStartNodeFromPattern = require('./lib/exec').getStartNodeFromPattern;
var exec = require('./lib/exec').exec;
var canonicalize = require('./lib/utils').canonicalize;

var BuildInRegExp = RegExp;

// See Section 9.3. Only losely following the spec here.
function ToNumber(value) {
    if (value === undefined) {
        return NaN;
    } else if (value === null) {
        return +0;
    } else if (value === true) {
        return 1;
    } else if (value === false) {
        return +0;
    } else if (typeof value === 'number') {
        return value;
    } else if (typeof value === 'string') {
        // This is not really what the spec says.
        return parseFloat(value);
    } else {
        // This is not really what the spec says.
        var r = parseFloat(value.valueOf());
        if (isNaN(r)) {
            return parseFloat(ToString(value));
        }
        return r;
    }
}

function sign(x) {
    return x >= 0 ? 1 : -1;
}

// See Section 9.4. Only losely following the spec here.
function ToInteger(value) {
    var number = ToNumber(value);

    if (isNaN(number)) {
        return +0;
    } else if (number === 0 || !isFinite(number)) {
        return number;
    } else {
        return sign(number) * Math.floor(Math.abs(number));
    }
}

// See Section 9.8. Only losely following the spec here.
function ToString(input) {
    var t = input;

    if (input === undefined) {
        return 'undefined';
    } else if (input === null) {
        return 'null';
    } else if (input === false) {
        return 'false';
    } else if (input === true) {
        return 'true';
    } else if (typeof input === 'number') {
        return input + '';
    } else if (typeof input === 'string') {
        return input;
    }

    // If there is a toString property that is callback.
    if (input.toString && input.toString.call) {
        input = input.toString();
    } else if (t.valueOf) {
        input = t.valueOf();
    }
    return ToString(input);
}

var __DIRECT_RETURN__ = {};

function RegExpJS(pattern, flags) {
    // Hack to make `RegExpJSReturn.prototype = new RegExpJS(RegExpJSReturn);`
    // work :)
    if (pattern === __DIRECT_RETURN__) {
        return this;
    }

    // Calling RegExp('a') is valid and should return a new object.
    if (this === undefined || this.__proto__ !== RegExpJS.prototype) {
        return new RegExpJS(pattern, flags);
    }

    if (pattern === null) {
        pattern = 'null';
    } else if (!pattern) {
        pattern = '(?:)';
    }

    // Don't recreate a RegExpJS object if the passed in pattern is already
    // an RegExpJS object.
    if (pattern instanceof RegExpJS) {
        if (flags === undefined) {
            return pattern;
        } else {
            throw new TypeError('Cannot supply flags when constructing one RegExp from another');
        }
    }

    // if (flags !== undefined) {
    //     throw new Error('Flags are not supported yet');
    // }

    if (pattern instanceof BuildInRegExp) {
        var str = ToString(pattern);
        pattern = str.substring(1, str.lastIndexOf('/'));
        flags = str.substring(str.lastIndexOf('/') + 1);
    } else {
        pattern = ToString(pattern);
    }

    // TOOD: What should happen if flags are passed via the pattern AND
    // as second arguemtn?

    function invalidFlags() {
        // flag is invalid if it is is null
        if (flags === null) return true;

        flags = ToString(flags);

        // flags is invalid if it is made up of any other character
        // than g, i, m or consists any of these letters more than once.
        return !/^(?:g|i|m)*$/.test(flags) ||
          /(i[^i]*){2,}/.test(flags) ||
          /(g[^g]*){2,}/.test(flags) ||
          /(m[^m]*){2,}/.test(flags);
    }

    // Check if the passed in flags are valid.
    if (flags !== undefined && invalidFlags()) {
        throw new SyntaxError('Invalid flags supplied to RegExp constructor ' + flags);
    } else {
        flags = flags || '';
    }

    // Instead of returning the RegExp object constructed here, return
    // a instance of RegExpReturn, which is based on the RegExpJS object.
    // This is necessary to set the `source`, `global`, ... properties to
    // different values then the RegExpJS ones. As these properties are not
    // writeable (by the spec!), they cannot be set on the `this` object
    // directly.
    var RegExpReturn = function RegExpJSReturnDummy() { };
    RegExpReturn.prototype = new RegExpJS(__DIRECT_RETURN__);

    var ret = new RegExpReturn();

    ret.constructor = BuildInRegExp;

    function freezeIt(prop, propValue) {
        // The `source` property
        Object.defineProperty(ret, prop, {
          writable: false,
          enumerable: false,
          configurable: false,
          value: propValue
        });

        Object.defineProperty(RegExpReturn.prototype, prop, {
          writable: false,
          enumerable: false,
          configurable: false,
          value: propValue
        });
    }

    freezeIt('source', pattern);
    freezeIt('global', flags.indexOf('g') !== -1);
    freezeIt('ignoreCase', flags.indexOf('i') !== -1);
    freezeIt('multiline', flags.indexOf('m') !== -1);

    Object.defineProperty(ret, 'lastIndex', {
      writable: true,
      enumerable: false,
      configurable: false,
      value: 0
    });

    ret.$startNode = getStartNodeFromPattern(pattern, ret.ignoreCase);

    // Don't allow to overwrite the toString property on the object.
    Object.defineProperty(ret, 'toString', {
      writable: false,
      enumerable: false,
      configurable: false,
      value: function() { return '[object RegExp]'; }
    });

    return ret;
}

RegExpJS.prototype.execDebug = function RegExpJSExec(str) {
    // See: 15.10.6.2
    var i = this.lastIndex;
    if (this.global === false) {
        i = 0;
    } else {
        i = ToInteger(i);
    }

    str = ToString(str);

    if (i < 0 || i > str.length) {
        this.lastIndex = 0;
        // This makes the caller RegExpJS.prototype.exec
        // return `null`.
        return { matches: null };
    }

    var res = exec(str, this.$startNode, i, this.multiline, this.ignoreCase);

    if (res.matches && this.global === true) {
        this.lastIndex = res.idx;
    }
    return res;
};

RegExpJS.prototype.exec = function RegExpJSExec(str) {
    // console.log('RegExpJS.prototype.exec', str)
    var res = this.execDebug(str);

    if (res.matches) {
        return res.matches;
    } else {
        return null;
    }
};

RegExpJS.prototype.test = function RegExpJSTest(str) {
    return this.exec(str) !== null;
};

RegExpJS.prototype.exec.prototype = undefined;
RegExpJS.prototype.test.prototype = undefined;

function defineProperty(prop, propValue) {
    Object.defineProperty(RegExpJS.prototype, prop, {
      writable: false,
      enumerable: false,
      configurable: false,
      value: propValue
    });
}

defineProperty('source', '(?:)');
defineProperty('global', false);
defineProperty('multiline', false);
defineProperty('ignoreCase', false);

Object.defineProperty(RegExpJS.prototype, 'lastIndex', {
  writable: true,
  enumerable: false,
  configurable: false,
  value:0
});

if (typeof window !== 'undefined') {
    window.RegExpJS = RegExpJS;
}

exports.RegExpJS = RegExpJS;