//-----------------------------------------------------------------------------
// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

function Test262Error(message) {
    if (message) this.message = message;
}

Test262Error.prototype.toString = function () {
    return "Test262 Error: " + this.message;
};

function testFailed(message) {
    throw new Test262Error(message);
}


function testPrint(message) {

}


//adaptors for Test262 framework
function $PRINT(message) {

}

function $INCLUDE(message) { }
function $ERROR(message) {
    testFailed(message);
}

function $FAIL(message) {
    testFailed(message);
}

function runTestCase(testcase) {
    if (testcase() !== true) {
        $ERROR("Test case returned non-true value!");
    }
}

//-----------------------------------------------------------------------------

require('shelljs/global');
var fs = require('fs');
var path = require('path');
var burrito = require('burrito');

global.RegExpJS = require('./../index').RegExpJS;


var SUITE = 'test/test262/test/suite/ch15/'

var knownFailures = [
    // Replace not supported yet.
    'S15.10.2.12_A1_T1.js',
    'S15.10.2.12_A2_T1.js',
    'S15.10.2.12_A3_T1.js',
    'S15.10.2.12_A4_T1.js',
    'S15.10.2.12_A5_T1.js',
    'S15.10.2.12_A6_T1.js',
    '15.10.2.8_A3_T18.js',
    // Prevent prototype assignment not possible in JS.
    'S15.10.5.1_A4.js',
    // Not supported global flag.
    'S15.10.2.12_A1_T5.js',
    'S15.10.2.12_A2_T5.js',
    'S15.10.2.12_A3_T5.js',
    'S15.10.2.12_A4_T5.js',
    'S15.10.2.12_A5_T4.js',
    // No global regexp.
    'S15.10.6.2_A3_T1.js',
    'S15.10.6.2_A3_T3.js',
    // Following tests are not testable with this test runner setup,
    // as the compared-against RegExp is replaced by the RegExpJS.
    // Wrote similar tests in project's own test suite.
    'S15.10.7_A3_T1.js',
    'S15.10.7_A3_T2.js'
];

function runTest(fullPath) {
    var skip = knownFailures.some(function(knownFail) {
        return fullPath.indexOf(knownFail) !== -1;
    });

    if (skip) {
        console.log('SKIP test: ' + fullPath);
        return;
    }

    var fileContent = fs.readFileSync(fullPath, 'UTF8');

    fileContent = fileContent.replace(/new RegExp/g, 'new RegExpJS');
    fileContent = fileContent.replace(/RegExp\(/g, 'RegExpJS(');
    fileContent = fileContent.replace(/RegExp\.prototype/g, 'RegExpJS.prototype');

    fileContent = burrito(fileContent, function(node) {
        if (node.name === 'regexp') {
            node.wrap('(new RegExpJS(%s))');
        }
    });

    console.log('run: ' + fullPath);

    // console.log(fileContent);

    var error = null;
    try {
        eval(fileContent);
    } catch (e) {
        error = e;
    }

    if (error !== null) {
        console.log('FAIL test: ' + fullPath + ' ' + error);
    } else {
        // console.log('PASS test:' + fullPath);
    }
}

//runTest(path.join(SUITE, 'ch15/15.10/15.10.3/') + 'S15.10.3.1_A1_T1.js');

// Enclose loop: test/test262/test/suite/ch15/15.10/15.10.2/15.10.2.12/S15.10.2.12_A1_T1.js
//
// var dir = path.join(SUITE, 'ch15/15.10/15.10.2/');
// ls('-R', dir).forEach(function(filePath) {
//     if (filePath.indexOf('.js') !== filePath.length - 3) return;
//     runTest(dir + filePath);
// });


function runTestInDir(dir) {
    ls('-R', dir).forEach(function(filePath) {
        if (filePath.indexOf('.js') !== filePath.length - 3) return;
        runTest(dir + filePath);
    });
}

cd(SUITE);

// === PASSING TESTS (excluding skipped test from above ;) )

runTestInDir('15.10/15.10.1/');
runTestInDir('15.10/15.10.2/');
runTestInDir('15.10/15.10.3/');
runTestInDir('15.10/15.10.4/');
runTestInDir('15.10/15.10.5/');

// runTestInDir('15.10/15.10.6/');
// runTestInDir('15.10/15.10.7/');
// runTestInDir('15.10/15.10.8/');
