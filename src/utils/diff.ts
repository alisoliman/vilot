export interface DiffLine {
	type: 'unchanged' | 'added' | 'removed';
	text: string;
}

/** Fast fallback diff for large files — compares matching prefix/suffix and marks the rest as changed. */
function simpleDiff(oldLines: string[], newLines: string[]): DiffLine[] {
	const result: DiffLine[] = [];
	let prefixLen = 0;
	const minLen = Math.min(oldLines.length, newLines.length);
	while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
		result.push({ type: 'unchanged', text: oldLines[prefixLen]! });
		prefixLen++;
	}
	let suffixLen = 0;
	while (
		suffixLen < minLen - prefixLen
		&& oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
	) {
		suffixLen++;
	}
	for (let i = prefixLen; i < oldLines.length - suffixLen; i++) {
		result.push({ type: 'removed', text: oldLines[i]! });
	}
	for (let i = prefixLen; i < newLines.length - suffixLen; i++) {
		result.push({ type: 'added', text: newLines[i]! });
	}
	for (let i = oldLines.length - suffixLen; i < oldLines.length; i++) {
		result.push({ type: 'unchanged', text: oldLines[i]! });
	}
	return result;
}

/** LCS-based line diff with fallback for large files. */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
	const oldLines = oldText.split('\n');
	const newLines = newText.split('\n');
	const m = oldLines.length;
	const n = newLines.length;

	const MAX_CELLS = 2_000_000;
	if (m * n > MAX_CELLS) {
		return simpleDiff(oldLines, newLines);
	}

	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				dp[i]![j] = dp[i - 1]![j - 1]! + 1;
			} else {
				dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
			}
		}
	}

	const stack: DiffLine[] = [];
	let i = m;
	let j = n;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			stack.push({ type: 'unchanged', text: oldLines[i - 1]! });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
			stack.push({ type: 'added', text: newLines[j - 1]! });
			j--;
		} else {
			stack.push({ type: 'removed', text: oldLines[i - 1]! });
			i--;
		}
	}

	const result: DiffLine[] = [];
	while (stack.length > 0) {
		result.push(stack.pop()!);
	}
	return result;
}
