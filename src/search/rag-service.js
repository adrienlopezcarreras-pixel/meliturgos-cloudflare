/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Semantic search over user conversations and memories using embeddings.
 * Compatible with Knowledge Graph (GEN2-11) and Archive System (GEN2-08).
 *
 * @module rag-service
 */

/**
 * RAGService - Semantic search over user data
 */
export class RAGService {
  /**
   * Generate embeddings for text using Cloudflare Workers AI
   */
  static async generateEmbedding(text) {
    if (!text || text.trim().length === 0) {
      return new Float32Array(768).fill(0);
    }

    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + 
        (CLOUDFLARE_ACCOUNT_ID || 'c0f3f8e0d9e8a4b6') + 
        '/@cf/baai/bge-base-en-v1.5/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (CLOUDFLARE_API_TOKEN || ''),
        },
        body: JSON.stringify({ text: text.substring(0, 512) }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.result || !data.result.data || !data.result.data[0]) {
        throw new Error('Failed to generate embedding: ' + (data.errors?.[0]?.message || 'Unknown error'));
      }

      return data.result.data[0].embedding;
    } catch (error) {
      console.warn('Embedding generation failed, using zero vector:', error.message);
      return new Float32Array(768).fill(0);
    }
  }

  /**
   * Search conversations or memories by semantic similarity
   */
  static async search(
    db,
    userId,
    query,
    {
      sources = ['archive_messages', 'conversations', 'memories'],
      limit = 10,
      minSimilarity = 0.3,
    } = {}
  ) {
    if (!query || query.trim().length === 0) {
      return { results: [], total: 0 };
    }

    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = [];

    // Search Archive Messages
    if (sources.includes('archive_messages')) {
      results.push(...await this.searchArchiveMessages(db, userId, query, queryEmbedding, minSimilarity));
    }

    // Search Conversations
    if (sources.includes('conversations')) {
      results.push(...await this.searchConversations(db, userId, query, queryEmbedding, minSimilarity));
    }

    // Search Memories
    if (sources.includes('memories')) {
      results.push(...await this.searchMemories(db, userId, query, queryEmbedding, minSimilarity));
    }

    // Sort by similarity (higher first)
    results.sort((a, b) => b.similarity - a.similarity);

    // Apply limit
    const limitedResults = results.slice(0, limit);

    return {
      results: limitedResults,
      total: limitedResults.length,
      queryEmbedding: Array.from(queryEmbedding),
    };
  }

  /**
   * Search archive messages by semantic similarity
   */
  static async searchArchiveMessages(db, userId, query, queryEmbedding, minSimilarity) {
    const results = [];

    try {
      const archiveMessages = await db.prepare(`
        SELECT 
          id,
          conversation_id,
          role,
          content,
          created_at,
          metadata
        FROM archive_messages
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1000
      `).bind(userId).all();

      for (const message of archiveMessages.results) {
        if (!message.content || typeof message.content !== 'string') {
          continue;
        }

        const similarity = this.cosineSimilarity(queryEmbedding, message.embedding);
        
        if (similarity >= minSimilarity) {
          results.push({
            type: 'archive_message',
            id: message.id,
            conversationId: message.conversation_id,
            role: message.role,
            content: message.content.substring(0, 500) + (message.content.length > 500 ? '...' : ''),
            timestamp: new Date(message.created_at * 1000),
            similarity: similarity,
            source: 'archive_messages',
          });
        }
      }
    } catch (error) {
      return [];
    }

    return results;
  }

  /**
   * Search conversations by semantic similarity
   */
  static async searchConversations(db, userId, query, queryEmbedding, minSimilarity) {
    const results = [];

    try {
      const conversations = await db.prepare(`
        SELECT 
          id,
          title,
          created_at,
          updated_at,
          message_count,
          metadata
        FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT 100
      `).bind(userId).all();

      for (const conversation of conversations.results) {
        const similarity = this.cosineSimilarity(queryEmbedding, conversation.embedding);
        
        if (similarity >= minSimilarity) {
          results.push({
            type: 'conversation',
            id: conversation.id,
            title: conversation.title || 'Untitled',
            messageCount: conversation.message_count,
            timestamp: new Date(conversation.updated_at * 1000),
            similarity: similarity,
            source: 'conversations',
          });
        }
      }
    } catch (error) {
      return [];
    }

    return results;
  }

  /**
   * Search memories by semantic similarity
   */
  static async searchMemories(db, userId, query, queryEmbedding, minSimilarity) {
    const results = [];

    try {
      const memories = await db.prepare(`
        SELECT 
          id,
          role,
          content,
          kind,
          tags,
          created_at,
          embedding
        FROM memories
        WHERE user_id = ? AND archived_at IS NULL
        ORDER BY created_at DESC
        LIMIT 200
      `).bind(userId).all();

      for (const memory of memories.results) {
        if (!memory.content || typeof memory.content !== 'string') {
          continue;
        }

        const similarity = this.cosineSimilarity(queryEmbedding, memory.embedding);
        
        if (similarity >= minSimilarity) {
          results.push({
            type: 'memory',
            id: memory.id,
            role: memory.role,
            content: memory.content.substring(0, 500) + (memory.content.length > 500 ? '...' : ''),
            kind: memory.kind,
            tags: memory.tags ? JSON.parse(memory.tags) : [],
            timestamp: new Date(memory.created_at * 1000),
            similarity: similarity,
            source: 'memories',
          });
        }
      }
    } catch (error) {
      console.warn('Memory search failed:', error.message);
      return [];
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(vectorA, vectorB) {
    if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      magnitudeA += vectorA[i] * vectorA[i];
      magnitudeB += vectorB[i] * vectorB[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }

  /**
   * Batch generate embeddings for text chunks
   */
  static async batchGenerateEmbeddings(texts, chunkSize = 512) {
    const embeddings = [];

    for (const text of texts) {
      if (!text || text.trim().length === 0) {
        embeddings.push(new Float32Array(768).fill(0));
        continue;
      }

      const chunks = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
      }

      const chunkEmbeddings = [];
      for (const chunk of chunks) {
        chunkEmbeddings.push(await this.generateEmbedding(chunk));
      }

      const avgEmbedding = new Float32Array(768).fill(0);
      for (const emb of chunkEmbeddings) {
        for (let i = 0; i < 768; i++) {
          avgEmbedding[i] += emb[i];
        }
      }

      const count = chunkEmbeddings.length;
      for (let i = 0; i < 768; i++) {
        avgEmbedding[i] /= count;
      }

      embeddings.push(avgEmbedding);
    }

    return embeddings;
  }
}