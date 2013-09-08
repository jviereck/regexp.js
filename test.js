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
    try {
        test_scope = pattern + '.exec("' + str.replace(/\n/g, '\\n') + '")'
        var regExp = new RegExpJS(pattern);
        return regExp.execDebug(str);
    } catch(e) {
        fail(e);
        return null;
    }
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

// Referencing (some tests taken from the spec, see 15.10.2.8)
assertRegExp(/a(.)a\1/, 'abab');
assertRegExp(/(?=(a+))/, 'baaabac');
// assertEndState(exec('baaabac', /(?=(a+))a*b\1/), 3, ["aba", "a"]); // FAILING
assertRegExp(/(.*?)a(?!(a+)b\2c)\2(.*)/, 'baaabaac');

// Repetition
assertRegExp(/((a)|(b))*/, 'abab');
assertRegExp(/()*/, 'a');
assertRegExp(/(()*)*/, 'a');
assertRegExp(/a{1}/, 'a');

// Parsing of non closing brackets (not defined in standard?)
assertRegExp(/]/, ']');
assertRegExp(/}/, '}');

// Constructor and instanceOf tests.
var __re = new RegExpJS(/[^a]*/);
assert(__re.constructor === RegExp, 'Constructor is BuildInRegExp');

// TODO: Is the following test possible to be fixed?
// assert(__re instanceof RegExp, 'Instanceof check for BuildInRegExp');
