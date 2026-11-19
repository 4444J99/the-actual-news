import { query } from './db.js';
import { newId } from "shared";

export class PersonaGenerator {
  static async generatePersonas(count: number, storyContext: string) {
    // In a real system, we would prompt the LLM: 
    // "Given the following story, generate ${count} diverse personas who would have strong, contrasting opinions about it.
    // Story: ${storyContext}"
    
    // For now, we mock the generation
    const personas = [];
    const alignments = ['progressive', 'conservative', 'libertarian', 'centrist', 'contrarian', 'populist'];
    const traits = ['analytical', 'emotional', 'skeptical', 'optimistic', 'cynical', 'pragmatic'];
    
    for (let i = 0; i < count; i++) {
      const alignment = alignments[Math.floor(Math.random() * alignments.length)];
      const trait = traits[Math.floor(Math.random() * traits.length)];
      personas.push({
        persona_id: newId(),
        handle: `user_${newId().slice(0, 6).toLowerCase()}`,
        traits: { alignment, personality: trait },
        created_at: new Date().toISOString()
      });
    }
    return personas;
  }
}

export class LLMPromptBuilder {
  static async generateInitialTurn(persona: any, storyId: string, bodyMarkdown: string) {
    // In a real system, we would prompt the LLM:
    // "You are a persona with traits: ${JSON.stringify(persona.traits)}.
    // Read this news story and write a short, opinionated reaction (under 280 characters).
    // Story: ${bodyMarkdown}"
    
    return {
      turn_id: newId(),
      persona_id: persona.persona_id,
      content: `I am feeling very ${persona.traits.personality} about this. From a ${persona.traits.alignment} perspective, this news is significant.`,
      referenced_claim_ids: []
    };
  }
}

export async function generateInitialPersonasAndTurns(storyId: string, bodyMarkdown: string) {
  // 1. Check if we already have a thread for this story
  const threadRes = await query(`SELECT thread_id FROM sim_threads WHERE story_id = $1 LIMIT 1`, [storyId]);
  let threadId = threadRes.rows[0]?.thread_id;
  
  if (!threadId) {
    threadId = newId();
    await query(`
      INSERT INTO sim_threads (thread_id, story_id, platform_id, status)
      VALUES ($1, $2, $3, 'active')
    `, [threadId, storyId, process.env.PLATFORM_ID ?? 'unknown']);
  } else {
    // Thread already exists, maybe skip or add more personas
    console.log(`Thread ${threadId} already exists for story ${storyId}`);
    return;
  }

  // 2. Generate N Personas
  const NUM_PERSONAS = 5;
  const personas = await PersonaGenerator.generatePersonas(NUM_PERSONAS, bodyMarkdown || "Breaking news");
  
  // 3. Save Personas
  for (const p of personas) {
    await query(`
      INSERT INTO sim_personas (persona_id, handle, traits)
      VALUES ($1, $2, $3)
    `, [p.persona_id, p.handle, p.traits]);
  }
  
  // 4. Generate & Save Initial Turns
  for (const p of personas) {
    const turn = await LLMPromptBuilder.generateInitialTurn(p, storyId, bodyMarkdown || "");
    
    await query(`
      INSERT INTO sim_conversational_turns (turn_id, thread_id, persona_id, parent_turn_id, content, referenced_claim_ids)
      VALUES ($1, $2, $3, NULL, $4, $5)
    `, [turn.turn_id, threadId, p.persona_id, turn.content, JSON.stringify(turn.referenced_claim_ids)]);
    
    console.log(`[sim] Created turn ${turn.turn_id} by ${p.handle} on thread ${threadId}`);
  }
}
