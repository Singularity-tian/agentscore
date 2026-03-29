import { toolVerbMatch } from './tool-verbs.js';
import { extractEntities, entityOverlap } from './entities.js';

/** Stop words to exclude from TF-IDF computation */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'and',
  'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
  'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'because', 'if', 'when', 'while', 'where', 'how', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its',
  'my', 'your', 'his', 'her', 'our', 'their', 'me', 'him', 'us', 'them',
]);

const CJK_RANGE = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7a3]/;

/**
 * Tokenize text into tokens for TF-IDF computation.
 * Supports both Latin (word-based) and CJK (bigram-based) text.
 * 将文本分词用于 TF-IDF 计算。支持拉丁文（基于词）和 CJK（基于双元组）文本。
 */
export function tokenize(text: string): string[] {
  if (CJK_RANGE.test(text)) {
    return tokenizeCJK(text);
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function tokenizeCJK(text: string): string[] {
  const tokens: string[] = [];
  // Extract Latin words from mixed text
  // 从混合文本中提取拉丁词汇
  const latinWords = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  tokens.push(...latinWords);
  // Extract CJK character bigrams
  // 提取 CJK 字符双元组
  const cjkChars = text.replace(/[^\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7a3]/g, '');
  for (let i = 0; i < cjkChars.length - 1; i++) {
    tokens.push(cjkChars[i] + cjkChars[i + 1]);
  }
  for (const char of cjkChars) {
    tokens.push(char);
  }
  return tokens;
}

/**
 * Compute term frequency for a list of tokens.
 */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by document length
  for (const [term, count] of tf) {
    tf.set(term, count / tokens.length);
  }
  return tf;
}

/**
 * Compute inverse document frequency from a collection of documents.
 */
export function inverseDocFrequency(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const n = documents.length;

  // Count documents containing each term
  const docCount = new Map<string, number>();
  for (const doc of documents) {
    const unique = new Set(doc);
    for (const term of unique) {
      docCount.set(term, (docCount.get(term) || 0) + 1);
    }
  }

  for (const [term, count] of docCount) {
    idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  }

  return idf;
}

/**
 * Compute TF-IDF vector for a document given pre-computed IDF values.
 */
export function tfidfVector(
  tokens: string[],
  idf: Map<string, number>,
): Map<string, number> {
  const tf = termFrequency(tokens);
  const vector = new Map<string, number>();
  for (const [term, tfVal] of tf) {
    const idfVal = idf.get(term) || 1;
    vector.set(term, tfVal * idfVal);
  }
  return vector;
}

/**
 * Compute cosine similarity between two TF-IDF vectors.
 */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, val] of a) {
    normA += val * val;
    const bVal = b.get(term);
    if (bVal !== undefined) {
      dotProduct += val * bVal;
    }
  }

  for (const [, val] of b) {
    normB += val * val;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Compute a combined match score between an expected instruction
 * and an actual tool call. Combines tool-verb matching, entity overlap,
 * and TF-IDF cosine similarity.
 *
 * Returns a score between 0 and 1.
 */
export function matchScore(
  expectedText: string,
  toolName: string,
  toolParams: Record<string, unknown>,
): number {
  // 1. Tool-verb match (weight: 0.4)
  const verbScore = toolVerbMatch(toolName, expectedText);

  // 2. Entity overlap (weight: 0.3)
  const expectedEntities = extractEntities(expectedText);
  const actionText = `${toolName} ${JSON.stringify(toolParams)}`;
  const actionEntities = extractEntities(actionText);
  const entOverlap = entityOverlap(expectedEntities, actionEntities);

  // 3. TF-IDF cosine similarity (weight: 0.3)
  const expectedTokens = tokenize(expectedText);
  const actionTokens = tokenize(actionText);

  const docs = [expectedTokens, actionTokens];
  const idf = inverseDocFrequency(docs);
  const vecA = tfidfVector(expectedTokens, idf);
  const vecB = tfidfVector(actionTokens, idf);
  const cosine = cosineSimilarity(vecA, vecB);

  // Weighted combination
  const combined = verbScore * 0.4 + entOverlap * 0.3 + cosine * 0.3;

  return Math.min(combined, 1);
}

/**
 * Match an instruction against the agent's text report (no tool-verb matching).
 * Uses entity overlap + TF-IDF cosine similarity only.
 *
 * 将指令与 agent 的文本回复进行匹配（不使用 tool-verb 匹配）。
 * 仅使用实体重叠 + TF-IDF 余弦相似度。
 */
export function matchScoreAgainstReport(
  instructionText: string,
  report: string,
): number {
  if (!report.trim()) return 0;

  // Entity overlap (weight: 0.5)
  // 实体重叠（权重 0.5）
  const instructionEntities = extractEntities(instructionText);
  const reportEntities = extractEntities(report);
  const entOverlap = entityOverlap(instructionEntities, reportEntities);

  // TF-IDF cosine similarity (weight: 0.5)
  // TF-IDF 余弦相似度（权重 0.5）
  const instructionTokens = tokenize(instructionText);
  const reportTokens = tokenize(report);
  const docs = [instructionTokens, reportTokens];
  const idf = inverseDocFrequency(docs);
  const vecA = tfidfVector(instructionTokens, idf);
  const vecB = tfidfVector(reportTokens, idf);
  const cosine = cosineSimilarity(vecA, vecB);

  return Math.min(entOverlap * 0.5 + cosine * 0.5, 1);
}
