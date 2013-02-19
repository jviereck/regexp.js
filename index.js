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

    // Check if the passed in flags are valid.
    if (flags && !/^(?:g|i|m|y)*$/.test(flags)) {
        throw new TypeError('Invalid flags supplied to RegExp constructor ' + flags);
    }

    // if (flags !== undefined) {
    //     throw new Error('Flags are not supported yet');
    // }

    if (pattern instanceof BuildInRegExp) {
        var str = pattern.toString();
        // TODO: This ignores flags for now, e.g. /x/i
        pattern = str.substring(1, str.lastIndexOf('/'));
    } else {
        pattern = pattern.toString();
    }

    this.source = pattern;
    this.$startNode = getStartNodeFromPattern(pattern);
    this.lastIndex = 0;
}

RegExpJS.prototype.execDebug = function RegExpJSExec(str) {
    return exec(str, this.$startNode, this.lastIndex);
};

RegExpJS.prototype.exec = function RegExpJSExec(str) {
    var res = this.execDebug(str);

    if (res.matches) {
        return res.matches;
    } else {
        return null;
    }
};

if (typeof window !== 'undefined') {
    window.RegExpJS = RegExpJS;
}

exports.RegExpJS = RegExpJS;