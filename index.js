// Whole-script strict mode syntax
"use strict";

var getStartNodeFromPattern = require('./lib/exec').getStartNodeFromPattern;
var exec = require('./lib/exec').exec;

var BuildInRegExp = RegExp;

function RegExpJS(pattern, flags) {
    // Calling RegExp('a') is valid and should return a new object.
    if (this === undefined || this.__proto__ !== RegExpJS.prototype) {
        return new RegExpJS(pattern, flags);
    }

    if (!pattern) {
        pattern = '(?:)';
    }

    // Don't recreate a RegExpJS object if the passed in pattern is already
    // an RegExpJS object.
    if (pattern instanceof RegExpJS) {
        if (flags === undefined) {
            return pattern;
        } else {
            pattern = pattern.source;
        }
    }

    // if (flags !== undefined) {
    //     throw new Error('Flags are not supported yet');
    // }

    if (pattern instanceof BuildInRegExp) {
        var str = pattern.toString();
        pattern = str.substring(1, str.lastIndexOf('/'));
        flags = str.substring(str.lastIndexOf('/') + 1);
    } else {
        pattern = pattern.toString();
        if (flags) {
            flags = flags.toString();
        }
    }

    // TOOD: What should happen if flags are passed via the pattern AND
    // as second arguemtn?

    // Check if the passed in flags are valid.
    if (flags && !/^(?:g|i|m)*$/.test(flags)) {
        throw new TypeError('Invalid flags supplied to RegExp constructor ' + flags);
    } else {
        flags = flags || '';
    }

    this.global = flags.indexOf('g') !== -1;
    this.ignoreCase = flags.indexOf('i') !== -1;
    this.multiline = flags.indexOf('y') !== -1;
    this.lastIndex = 0;

    this.source = pattern;
    this.$startNode = getStartNodeFromPattern(pattern);
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