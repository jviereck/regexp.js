RegExp.JS
=========

Implementing the JavaScript RegExp object in pure JavaScript again. Demo: <http://jviereck.github.io/regexp.js/>

Build the file `build/browser.js` by executing.

```
browserify index.js -d -w -o build/browser.js
```

To run (all) tests, you have to first get the files from

```
http://hg.ecmascript.org/tests/test262/
```

and place them under `test/test262/`. Then run

```
node test.js
```

to execute the tests from RegExp.JS themself and to run the test262 tests, run

```
node test/run_test262.js
```

More inforation: TODO.
