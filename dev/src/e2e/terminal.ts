// What the driven run reads from and writes to its pseudo-terminal: the
// screen's text without its escapes, and a command line for `script -c`.

export function plain(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escapes are control characters.
  return text.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

export function shellQuoted(argument: string): string {
  return `'${argument.replaceAll("'", "'\\''")}'`
}
