// Server errors are developer-facing; turn the known ones into something a
// guest can act on. Never JSON.
export function humanPourError(message?: string): string {
  if (!message) return 'James couldn’t start pouring. Try again.';
  const m = message.toLowerCase();
  if (m.includes('not enough left')) return 'A bottle ran dry - ask for a refill and try again.';
  if (m.includes('unknown bottle')) return 'One of the ingredients isn’t loaded any more. Pick another drink.';
  if (m.includes('fetch') || m.includes('network')) return 'Lost the connection to the bar. Try again in a moment.';
  if (m.includes('multiple of')) return 'This recipe doesn’t match the bottle pour sizes. Fix it in the cloud config.';
  return message.length < 80 ? message : 'James couldn’t start pouring. Try again.';
}
