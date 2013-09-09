var fs = require('fs');

var parse = require('./lib/parser.js').parse;
var RegExpJS = require('./index').RegExpJS;

var parseTests = JSON.parse(fs.readFileSync('test/parse_input.json') || '[]');
var parseResult = JSON.parse(fs.readFileSync('test/parse_output.json') || '[]');

if (parseTests.length !== parseResult.length) {
    fail('Parse input and output file needs to have same number of arguments');
}

parseTests.forEach(function(input, idx) {
    var par = parse(input);
    var res = parseResult[idx];

    if (JSON.stringify(par) !== JSON.stringify(res)) {
        throw new Error('Failure parsing string ' + input + ':' + JSON.stringify(par) + '\n' + JSON.stringify(res));
    } else {
        console.log('PASSED TEST: ' + input);
    }
});

var test_scope = '';

function pass() {
    console.log('PASSED TEST:', test_scope);
}

function fail(msg) {
    var out = 'FAILED TEST: ' + test_scope + ': ' + msg;
    console.error(out);
    throw new Error(out);
}

function assert(a, msg) {
    if (a !== true) {
        fail(msg);
    }
}

function assertEquality(a, b, msg) {
    assert(a === b, msg + ': ' + a + ' -vs- ' + b);
}

function assertEndState(endState, lastIdx, matches) {
    if (endState && endState.matches) {
        if (lastIdx === -1) {
            return fail('Got match but did not expect one');
        }

        assertEquality(endState.idx, lastIdx, 'State lastIdx does not match expected one')

        // -2 as there are two more properties on endState.match: index and input.
        if (Object.keys(endState.matches).length  - 2 !== Object.keys(matches).length) {
            return fail('Matches number does not match');
        }

        for (var i in matches) {
            assertEquality(matches[i], endState.matches[i], 'Expected match does not match')
        }
    } else {
        if (lastIdx !== -1) {
            return fail('Did not match but expected to do so');
        }
    }
    pass();
}

function exec(str, pattern) {
    // try {
        test_scope = pattern + '.exec("' + str.replace(/\n/g, '\\n') + '")'
        var regExp = new RegExpJS(pattern);
        return regExp.execDebug(str);
    // } catch(e) {
    //     fail(e);
    //     return null;
    // }
}

function assertRegExp(regExp, str) {
    var res = exec(str, regExp);
    actualResult = regExp.exec(str);

    // console.log(res.matches, actualResult);

    if (actualResult) {
        var matches = actualResult.slice(0, actualResult.length);
        assertEndState(res, actualResult.index + actualResult[0].length, matches);
    } else {
        assertEndState(res, -1);
    }
}

assertRegExp(/a+/, 'a');
assertRegExp(/[cba]/, 'da');
assertRegExp(/a(?:b)c/, 'abc');
assertRegExp(/ab(?!d)/, 'abdabc');
assertRegExp(/ab(?=c)/, 'abdabc');
assertRegExp(/\u0020/, 'a ');
assertRegExp(/[\u0020]/, 'a ');
assertRegExp(/[a-z]/, 'd');
assertRegExp(/(a)|(b)/, 'a');
assertRegExp(/(a)|(b)/, 'b');
assertRegExp(/\w/, 'a');
assertRegExp(/\s\w*/, 'foo bar');
assertRegExp(/\S\w*/, 'foo bar');
assertRegExp(/[^]/, 'b');
assertRegExp(/\x20/, ' ');
assertRegExp(/[\x20-\x21]/, ' ');
assertRegExp(/\02/, '\\02');
assertRegExp(/(.)\01/, 'a\\1');
assertRegExp(/\00/, '\00');  // matches ['\0'] and NOT ['\00']
assertRegExp(/\091/, '\091');
assertRegExp(/\71/, '9');   // because: parseInt('71',8) == 57 == '9'.charCodeAt(0);
assertRegExp(/\0001/, '\0001');
assertRegExp(/\91/, '91');
assertRegExp(/(.)(.)(.)(.)(.)(.)(.)(.)(.)\91/, '12345678991');


// From the notes at 15.10.2.5:
assertRegExp(/a[a-z]{2,4}/, 'abcdefghi');
assertRegExp(/a[a-z]{2,4}?/, 'abcdefghi');
assertRegExp(/(aa|aabaac|ba|b|c)*/, 'aabaac');
assertRegExp(/(a*)b\1+/, 'baaaac');
assertRegExp(/(z)((a+)?(b+)?(c))*/, 'zaacbbbcac');

// Test for multiple lines and `multiline` flag.
assertRegExp(/b/, 'a\nb');
assertRegExp(/^b/, 'a\nb');
assertRegExp(/a$/, 'a\nb');
assertEndState(exec('a\nb', /a$/m), 1, ['a']);
assertRegExp(/b$/, 'a\nb');
assertEndState(exec('a\nb', /^b/m), 3, ['b']);

// Boundary \b and \B tests.
assertRegExp(/\bab/, 'ab cd');
assertRegExp(/ab\b/, 'ab cd');
assertRegExp(/\bcd/, 'ab cd');
assertRegExp(/cd\b/, 'ab cd');
assertRegExp(/\Blo/, 'hallo');
assertRegExp(/l\B/, 'hal la');

