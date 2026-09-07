// Why: `muse exec …` runs one prompt headless and exits, while bare `muse`
// (and `muse resume`) hosts the interactive TUI Orca panes run.
export function isMusecodeHeadlessOneShotCommand(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    // Why: `--` ends option parsing, so a prompt that reads like `exec` is still a prompt.
    if (tokens[index] === '--') {
      return false
    }
    if (tokens[index] === 'exec') {
      return true
    }
  }
  return false
}
