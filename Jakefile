var fs = require('fs');

var parse = require('./parser.js').parse;

var parseTests = JSON.parse(fs.readFileSync('tests/parse_input.json') || '[]');
var parseResult = JSON.parse(fs.readFileSync('tests/parse_output.json') || '[]');

desc("Run tests.");
task("test", function() {
    if (parseTests.length !== parseResult.length) {
        fail('Parse input and output file needs to have same number of arguments');
    }

    parseTests.forEach(function(input, idx) {
        var par = parse(input);
        var res = parseResult[idx];

        if (JSON.stringify(par) !== JSON.stringify(res)) {
            console.error('Failure parsing string %s', input);
        } else {
            console.log('PASSED TEST: ' + input);
        }
    })
});

desc("Create refrence file.");
task("ref", function() {
    var arr = parseTests.map(parse);

    fs.writeFileSync('tests/parse_output.json', JSON.stringify(arr, null, 2));
});
