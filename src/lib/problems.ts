export type Difficulty = "Easy" | "Medium";

export interface SampleTest {
  args: unknown[];
  expected: unknown;
}

export interface Problem {
  id: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  functionName: string;
  starterCode: string;
  tests: SampleTest[];
  /** How the runner compares output: exact equality, or after sorting a list result. */
  compare: "exact" | "sorted";
  /** Reference hints, from gentle nudge to concept hint. The interviewer never goes beyond level 3. */
  hints: [string, string, string];
  /** Boundary conditions an interviewer would probe, with words that show the candidate considered them. */
  edgeCases: { label: string; question: string; keywords: string[] }[];
  optimal: { time: string; space: string; timeKeywords: string[] };
  /** Terms that name the key technique. The interviewer must not say them before the candidate does. */
  giveaways: string[];
}

export const PROBLEMS: Problem[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    topic: "Hashing",
    difficulty: "Easy",
    prompt:
      "Given a list of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`, in ascending order.\n\nYou may assume each input has exactly one solution, and you may not use the same element twice.",
    examples: [
      { input: "nums = [2, 7, 11, 15], target = 9", output: "[0, 1]", explanation: "nums[0] + nums[1] == 9" },
      { input: "nums = [3, 2, 4], target = 6", output: "[1, 2]" },
    ],
    constraints: ["2 <= len(nums) <= 10^4", "-10^9 <= nums[i], target <= 10^9", "Exactly one valid answer exists."],
    functionName: "two_sum",
    starterCode: "def two_sum(nums: list[int], target: int) -> list[int]:\n    # Talk through your approach before you start coding.\n    pass\n",
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
      { args: [[3, 3], 6], expected: [0, 1] },
      { args: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
    ],
    compare: "sorted",
    hints: [
      "Think about what you need to know about each number as you scan the list. Do you really need to re-check every pair?",
      "For any number x, the partner you need is fully determined. How could you check quickly whether you've already seen it?",
      "Storing each value you've seen along with its index lets you look up the needed complement in constant average time, in a single pass.",
    ],
    edgeCases: [
      { label: "Duplicate values", question: "What happens with an input like [3, 3] and target 6?", keywords: ["duplicate", "same value", "[3, 3]", "3, 3", "twice"] },
      { label: "Negative numbers", question: "Does your approach still hold if the numbers or the target are negative?", keywords: ["negative"] },
      { label: "Reusing an element", question: "How do you make sure you never pair an element with itself?", keywords: ["same element", "itself", "same index", "use it twice"] },
    ],
    optimal: { time: "O(n)", space: "O(n)", timeKeywords: ["o(n)", "linear", "one pass", "single pass"] },
    giveaways: ["hash map", "hashmap", "dictionary", "complement"],
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    topic: "Stack",
    difficulty: "Easy",
    prompt:
      "Given a string `s` containing only the characters `()[]{}`, return `True` if the brackets are valid.\n\nA string is valid when every opening bracket is closed by the same type of bracket, and brackets close in the correct order.",
    examples: [
      { input: 's = "()[]{}"', output: "True" },
      { input: 's = "([)]"', output: "False", explanation: "The brackets close in the wrong order." },
    ],
    constraints: ["0 <= len(s) <= 10^4", "s consists only of the characters ()[]{}"],
    functionName: "is_valid",
    starterCode: "def is_valid(s: str) -> bool:\n    # Talk through your approach before you start coding.\n    pass\n",
    tests: [
      { args: ["()"], expected: true },
      { args: ["()[]{}"], expected: true },
      { args: ["(]"], expected: false },
      { args: ["([)]"], expected: false },
      { args: ["{[]}"], expected: true },
      { args: [""], expected: true },
      { args: ["(("], expected: false },
    ],
    compare: "exact",
    hints: [
      "When you see a closing bracket, which earlier bracket does it need to match?",
      "The most recent unmatched opening bracket is always the one that must close next. What structure keeps track of 'most recent'?",
      "A last-in, first-out stack of opening brackets works: push openers, and on each closer check and pop the top. The string is valid only if the stack ends empty.",
    ],
    edgeCases: [
      { label: "Empty string", question: "What should your function return for an empty string?", keywords: ["empty", "\"\"", "no characters"] },
      { label: "Only openers left", question: "What about an input like \"((\" where nothing ever closes?", keywords: ["left over", "leftover", "remaining", "unclosed", "ends empty", "stack is empty", "not empty"] },
      { label: "Closer first", question: "What happens if the very first character is a closing bracket?", keywords: ["closing first", "starts with a clos", "nothing to match", "empty stack", "pop from an empty"] },
    ],
    optimal: { time: "O(n)", space: "O(n)", timeKeywords: ["o(n)", "linear", "one pass", "single pass"] },
    giveaways: ["stack", "last-in", "lifo", "push"],
  },
  {
    id: "merge-intervals",
    title: "Merge Intervals",
    topic: "Sorting",
    difficulty: "Medium",
    prompt:
      "Given a list of intervals where `intervals[i] = [start, end]`, merge all overlapping intervals and return the non-overlapping intervals that cover all the input, sorted by start.\n\nIntervals that touch, like [1, 4] and [4, 5], count as overlapping.",
    examples: [
      { input: "intervals = [[1, 3], [2, 6], [8, 10], [15, 18]]", output: "[[1, 6], [8, 10], [15, 18]]" },
      { input: "intervals = [[1, 4], [4, 5]]", output: "[[1, 5]]" },
    ],
    constraints: ["0 <= len(intervals) <= 10^4", "0 <= start <= end <= 10^4", "The input is not necessarily sorted."],
    functionName: "merge",
    starterCode: "def merge(intervals: list[list[int]]) -> list[list[int]]:\n    # Talk through your approach before you start coding.\n    pass\n",
    tests: [
      { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
      { args: [[[1, 4], [4, 5]]], expected: [[1, 5]] },
      { args: [[[1, 4], [0, 4]]], expected: [[0, 4]] },
      { args: [[]], expected: [] },
      { args: [[[1, 4], [2, 3]]], expected: [[1, 4]] },
    ],
    compare: "exact",
    hints: [
      "Would the problem get easier if the intervals arrived in a particular order?",
      "If the intervals are ordered by start, each new interval can only overlap the last one you kept. What do you compare?",
      "Sort by start, then sweep: if the next start is at or before the current end, extend the end to the max of both ends; otherwise start a new interval.",
    ],
    edgeCases: [
      { label: "Empty input", question: "What does your function return when there are no intervals?", keywords: ["empty", "no intervals", "[]"] },
      { label: "Touching intervals", question: "How do you treat intervals that only touch, like [1, 4] and [4, 5]?", keywords: ["touch", "equal", "<=", "same endpoint", "inclusive"] },
      { label: "Fully contained", question: "What if one interval sits completely inside another, like [1, 4] and [2, 3]?", keywords: ["contain", "inside", "nested", "max(", "maximum of", "larger end"] },
      { label: "Unsorted input", question: "Your examples are sorted. What if the input isn't?", keywords: ["unsorted", "not sorted", "sort", "order"] },
    ],
    optimal: { time: "O(n log n)", space: "O(n)", timeKeywords: ["n log n", "nlogn", "n log(n)", "o(n log n)"] },
    giveaways: ["sort by start", "sort them by", "sorted by start"],
  },
  {
    id: "longest-substring",
    title: "Longest Substring Without Repeats",
    topic: "Sliding window",
    difficulty: "Medium",
    prompt: "Given a string `s`, return the length of the longest substring that contains no repeated characters.",
    examples: [
      { input: 's = "abcabcbb"', output: "3", explanation: 'The answer is "abc".' },
      { input: 's = "pwwkew"', output: "3", explanation: '"wke" — note that "pwke" is a subsequence, not a substring.' },
    ],
    constraints: ["0 <= len(s) <= 5 * 10^4", "s may contain letters, digits, symbols, and spaces."],
    functionName: "length_of_longest_substring",
    starterCode: "def length_of_longest_substring(s: str) -> int:\n    # Talk through your approach before you start coding.\n    pass\n",
    tests: [
      { args: ["abcabcbb"], expected: 3 },
      { args: ["bbbbb"], expected: 1 },
      { args: ["pwwkew"], expected: 3 },
      { args: [""], expected: 0 },
      { args: ["dvdf"], expected: 3 },
      { args: [" "], expected: 1 },
    ],
    compare: "exact",
    hints: [
      "Checking every substring works but repeats a lot of work. When you extend a substring and hit a repeat, what do you actually need to throw away?",
      "Keep a range that is always repeat-free. When a repeat appears, move only the start of that range forward. What do you need to remember to do that quickly?",
      "Use a sliding window with two indices and a record of each character's last position; when a character repeats inside the window, jump the left edge past its previous position.",
    ],
    edgeCases: [
      { label: "Empty string", question: "What does your function return for an empty string?", keywords: ["empty", "\"\"", "zero length", "return 0"] },
      { label: "All the same character", question: "How does your approach behave on something like \"bbbbb\"?", keywords: ["bbbb", "same character", "all the same", "repeated character"] },
      { label: "Repeat outside the window", question: "Walk me through \"abba\". What happens to your left edge at the final 'a'?", keywords: ["abba", "backward", "behind", "outside the window", "max("] },
    ],
    optimal: { time: "O(n)", space: "O(min(n, k))", timeKeywords: ["o(n)", "linear", "one pass", "single pass"] },
    giveaways: ["sliding window", "two pointers", "last seen index", "last position"],
  },
  {
    id: "product-except-self",
    title: "Product of Array Except Self",
    topic: "Prefix products",
    difficulty: "Medium",
    prompt:
      "Given a list of integers `nums`, return a list `answer` where `answer[i]` is the product of every element of `nums` except `nums[i]`.\n\nSolve it in O(n) time **without using division**.",
    examples: [
      { input: "nums = [1, 2, 3, 4]", output: "[24, 12, 8, 6]" },
      { input: "nums = [-1, 1, 0, -3, 3]", output: "[0, 0, 9, 0, 0]" },
    ],
    constraints: ["2 <= len(nums) <= 10^5", "-30 <= nums[i] <= 30", "Do not use the division operator."],
    functionName: "product_except_self",
    starterCode: "def product_except_self(nums: list[int]) -> list[int]:\n    # Talk through your approach before you start coding.\n    pass\n",
    tests: [
      { args: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] },
      { args: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] },
      { args: [[2, 3]], expected: [3, 2] },
      { args: [[0, 0]], expected: [0, 0] },
    ],
    compare: "exact",
    hints: [
      "For a single index i, can you split 'everything except i' into two groups you could compute separately?",
      "Everything except i is everything to its left times everything to its right. Can you compute those for all i without nested loops?",
      "Build running products: one pass left-to-right for the product of everything before i, and one pass right-to-left for everything after i, then multiply them.",
    ],
    edgeCases: [
      { label: "A zero in the input", question: "What happens to your answer when the input contains a zero?", keywords: ["zero", " 0 "] },
      { label: "Two or more zeros", question: "And if there are two zeros, like [0, 0]?", keywords: ["two zeros", "multiple zeros", "more than one zero", "[0, 0]"] },
      { label: "Negative numbers", question: "Do negative values change anything in your approach?", keywords: ["negative"] },
    ],
    optimal: { time: "O(n)", space: "O(1) extra", timeKeywords: ["o(n)", "linear", "two passes", "two pass"] },
    giveaways: ["prefix product", "suffix product", "prefix and suffix", "left and right products"],
  },
];

export function getProblem(id: string): Problem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
