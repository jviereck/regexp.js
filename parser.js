

// Assertion ::
//      ^
//      $
//      \ b
//      \ B
//      ( ? = Disjunction )
//      ( ? ! Disjunction )
//
// Quantifier ::
//      QuantifierPrefix
//      QuantifierPrefix ?
//
// QuantifierPrefix ::
//      *
//      +
//      ?
//      { DecimalDigits }
//      { DecimalDigits , }
//      { DecimalDigits , DecimalDigits }
//
// Atom ::
//      PatternCharacter
//      .
//      \ AtomEscape
//      CharacterClass
//      ( Disjunction )
//      ( ? : Disjunction )
//
// PatternCharacter ::
//      SourceCharacter but not any of: ^ $ \ . * + ? ( ) [ ] { } |
//
// AtomEscape ::
//      DecimalEscape
//      CharacterEscape
//      CharacterClassEscape
//
// CharacterEscape ::
//      ControlEscape
//      c ControlLetter
//      HexEscapeSequence
//      UnicodeEscapeSequence
//      IdentityEscape
//
// ControlEscape ::
//      one of f n r t v
// ControlLetter ::
//      one of
//          a b c d e f g h i j k l m n o p q r s t u v w x y z
//          A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
//
// IdentityEscape ::
//      SourceCharacter but not IdentifierPart
//      <ZWJ>
//      <ZWNJ>
//
// DecimalEscape ::
//      DecimalIntegerLiteral [lookahead ∉ DecimalDigit]
//      CharacterClassEscape :: one of
//      d D s S w W
//
// CharacterClass ::
//      [ [lookahead ∉ {^}] ClassRanges ]
//      [ ^ ClassRanges ]
//
// ClassRanges ::
//      [empty]
//      NonemptyClassRanges
//
// NonemptyClassRanges ::
//      ClassAtom
//      ClassAtom NonemptyClassRangesNoDash
//      ClassAtom - ClassAtom ClassRanges
//
// NonemptyClassRangesNoDash ::
//      ClassAtom
//      ClassAtomNoDash NonemptyClassRangesNoDash
//      ClassAtomNoDash - ClassAtom ClassRanges
//
// ClassAtom ::
//      -
//      ClassAtomNoDash
//
// ClassAtomNoDash ::
//      SourceCharacter but not one of \ or ] or -
//      \ ClassEscape
//
// ClassEscape ::
//      DecimalEscape
//      b
//      CharacterEscape
//      CharacterClassEscape



