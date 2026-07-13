export function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);

  while (right !== 0) {
    [left, right] = [right, left % right];
  }

  return left;
}

export function reduceFraction(
  numerator: number,
  denominator: number,
): { numerator: number; denominator: number } {
  if (denominator === 0) {
    throw new RangeError("Denominator cannot be zero");
  }

  if (numerator === 0) {
    return { numerator: 0, denominator: 1 };
  }

  const divisor = gcd(numerator, denominator);
  const sign = denominator < 0 ? -1 : 1;

  return {
    numerator: (sign * numerator) / divisor,
    denominator: Math.abs(denominator) / divisor,
  };
}

export function combination(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }

  const smallerK = Math.min(k, n - k);
  let result = 1;

  for (let index = 1; index <= smallerK; index += 1) {
    result = (result * (n - smallerK + index)) / index;
  }

  return result;
}

export function formatNumber(value: number): string {
  return String(value);
}
