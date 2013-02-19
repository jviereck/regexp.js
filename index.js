// Whole-script strict mode syntax
"use strict";

var getStartNodeFromPattern = require('./lib/exec').getStartNodeFromPattern;
var exec = require('./lib/exec').exec;

function RegExpJS(pattern, flags) {
    if (flags !== undefined) {
        throw new Error('Flags are not supported yet');
    }

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