function parse(str) {
    function createAssertion(sub) {
        return {
            type: 'assertion',
            sub:  sub
        };
    }

    function createPatternCharacter(matches) {
        return {
            type: 'patternCharacter',
            data: matches[0]
        };
    }

    function createDisjunction(alternatives) {
        return {
            type: 'disjunction',
            alternatives: alternatives
        };
    }

    function createEmpty() {
        return {
            type: 'empty'
        };
    }

    function createSpecial(name) {
        return {
            type: 'special',
            name: name
        };
    }

    function createBackreference(matches) {
        return {
            type: 'backreference',
            data: matches[0]
        }
    }

    function createHexEscape(matches) {
        return {
            type: 'hexEscape',
            data: matches[1]
        };
    }

    function createUnicodeEscape(matches) {
        return {
            type: 'unicodeEscape',
            data: matches[1]
        };
    }

    function createGroup(behavior, disjunction) {
        return {
            type: 'group',
            behavior: behavior,
            disjunction: disjunction
        };
    }

    function createQuantifier(min, max) {
        return {
            type: 'quantifier',
            min: min,
            max: max,
            greedy: true
        };
    }

    function isEmpty(obj) {
        return obj.type === 'empty';
    }

    var state = {
        idx: 0
    };

    function incr(amount) {
        amount = (amount || 1);
        var res = str.substring(state.idx, state.idx + amount);
        state.idx += (amount || 1);
        return res;
    }

    function skip(value) {
        if (!match(value)) {
            throw expected('character: ' + value);
        }
    }

    function match(value) {
        var res = str[state.idx] === value;
        if (res) {
            incr();
        }
        return res;
    }

    function matchReg(regExp) {
        var subStr = str.substring(state.idx);
        var res = subStr.match(regExp);
        if (res) {
            incr(res[0].length);
        }
        return res;
    }

    function parseDisjunction() {
        // Disjunction ::
        //      Alternative
        //      Alternative | Disjunction
        var res = [];
        res.push(parseAlternative());

        while (match('|')) {
            res.push(parseAlternative());
        }

        return createDisjunction(res);
    }

    function parseAlternative() {   // DONE.
        var res = [];

        // Alternative ::
        //      [empty]
        //      Alternative Term
        while (term = parseTerm()) {
            if (isEmpty(term)) {
                // Only add Empty if there is nothing else in the result array.
                // Otherwise ignore it to save noice in the AST.
                if (res.length === 0) {
                    res.push(term);
                }
                break;
            }

            res.push(term);
        }

        return res;
    }

    function parseTerm() {  // DONE.
        // Term ::
        //      Assertion
        //      Atom
        //      Atom Quantifier

        var assertion = parseAssertion();

        if (assertion) {
            return assertion;
        }

        var atom = parseAtom();
        if (atom) {
            atom.quantifier = parseQuantifier();
            return atom;
        }

        return createEmpty();
    }

    function parseAssertion() { // DONE.
        // Assertion ::
        //      ^
        //      $
        //      \ b
        //      \ B
        //      ( ? = Disjunction )
        //      ( ? ! Disjunction )
        var res;
        if (match('^')) {
            return createAssertion('start');
        } else if (match('$')) {
            return createAssertion('end');
        } else if (res = matchReg(/^\\b/) || res = matchReg(/^\\B/)) {
            return createSpecial(res[0]);
        } else if (match('(?=')) {
            res = createGroup('onlyIf', parseDisjunction());
            skip(')');
            return res;
        } else if (match('(?!')) {
            res = createGroup('onlyIfNot', parseDisjunction());
            skip(')');
            return res;
        }
    }

    function parseQuantifier() {    // DONE.
        // Quantifier ::
        //      QuantifierPrefix
        //      QuantifierPrefix ?
        //
        // QuantifierPrefix ::
        //      *
        //      +
        //      ?
        //      { DecimalDigits }
        //      { DecimalDigits , }
        //      { DecimalDigits , DecimalDigits }

        var res;
        var quantifier;
        var from, to;

        if (match('*')) {
            quantifier = createQuantifier(0);
        }
        else if (match('+')) {
            quantifier = createQuantifier(1);
        }
        else if (match('?')) {
            quantifier = createQuantifier(0, 1);
        }
        else if (res = matchReg(/^\{([0-9]+)\}/)) {
            from = parseInt(res[1], 10);
            quantifier = createQuantifier(from, from);
        }
        else if (res = matchReg(/^\{([0-9]+),\}/)) {
            from = parseInt(res[1], 10);
            quantifier = createQuantifier(from);
        }
        else if (res = matchReg(/^\{([0-9]+),([0-9]+)\}/)) {
            from = parseInt(res[1], 10);
            to = parseInt(res[2], 10);
            quantifier = createQuantifier(from, to);
        }

        if (quantifier) {
            if (match('?')) {
                quantifier.greedy = false;
            }
        }

        return quantifier;
    }

    function parseAtom() {  // DONE.
        // Atom ::
        //      PatternCharacter
        //      .
        //      \ AtomEscape
        //      CharacterClass
        //      ( Disjunction )
        //      ( ? : Disjunction )

        var res;

        if (res = matchReg(/^[^^$\.*+?()[\]{}|]/)) {
            //      PatternCharacter
            return createPatternCharacter(res);
        }
        else if (match('.')) {
            //      .
            return createSpecial('any');
        }
        else if (match('\\')) {
            //      \ AtomEscape
            var res = parseAtomEscape();
            if (!res) {
                throw expected('atomEscape');
            }
            return res;
        }
        else if (res = parseCharacterClass()) {
            return res;
        }
        else if (match('(?:')) {
            res = parseDisjunction();
            if (!res) {
                throw expected('disjunction');
            }
            skip(')');
            return createGroup('ignore', res);
        }
        else if (match('(')) {
            res = parseDisjunction();
            if (!res) {
                throw expected('disjunction');
            }
            skip(')');
            return createGroup('normal', res);
        }
    }

    function parseAtomEscape() {    // DONE.
        // AtomEscape ::
        //      DecimalEscape
        //      CharacterEscape
        //      CharacterClassEscape

        var res;

        res = parseDecimalEscape();
        if (res) {
            return res;
        }

        res = parseCharacterEscape();
        if (res) {
            return res;
        }

        res = parseCharacterClassEscape();
        if (res) {
            return res;
        }

        return res;
    }


    function parseDecimalEscape() {   // DONE.
        // DecimalEscape ::
        //      DecimalIntegerLiteral [lookahead ∉ DecimalDigit]
        //      CharacterClassEscape :: one of
        //      d D s S w W

        var res;
        // 15.10.2.11
        if (match('0')) {
            return createSepcial('nul');
        } else if (res = matchReg(/^[0-9]+/) {
            return createBackreference(res);
        } else if (res = matchReg(/^[dDsSwW]/)) {
            return createSpecial(res[0]);
        }
         return false;
    }

    function parseCharacterEscape() {   // DONE.
        // CharacterEscape ::
        //      ControlEscape
        //      c ControlLetter
        //      HexEscapeSequence
        //      UnicodeEscapeSequence
        //      IdentityEscape

        var res;
        if (res = matchReg(/^[fnrtv]/)) {
        //      ControlEscape
            return createSpecial(res[0]);
        } else if (res = matchReg(/^c[a-zA-Z]/)) {
        //      c ControlLetter
            return createSpecial(res[0]);
        } else if (res = matchReg(/^x([0-9a-fA-F]{2})/)) {
        //      HexEscapeSequence
            return createHexEscape(res);
        } else  if (res = matchReg(/^u([0-9a-fA-F]{4})/)) {
        //      UnicodeEscapeSequence
            return createUnicodeEscape(res);
        } else {
        //      IdentityEscape
            return parseIdentityEscape();
        }
    }

    function parseIdentityEscape() {    // DONE.
        // IdentityEscape ::
        //      SourceCharacter but not IdentifierPart
        //      <ZWJ>
        //      <ZWNJ>

        var ZWJ = '\u200C';
        var ZWNJ = '\u200D';

        var res;
        state.save();
        res = parseIdentifierPart();
        if (!res) {
        //      SourceCharacter but not IdentifierPart
            return createIdentityEscape(incr());
        } else if (match(ZWJ)) {
        //      <ZWJ>
            return createIdentityEscape(ZWJ)
        } else if (match(ZWNJ)) {
        //      <ZWNJ>
            return createIdentityEscape(ZWNJ)
        }
    }

    function parseCharacterClass() {

        // CharacterClass ::
        //      [ [lookahead ∉ {^}] ClassRanges ]
        //      [ ^ ClassRanges ]
    }

    function parseIdentifierPart() {    // TODO.
        // TODO: Steal from esprima.
        return null;
    }



    function expected(str) {
        return new Error(str);
    }

    return parseDisjunction();
}


function testParse(str, expected) {
    if (JSON.stringify(parse(str)) !== expected) {
        console.error('Failure parsing string %s', str);
    } else {
        console.log('PASSED PARSE TEST');
    }
}

testParse('a', '{"type":"disjunction","alternatives":[[{"type":"patternCharacter","data":"a","quantifier":false}]]}');
testParse('a|bc', '{"type":"disjunction","alternatives":[[{"type":"patternCharacter","data":"a","quantifier":false}],[{"type":"patternCharacter","data":"b","quantifier":false},{"type":"patternCharacter","data":"c","quantifier":false}]]}');
