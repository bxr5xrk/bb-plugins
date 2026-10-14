export function sessionPreview(output: string | null): string | null {
  if (!output) return null;
  const text = output
    .replace(/::[a-z][\w-]*\{[^}]*\}/gi, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|~~)(.*?)\1/g, "$2")
    .replace(/(?<!\w)[*_]([^*_\n]+)[*_](?!\w)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  return characters.length ? characters.slice(0, 180).join("") + (characters.length > 180 ? "…" : "") : null;
}
