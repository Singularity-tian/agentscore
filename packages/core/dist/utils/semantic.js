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
/**
 * Tokenize text into lowercase words, removing stop words and punctuation.
 */
export function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}
/**
 * Compute term frequency for a list of tokens.
 */
export function termFrequency(tokens) {
    const tf = new Map();
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
export function inverseDocFrequency(documents) {
    const idf = new Map();
    const n = documents.length;
    // Count documents containing each term
    const docCount = new Map();
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
export function tfidfVector(tokens, idf) {
    const tf = termFrequency(tokens);
    const vector = new Map();
    for (const [term, tfVal] of tf) {
        const idfVal = idf.get(term) || 1;
        vector.set(term, tfVal * idfVal);
    }
    return vector;
}
/**
 * Compute cosine similarity between two TF-IDF vectors.
 */
export function cosineSimilarity(a, b) {
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
    if (denominator === 0)
        return 0;
    return dotProduct / denominator;
}
/**
 * Compute a combined match score between an expected instruction
 * and an actual tool call. Combines tool-verb matching, entity overlap,
 * and TF-IDF cosine similarity.
 *
 * Returns a score between 0 and 1.
 */
export function matchScore(expectedText, toolName, toolParams) {
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
//# sourceMappingURL=semantic.js.map