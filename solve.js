// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's reading of {text, header} —
// {columns, rows, errors} under the same broken-row policy — but reads the text with slice-based field scans
// instead of building every field one character at a time.
//
// The policy, matched case for case:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled ("" inside it is one quote, and
//     each CRLF or lone CR inside it is read as LF); what follows its closing quote, up to the next comma or line
//     break, is appended as it stands (quote_junk, when the field ends); a quote that never closes is a literal
//     character and the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records after it (every record
//     when header is false), each padded with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met: line the 1-based line its record starts on (every LF,
//     CRLF and lone CR inside quotes counted), row its record's index in rows, null for the header.
//
// How it is faster: fields are taken as slices of the input between special characters (, " LF CR), found by a
// tight scan; a field is assembled from parts only when it actually holds a special case (a doubled quote, a CR
// inside quotes, a dropped stray CR, junk after a closing quote). Nothing is kept from one call to the next.

const COMMA_END = 0;
const BREAK_END = 1;
const EOF_END = 2;

/** csv-reader 1.0.0's answer for one case's input, computed faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // Scratch shared by the field readers below (one record at a time, so no reentrancy is possible).
  let recordLine = 1;
  let recordRow = null;
  let fValue = ''; // the field just read
  let fEnded = EOF_END; // how it ended

  // Reads unquoted characters onto a field whose first segment starts at `segStart`, with any already-built
  // leading parts in `parts` (null when the field is one plain segment). Sets fValue/fEnded and advances
  // pos/line. `added` counts the characters this read keeps (the quote_junk test); it is returned.
  function readUnquoted(parts, segStart) {
    let added = 0;
    let i = segStart;
    for (;;) {
      const segFrom = i;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i += 1;
      }
      added += i - segFrom;
      if (i >= n) {
        fValue = parts === null ? text.slice(segStart, i) : (parts.push(text.slice(segStart, i)), parts.join(''));
        fEnded = EOF_END;
        pos = i;
        return added;
      }
      const c = text.charCodeAt(i);
      if (c === 44) {
        fValue = parts === null ? text.slice(segStart, i) : (parts.push(text.slice(segStart, i)), parts.join(''));
        fEnded = COMMA_END;
        pos = i + 1;
        return added;
      }
      if (c === 10) {
        fValue = parts === null ? text.slice(segStart, i) : (parts.push(text.slice(segStart, i)), parts.join(''));
        fEnded = BREAK_END;
        pos = i + 1;
        line += 1;
        return added;
      }
      if (text.charCodeAt(i + 1) === 10) {
        // CR LF: the record's line break.
        fValue = parts === null ? text.slice(segStart, i) : (parts.push(text.slice(segStart, i)), parts.join(''));
        fEnded = BREAK_END;
        pos = i + 2;
        line += 1;
        return added;
      }
      // A lone CR outside quotes is dropped (stray_cr); the field goes on after it.
      if (parts === null) parts = [];
      if (i > segStart) parts.push(text.slice(segStart, i));
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      i += 1;
      segStart = i;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue/fEnded and advances pos/line.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let i = open + 1;
    let segStart = i;
    let parts = null;
    let qline = line; // the line count inside the quotes, committed only when the quote closes
    let closed = false;
    for (;;) {
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 34 || c === 13 || c === 10) break;
        i += 1;
      }
      if (i >= n) break;
      const c = text.charCodeAt(i);
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          // A doubled quote: one literal quote in the value.
          if (parts === null) parts = [];
          if (i > segStart) parts.push(text.slice(segStart, i));
          parts.push('"');
          i += 2;
          segStart = i;
          continue;
        }
        // The closing quote.
        fValue = parts === null ? text.slice(segStart, i) : (parts.push(text.slice(segStart, i)), parts.join(''));
        i += 1;
        closed = true;
        break;
      }
      if (c === 13) {
        // CRLF and a lone CR inside quotes are each read as one LF.
        if (parts === null) parts = [];
        if (i > segStart) parts.push(text.slice(segStart, i));
        parts.push('\n');
        qline += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
        segStart = i;
        continue;
      }
      // An LF inside quotes stays in the value as it stands; only the line count moves.
      qline += 1;
      i += 1;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      line = openLine;
      readUnquoted(['"'], open + 1);
      return;
    }
    line = qline;
    if (i >= n) {
      fEnded = EOF_END;
      pos = i;
      return;
    }
    const c = text.charCodeAt(i);
    if (c === 44) {
      fEnded = COMMA_END;
      pos = i + 1;
      return;
    }
    if (c === 10) {
      fEnded = BREAK_END;
      pos = i + 1;
      line += 1;
      return;
    }
    if (c === 13 && text.charCodeAt(i + 1) === 10) {
      fEnded = BREAK_END;
      pos = i + 2;
      line += 1;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    pos = i;
    const added = readUnquoted([fValue], i);
    if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted(null, pos);
      fields.push(fValue);
    } while (fEnded === COMMA_END);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
