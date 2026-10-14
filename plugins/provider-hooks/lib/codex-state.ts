const enabledLinePattern = /^\s*enabled\s*=/;
const disabledLinePattern = /^\s*enabled\s*=\s*false\b/;

const toSnakeCase = (event: string) =>
  event.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

export const getCodexHookKey = (
  hooksPath: string,
  event: string,
  groupIndex: number,
  hookIndex: number,
) => `${hooksPath}:${toSnakeCase(event)}:${groupIndex}:${hookIndex}`;

const getStateHeader = (key: string) => `[hooks.state.${JSON.stringify(key)}]`;

const getTableRange = (lines: string[], header: string) => {
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return null;
  }
  const nextTable = lines.findIndex(
    (line, index) => index > start && line.trimStart().startsWith("["),
  );
  return { start, end: nextTable === -1 ? lines.length : nextTable };
};

export const isCodexHookEnabled = (toml: string, key: string) => {
  const lines = toml.split("\n");
  const range = getTableRange(lines, getStateHeader(key));
  if (!range) {
    return true;
  }
  const body = lines.slice(range.start + 1, range.end);
  return !body.some((line) => disabledLinePattern.test(line));
};

export const setCodexHookEnabled = (toml: string, key: string, enabled: boolean) => {
  const header = getStateHeader(key);
  const lines = toml.split("\n");
  const range = getTableRange(lines, header);
  if (!range) {
    if (enabled) {
      return toml;
    }
    const separator = toml === "" || toml.endsWith("\n") ? "" : "\n";
    return `${toml}${separator}\n${header}\nenabled = false\n`;
  }
  const enabledIndex = lines.findIndex(
    (line, index) => index > range.start && index < range.end && enabledLinePattern.test(line),
  );
  if (!enabled && enabledIndex === -1) {
    lines.splice(range.start + 1, 0, "enabled = false");
    return lines.join("\n");
  }
  if (!enabled) {
    lines[enabledIndex] = "enabled = false";
    return lines.join("\n");
  }
  if (enabledIndex === -1) {
    return toml;
  }
  lines.splice(enabledIndex, 1);
  const body = lines.slice(range.start + 1, range.end - 1);
  if (body.some((line) => line.trim() !== "")) {
    return lines.join("\n");
  }
  const removeFrom = range.start > 0 && lines[range.start - 1].trim() === "" ? range.start - 1 : range.start;
  lines.splice(removeFrom, range.start - removeFrom + 1);
  return lines.join("\n");
};
