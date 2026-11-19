const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export function ruleParagraphs(rules) {
  return rules.split(/\r?\n/).map(line => line.trim()).filter(Boolean).flatMap(line => {
    // Bibliographic references remain on the original Item sheet.
    const content = line.replace(/(?:^|\s)Source:\s+.*$/i, '').trim();
    return content ? [content] : [];
  });
}

export function ruleSegments(rules) {
  return ruleParagraphs(rules).flatMap((text, paragraph) => {
    if (/^\|/.test(text)) return [{ paragraph, text }];
    return [...segmenter.segment(text)].flatMap(({ segment }) =>
      segment.trim() ? [{ paragraph, text: segment.trim() }] : []);
  });
}
