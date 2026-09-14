type ClassValue = string | undefined | null | false | Record<string, boolean | undefined>;

// Utility function for combining class names and conditional class maps.
export function cn(...inputs: ClassValue[]) {
  return inputs
    .filter(Boolean)
    .map((input) => {
      if (typeof input === 'string') return input;
      if (typeof input === 'object') {
        return Object.entries(input)
          .filter(([, enabled]) => enabled)
          .map(([className]) => className)
          .join(' ');
      }
      return '';
    })
    .filter(Boolean)
    .join(' ');
}
