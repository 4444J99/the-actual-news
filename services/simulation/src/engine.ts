import { query } from './db.js';
import { LLMPromptBuilder } from './generator.js';
import { newId } from "shared";

export class SimulationEngine {
  async tick() {
    console.log('[sim-engine] Tick started');

    // T010: Query sim_threads to find active threads
    const activeThreadsRes = await query(`SELECT thread_id, story_id FROM sim_threads WHERE status = 'active'`);
    
    for (const thread of activeThreadsRes.rows) {
      await this.processThread(thread.thread_id, thread.story_id);
    }

    // T013: Run Environment Rules Evaluator
    await this.evaluateEnvironmentRules();

    console.log('[sim-engine] Tick completed');
  }

  async evaluateEnvironmentRules() {
    // Find active threads that are too deep (e.g. > 10 turns)
    const deepThreadsRes = await query(`
      SELECT t.thread_id, th.story_id, COUNT(*) as turn_count 
      FROM sim_conversational_turns t
      JOIN sim_threads th ON t.thread_id = th.thread_id
      WHERE th.status = 'active'
      GROUP BY t.thread_id, th.story_id
      HAVING COUNT(*) > 10
    `);

    for (const thread of deepThreadsRes.rows) {
      console.log(`[sim-engine] Thread ${thread.thread_id} reached depth ${thread.turn_count}. Splitting/Spawning!`);
      
      // T014: Select top personas (mocking "top" by just getting a few active ones)
      const personasRes = await query(`
        SELECT p.persona_id, p.handle, p.traits
        FROM sim_personas p
        JOIN sim_conversational_turns t ON t.persona_id = p.persona_id
        WHERE t.thread_id = $1
        LIMIT 2
      `, [thread.thread_id]);

      // T015: Clone and Mutate
      const newThreadId = newId();
      await query(`
        INSERT INTO sim_threads (thread_id, story_id, platform_id, status)
        VALUES ($1, $2, $3, 'active')
      `, [newThreadId, thread.story_id, process.env.PLATFORM_ID ?? 'unknown']);

      for (const p of personasRes.rows) {
        const mutatedPersonaId = newId();
        const mutatedTraits = { ...p.traits, generation: (p.traits.generation || 1) + 1 };
        
        await query(`
          INSERT INTO sim_personas (persona_id, handle, traits)
          VALUES ($1, $2, $3)
        `, [mutatedPersonaId, p.handle + '_v2', mutatedTraits]);

        await query(`
          INSERT INTO sim_conversational_turns (turn_id, thread_id, persona_id, parent_turn_id, content, referenced_claim_ids)
          VALUES ($1, $2, $3, NULL, $4, $5)
        `, [newId(), newThreadId, mutatedPersonaId, 'I am carrying this conversation over.', '[]']);
      }

      // Close the old thread
      await query(`UPDATE sim_threads SET status = 'archived' WHERE thread_id = $1`, [thread.thread_id]);
    }
  }

  async processThread(threadId: string, storyId: string) {
    // T011: Retrieve recent turns
    const recentTurnsRes = await query(`
      SELECT t.turn_id, t.persona_id, t.content, p.handle, p.traits 
      FROM sim_conversational_turns t
      JOIN sim_personas p ON t.persona_id = p.persona_id
      WHERE t.thread_id = $1
      ORDER BY t.created_at DESC
      LIMIT 10
    `, [threadId]);

    const recentTurns = recentTurnsRes.rows;

    if (recentTurns.length === 0) return; // No conversation to continue

    // Find personas involved in this thread
    const personasRes = await query(`
      SELECT DISTINCT p.persona_id, p.handle, p.traits
      FROM sim_conversational_turns t
      JOIN sim_personas p ON t.persona_id = p.persona_id
      WHERE t.thread_id = $1
    `, [threadId]);

    const personasInvolved = personasRes.rows;

    // Pick a random persona to speak next
    const nextPersona = personasInvolved[Math.floor(Math.random() * personasInvolved.length)];

    // T012: Integrate claim/evidence verification logic
    // For now we simulate an LLM call to generate a response from nextPersona
    // based on the recent context and their traits.

    const newTurn = await this.generateResponse(nextPersona, recentTurns, storyId);

    if (newTurn) {
      await query(`
        INSERT INTO sim_conversational_turns (turn_id, thread_id, persona_id, parent_turn_id, content, referenced_claim_ids)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [newTurn.turn_id, threadId, newTurn.persona_id, newTurn.parent_turn_id, newTurn.content, '[]' /* no claims for now */]);

      console.log(`[sim-engine] New turn by ${nextPersona.handle} in thread ${threadId}: ${newTurn.content.substring(0, 50)}...`);
    }
  }

  async generateResponse(persona: any, recentContext: any[], storyId: string) {
    // In a real system, we'd prompt the LLM to generate a response from 'persona' 
    // to the most recent turn in 'recentContext'.
    
    // Mock generation
    const parentTurn = recentContext[0]; // Respond to the most recent message
    return {
      turn_id: newId(),
      persona_id: persona.persona_id,
      parent_turn_id: parentTurn.turn_id,
      content: `@${parentTurn.handle} I disagree with that entirely. My ${persona.traits.personality} approach leads me to think otherwise.`,
    };
  }
}

export const engine = new SimulationEngine();

export function startEngineTick(intervalMs = 15000) {
  setInterval(() => {
    engine.tick().catch(err => {
      console.error('[sim-engine] error during tick:', err);
    });
  }, intervalMs);
}
