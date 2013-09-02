// Whole-script strict mode syntax
"use strict";

var getStartNodeFromPattern = require('./lib/exec').getStartNodeFromPattern;
var exec = require('./lib/exec').exec;

var BuildInRegExp = RegExp;

// See Section 9.8. Only losely following the spec here.
function ToString(input) {
    var t = input;

    // If there is a toString property that is callback.
    if (input.toString && input.toString.call) {
        input = input.toString();
    } else if (t.valueOf) {
        input = t.valueOf();
    }
    return input;
}

function RegExpJS(pattern, flags) {
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

    this.global = flags.indexOf('g') !== -1;
    this.ignoreCase = flags.indexOf('i') !== -1;
    this.multiline = flags.indexOf('m') !== -1;
    this.lastIndex = 0;

    this.source = pattern;
    this.$startNode = getStartNodeFromPattern(pattern);

    // Don't allow to overwrite the toString property on the object.
    Object.defineProperty(this, "toString", {
      writable: false,
      value: function() { return '[object RegExp]' }
    });
}

RegExpJS.prototype.execDebug = function RegExpJSExec(str) {
    // See: 15.10.6.2
    var i = this.lastIndex;
    if (this.global === false) {
        i = 0;
    }

    var res = exec(str, this.$startNode, i);

    if (res.matches && this.global === true) {
        this.lastIndex = res.idx;
    }
    return res;
};

RegExpJS.prototype.exec = function RegExpJSExec(str) {
    var res = this.execDebug(str);

    if (res.matches) {
        return res.matches;
    } else {
        return null;
    }
};

RegExpJS.prototype.test = function RegExpJSTest(str) {
    return this.exec(str) !== null;
}

if (typeof window !== 'undefined') {
    window.RegExpJS = RegExpJS;
}

exports.RegExpJS = RegExpJS;