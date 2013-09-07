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
        throw 'Failure parsing string ' + input + ':' + JSON.stringify(par) + '\n' + JSON.stringify(res);
    } else {
        console.log('PASSED TEST: ' + input);
    }
});

var test_scope = '';

function pass() {
    console.log('PASSED TEST:', test_scope);
}

function fail(msg) {
    var out = 'FAILED TEST: ' + test_scope + ':' + msg;
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
    test_scope = 'String: ' + str.replace(/\n/g, '\\n') + ', Pattern: ' + pattern
    var regExp = new RegExpJS(pattern);
    return regExp.execDebug(str);
}

assertEndState(exec('a', 'a+'), 1, ['a']);
assertEndState(exec('da', '[cba]'), 2, ['a']);
assertEndState(exec('abc', 'a(?:b)c'), 3, ['abc']); // Not remember
assertEndState(exec('abdabc', 'ab(?!d)'), 5, ['ab']); // Only if not followed by
assertEndState(exec('abdabc', 'ab(?=c)'), 5, ['ab']); // Only if not followed by
assertEndState(exec('a ', '\\u0020'), 2, [' ']);
assertEndState(exec('a ', '[\\u0020]'), 2, [' ']);
assertEndState(exec('d', '[a-z]'), 1, ['d']);
assertEndState(exec('a', '(a)|(b)'), 1, ['a', 'a', undefined]);
assertEndState(exec('b', '(a)|(b)'), 1, ['b', undefined, 'b']);
assertEndState(exec('a', '\\w'), 1, ['a']);
assertEndState(exec('foo bar', '\\s\\w*'), 7, [' bar']);
assertEndState(exec('foo bar', '\\S\\w*'), 3, ['foo']);
assertEndState(exec('b', '[^]'), 1, ['b']);

// Test for multiple lines and `multiline` flag.
assertEndState(exec('a\nb', 'b'), 3, ['b']);
assertEndState(exec('a\nb', '^b'), -1);
assertEndState(exec('a\nb', 'a$'), -1);
assertEndState(exec('a\nb', /a$/m), 1, ['a']);
assertEndState(exec('a\nb', 'b$'), 3, ['b']);
assertEndState(exec('a\nb', /^b/m), 3, ['b']);

// Boundary \b and \B tests.
assertEndState(exec('ab cd', '\\bab'), 2, ['ab']);
assertEndState(exec('ab cd', 'ab\\b'), 2, ['ab']);
assertEndState(exec('ab cd', '\\bcd'), 5, ['cd']);
assertEndState(exec('ab cd', 'cd\\b'), 5, ['cd']);
assertEndState(exec('hallo', '\\Blo'), 5, ['lo']);
assertEndState(exec('hal la', 'l\\B'), 5, ['l']);

assertEndState(exec('foo: bar', '(\\w+).*?(\\w+)'), 8, ['foo: bar', 'foo', 'bar']);

// Referencing
assertEndState(exec('abab', 'a(.)a\\1'), 4, ['abab', 'b']);

// Repetition
assertEndState(exec('abab', '((a)|(b))*'), 4, ['abab', 'b', undefined, 'b']);
assertEndState(exec('a', '()*'), 0, ['', '']);
assertEndState(exec('a', '(()*)*'), 0, ['', '', '']);
assertEndState(exec('a', 'a{1}'), 1, ['a']);

// Parsing of non closing brackets (not defined in standard?)
assertEndState(exec(']', ']'), 1, [']']);
assertEndState(exec('}', '}'), 1, ['}']);

// Constructor and instanceOf tests.
var __re = new RegExpJS(/[^a]*/);
assert(__re.constructor === RegExp, 'Constructor is BuildInRegExp');

// TODO: Is the following test possible to be fixed?
// assert(__re instanceof RegExp, 'Instanceof check for BuildInRegExp');
