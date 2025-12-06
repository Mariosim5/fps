import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Genome, GenomeType } from '../models/simulation.model';

export interface GeminiEnemyResponse {
  name: string;
  genome: Genome;
  genomeType: GenomeType;
  modelUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // IMPORTANT: This uses a placeholder for the API key.
    // In a real application, this should be handled securely.
    const apiKey = (process.env as any).API_KEY;
    if (!apiKey) {
      console.error("API_KEY environment variable not set!");
      // Provide a dummy implementation or handle the error appropriately
      this.ai = null!;
      return;
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateEnemyConcept(): Promise<string> {
    if (!this.ai) {
      console.error("Gemini AI client is not initialized.");
      return "Default Mechanical Golem"; // A safe fallback
    }
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Invent a unique enemy concept for a fantasy/sci-fi action game. Be highly creative. The enemy can be anything from a possessed everyday object, a flying magical weapon, a corrupted natural creature (animal or tree), or an ethereal entity. Respond with only a short, evocative name for the creature (2-5 words). Examples: "Malevolent Floating Dagger", "Possessed Iron Chair", "Corrupted Forest Ancient", "Cybernetic Alpha Wolf", "Phase-Shifting Terror", "Arcane Sentry Crystal". Do not use quotes in your response.`,
        config: {
          temperature: 1.0,
          topP: 0.95,
          topK: 64,
        }
      });
      const concept = response.text.trim();
      if (!concept) {
        throw new Error("AI returned an empty concept.");
      }
      return concept;
    } catch (error) {
      console.error("Error generating enemy concept:", error);
      return "Corrupted Data Entity"; // Fallback concept
    }
  }

  async generateEnemy(prompt: string): Promise<Partial<GeminiEnemyResponse> | null> {
    if (!this.ai) {
      console.error("Gemini AI client is not initialized.");
      return null;
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "A cool, descriptive name for the creature."
        },
        genome: {
          type: Type.OBJECT,
          description: "The creature's genetic makeup. Stick to realistic values.",
          properties: {
            bodySize: { type: Type.NUMBER, description: "Size multiplier, from 0.5 (small) to 1.5 (large)." },
            speed: { type: Type.NUMBER, description: "Base movement speed, from 0.02 (slow) to 0.08 (fast)." },
            armor: { type: Type.NUMBER, description: "Damage reduction, from 0.0 (none) to 0.5 (50%)." },
            // Keeping these for schema consistency but asking the model to ignore them.
            numBuds: { type: Type.NUMBER, description: "Ignore this field, set to 0." },
            budSizeVariation: { type: Type.NUMBER, description: "Ignore this field, set to 0." },
            color: { type: Type.STRING, description: "Ignore this field, set to '#FFFFFF'." },
          },
          required: ["bodySize", "speed", "armor", "numBuds", "budSizeVariation", "color"]
        },
        genomeType: {
          type: Type.STRING,
          enum: ["organic", "mechanical", "hybrid", "magic"],
          description: "The classification of the creature."
        },
        modelUrl: {
          type: Type.STRING,
          description: "A direct URL to a public, free-to-use 3D model in GLB format that visually matches the prompt. Must be a full, direct HTTPS link ending in .glb."
        }
      },
      // modelUrl is not required, allowing for fallback
      required: ["name", "genome", "genomeType"]
    };

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Based on the following prompt, design a game enemy. Prompt: "${prompt}"`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const jsonText = response.text.trim();
      const responseObject = JSON.parse(jsonText);
      return responseObject as Partial<GeminiEnemyResponse>;

    } catch (error) {
      console.error("Error generating enemy with Gemini:", error);
      if (error instanceof Error) {
        throw new Error(`Generazione AI fallita: ${error.message}`);
      }
      throw new Error('Si è verificato un errore sconosciuto durante la generazione AI.');
    }
  }

  async findFallbackModelUrl(description: string): Promise<string | null> {
    if (!this.ai) {
      console.error("Gemini AI client is not initialized.");
      return null;
    }
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Find a direct URL to a free, public, downloadable 3D model in GLB format that matches this description: "${description}". Prioritize raw GitHub links, Quaternius, or Kenney.nl assets. Respond ONLY with the full, direct HTTPS URL ending in .glb.`,
      });
      
      const url = response.text.trim();
      // Basic validation to ensure we got a plausible URL
      if (url.startsWith('https') && url.endsWith('.glb')) {
        return url;
      }
      console.warn("Fallback search returned an invalid or empty URL:", url);
      return null;

    } catch (error) {
      console.error("Error finding fallback model URL:", error);
      return null;
    }
  }
}