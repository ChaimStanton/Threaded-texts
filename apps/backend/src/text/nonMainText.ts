const nonMainTitlePatterns = [
  /^preface\b/i,
  /^publisher'?s preface\b/i,
  /^author'?s preface\b/i,
  /^introduction\b/i,
  /^acknowledg/i,
  /^dedication\b/i,
  /^contents\b/i,
  /^appendix\b/i,
  /^notes?\b/i,
  /^bibliography\b/i,
  /^suggestions? for further reading\b/i,
  /^further reading\b/i,
  /^glossary\b/i,
  /^index\b/i,
  /^a quick quiz\b/i,
  /^quick quiz\b/i,
  /^top ten\b/i,
  /^educational companion\b/i,
  /^hanukka challenge\b/i,
  /^fun fact\b/i
];

export function isNonMainTextSection(input: { title?: string | null; ref?: string | null }) {
  const title = input.title?.trim();
  const ref = input.ref?.trim();
  const value = title || ref || "";

  if (!value || /^chapter\s+\d+\b/i.test(value)) {
    return false;
  }

  return nonMainTitlePatterns.some((pattern) => pattern.test(value));
}
