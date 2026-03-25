/**
 * Tokenize text into lowercase words, removing stop words and punctuation.
 */
export declare function tokenize(text: string): string[];
/**
 * Compute term frequency for a list of tokens.
 */
export declare function termFrequency(tokens: string[]): Map<string, number>;
/**
 * Compute inverse document frequency from a collection of documents.
 */
export declare function inverseDocFrequency(documents: string[][]): Map<string, number>;
/**
 * Compute TF-IDF vector for a document given pre-computed IDF values.
 */
export declare function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number>;
/**
 * Compute cosine similarity between two TF-IDF vectors.
 */
export declare function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number;
/**
 * Compute a combined match score between an expected instruction
 * and an actual tool call. Combines tool-verb matching, entity overlap,
 * and TF-IDF cosine similarity.
 *
 * Returns a score between 0 and 1.
 */
export declare function matchScore(expectedText: string, toolName: string, toolParams: Record<string, unknown>): number;
/**
 * Match an instruction against the agent's text report (no tool-verb matching).
 * Uses entity overlap + TF-IDF cosine similarity only.
 *
 * 将指令与 agent 的文本回复进行匹配（不使用 tool-verb 匹配）。
 * 仅使用实体重叠 + TF-IDF 余弦相似度。
 */
export declare function matchScoreAgainstReport(instructionText: string, report: string): number;
//# sourceMappingURL=semantic.d.ts.map