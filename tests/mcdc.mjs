import { parse } from 'acorn';

// Instrument test copies only; the website never loads this module.
export function instrument(source, filename, decisions) {
  const edits = [];
  const ast = parse(source, { ecmaVersion: 'latest', locations: true });
  function decision(node) {
    const conditions = [];
    function expression(n) {
      if (n.type === 'LogicalExpression' && ['&&', '||'].includes(n.operator)) {
        return `(${expression(n.left)} ${n.operator} ${expression(n.right)})`;
      }
      if (n.type === 'UnaryExpression' && n.operator === '!') return `!(${expression(n.argument)})`;
      const index = conditions.push(source.slice(n.start, n.end)) - 1;
      return `observe(${index}, (${source.slice(n.start, n.end)}))`;
    }
    const generated = expression(node);
    const id = decisions.length;
    decisions.push({ filename, line: node.loc.start.line, expression: source.slice(node.start, node.end), conditions, vectors: [] });
    edits.push({ start: node.start, end: node.end, value: `__mcdc(${id}, observe => (${generated}))` });
  }
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ConditionalExpression'].includes(node.type) && node.test) {
      decision(node.test);
      // Nested decisions inside an atomic operand need separate instrumentation.
      function check(n) {
        if (!n || typeof n !== 'object') return;
        if (['ConditionalExpression', 'IfStatement'].includes(n.type) || n.type === 'AwaitExpression' || n.type === 'YieldExpression') {
          throw new Error('Unsupported nested/async decision; extend instrumentation before claiming coverage');
        }
        for (const value of Object.values(n)) if (Array.isArray(value)) value.forEach(check); else if (value && typeof value === 'object') check(value);
      }
      check(node.test);
    }
    if (node.type === 'SwitchStatement') throw new Error('Switch coverage requires explicit support');
    for (const [key, value] of Object.entries(node)) {
      if (key === 'test') continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return source;
}

export function recorder(decisions) {
  return (id, evaluate) => {
    const values = Array(decisions[id].conditions.length).fill(null);
    const result = evaluate((index, value) => { values[index] = Boolean(value); return value; });
    const vector = { conditions: values, result: Boolean(result) };
    if (!decisions[id].vectors.some(v => JSON.stringify(v) === JSON.stringify(vector))) decisions[id].vectors.push(vector);
    return result;
  };
}

export function report(decisions) {
  return decisions.map(decision => ({ ...decision, pairs: decision.conditions.map((_, index) => {
    for (let a = 0; a < decision.vectors.length; a++) {
      for (let b = a + 1; b < decision.vectors.length; b++) {
        const x = decision.vectors[a], y = decision.vectors[b];
        if (x.conditions[index] === null || y.conditions[index] === null || x.conditions[index] === y.conditions[index] || x.result === y.result) continue;
        // A skipped short-circuit operand is masked, not assumed false.
        if (x.conditions.every((value, i) => i === index || value === null || y.conditions[i] === null || value === y.conditions[i])) return [a, b];
      }
    }
    return null;
  }) }));
}
