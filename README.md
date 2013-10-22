RegExp.JS
=========

Implementing the JavaScript RegExp object in pure JavaScript again.

Demo: <http://jviereck.github.io/regexp.js/>

A talk about RegExp.JS can be found [here](http://2013.jsconf.eu/speakers/julian-viereck-reimplement-regexp-in-javascript.html). Slides are available on [SpeakerDeck](https://speakerdeck.com/jviereck/reimplement-regexp-in-javascript).

## Building and testing

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