assertRegExp(/(\w+).*?(\w+)/, 'foo: bar');
assertRegExp(/(?:(a+))a*b\1/, 'baaabac');
assertRegExp(/(?=(a+?))/, 'baaabac');
assertRegExp(/(?!(a{2,}))b/, 'baaabac');
assertRegExp(/(q?)b\1/, 'b');
assertRegExp(/(q)?b\1/, 'b');

// Referencing (some tests taken from the spec, see 15.10.2.8)
assertRegExp(/a(.)a\1/, 'abab');
assertRegExp(/(?=(a+))/, 'baaabac');
assertRegExp(/(?=(a+))a*b\1/, 'baaabac');
assertRegExp(/(.*?)a(?!(a+)b\2c)\2(.*)/, 'baaabaac');

// Repetition
assertRegExp(/((a)|(b))*/, 'abab');
assertRegExp(/()*/, 'a');
assertRegExp(/(()*)*/, 'a');
assertRegExp(/a{1}/, 'a');

// ignoreCase tests
assertRegExp(/a/i, 'a');
assertRegExp(/a/i, 'A');
assertRegExp(/[a]/i, 'A');
assertRegExp(/[a]/i, 'a');
assertRegExp(/[ab]/i, 'Ab');
assertRegExp(/[ab]/i, 'aB');
assertRegExp(/[a-}]/i, 'A');
assertRegExp(/[a-}]/i, 'a');
assertRegExp(/[a-a]/i, 'A');
assertRegExp(/[a-a]/i, 'a');
assertRegExp(/[a-}]/i, '\\');  // Does not match.
assertRegExp(/γ/i, 'Γ');
assertRegExp(/γ/i, 'γ');
assertRegExp(/[Α-Ω]/i, 'Γ');
assertRegExp(/[Α-Ω]/i, 'γ');
assertRegExp(/[α-ω]/i, 'Γ');
assertRegExp(/[α-ω]/i, 'γ');


// Parsing of non closing brackets (not defined in standard?)
assertRegExp(/]/, ']');
assertRegExp(/}/, '}');

// Constructor and instanceOf tests.
var __re = new RegExpJS(/[^a]*/);
assert(__re.constructor === RegExp, 'Constructor is BuildInRegExp');

// TODO: Is the following test possible to be fixed?
// assert(__re instanceof RegExp, 'Instanceof check for BuildInRegExp');

// ---

var Range = require('./lib/jit').Range;
var RangeList = require('./lib/jit').RangeList;

function assertIntersect(a, b, c, d, shouldIntersect, ignoreEdge) {
    r = new Range(a, b);
    p = new Range(c, d);
    assert(r.hasIntersect(p, ignoreEdge) == shouldIntersect, 'part 1');

    r = new Range(c, d);
    p = new Range(a, b);
    assert(r.hasIntersect(p, ignoreEdge) == shouldIntersect, 'part 2');
}

assertIntersect(0, 5, 5, 8, true);
assertIntersect(0, 4, 5, 8, false);
assertIntersect(0, 6, 5, 8, true);
assertIntersect(5, 6, 5, 8, true);
assertIntersect(6, 7, 5, 8, true);
assertIntersect(6, 9, 5, 8, true);
assertIntersect(6, 10, 5, 8, true);
assertIntersect(8, 10, 5, 8, true);
assertIntersect(9, 10, 5, 8, false);
assertIntersect(9, 10, 5, 8, false);

assertIntersect(0, 3, 3, 8, false, true);
assertIntersect(0, 4, 3, 8, true, true);
assertIntersect(0, 10, 3, 8, true, true);

r = new RangeList(false);
r.push(new Range(6, 8));
r.push(new Range(0, 5));
r.simplify();
assert(r.length === 2);
assert(r.list[0].min === 0);
assert(r.list[1].min === 6);

r = new RangeList(false);
r.push(new Range(0, 5));
r.push(new Range(6, 8));
r.simplify();
assert(r.length === 2);

r = new RangeList(false);
r.push(new Range(0, 4));
r.push(new Range(5, 8));
r.simplify();
assert(r.length === 1);  // Got merged
assert(r.list[0].min === 0);
assert(r.list[0].max === 8);

r = new RangeList(false);
r.push(new Range(0, 5));
r.push(new Range(5, 8));
r.push(new Range(1, 8));
r.simplify();
assert(r.length === 1);  // Got merged
assert(r.list[0].min === 0);
assert(r.list[0].max === 8);

r = new RangeList(false);
r.push(new Range(0, 5));
r.push(new Range(5, 9));
r.push(new Range(9, 9));
r.simplify();
assert(r.length === 1);  // Got merged
assert(r.list[0].min === 0);
assert(r.list[0].max === 9);

r = new RangeList(false);
r.push(new Range(9, 10));
r.push(new Range(0, 5));
r.push(new Range(5, 7));
r.simplify();
assert(r.length === 2);  // Got merged
assert(r.list[0].min === 0);
assert(r.list[0].max === 7);
assert(r.list[1].min === 9);
assert(r.list[1].max === 10);



