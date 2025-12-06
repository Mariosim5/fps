import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Genome, GenomeType } from '../models/simulation.model';
import { GeminiThemeDefinition } from './scenario-factory.service';

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
          enum: ["organic", "mechanical", "hybrid", "magic", "custom"],
          description: "The classification of the creature. Use 'custom' for highly unusual or unclassifiable beings."
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
      
      const url = response.text?.trim();
      // Basic validation to ensure we got a plausible URL
      if (url && url.startsWith('https') && url.endsWith('.glb')) {
        return url;
      }
      console.warn("Fallback search returned an invalid or empty URL:", url || 'undefined response');
      return null;

    } catch (error) {
      console.error("Error finding fallback model URL:", error);
      return null;
    }
  }

  async generateScenario(
    availableAssets: { 
      floors: { name: string, url: string }[], 
      walls: { name: string, url: string }[], 
      decorations: { name: string, url: string }[] 
    }
  ): Promise<GeminiThemeDefinition | null> {
    if (!this.ai) {
      console.error("Gemini AI client is not initialized.");
      return null;
    }

    const schema: any = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, enum: ["ai-generated"] },
        name: { type: Type.STRING, description: "A creative and evocative name for the arena. E.g., 'The Obsidian Sanctum', 'Crystal Gardens of Lunara'." },
        description: { type: Type.STRING, description: "A brief, atmospheric description of the location." },
        skyColor: { type: Type.STRING, description: "A hex color code (e.g., '#1A2B3C') for the sky that matches the theme's mood." },
        floor: { type: Type.STRING, description: "The URL of the most fitting floor texture from the provided list.", enum: availableAssets.floors.map(f => f.url) },
        wall: { type: Type.STRING, description: "The URL of the most fitting wall texture from the provided list.", enum: availableAssets.walls.map(w => w.url) },
        decorations: {
          type: Type.ARRAY,
          description: "A list of decorations to place in the scene. Choose ONE model type from the provided list that best fits the theme.",
          items: {
            type: Type.OBJECT,
            properties: {
              url: { type: Type.STRING, description: "The URL of the chosen decoration model from the list.", enum: availableAssets.decorations.map(d => d.url) },
              scale: { type: Type.NUMBER, description: "A scale multiplier for the decoration, between 0.5 and 1.5." },
              positions: {
                type: Type.ARRAY,
                description: "An array of position and rotation data for placing 8-12 instances of this decoration along the sides of the arena. Arena walls are at x=-5 and x=5. Arena length is from z=-40 to z=40.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "An array of [x, y, z] coordinates. Y should be 0 for ground level." },
                    rotY: { type: Type.NUMBER, description: "The rotation around the Y axis in radians." }
                  },
                  required: ["pos", "rotY"]
                }
              }
            },
            required: ["url", "scale", "positions"]
          }
        }
      },
      required: ["id", "name", "description", "skyColor", "floor", "wall", "decorations"]
    };

    const prompt = `You are a creative world-builder for a dark fantasy video game. Design a unique and immersive combat arena.
    
    1.  Invent a compelling theme.
    2.  Give it a name and a short, atmospheric description.
    3.  Choose a matching sky color.
    4.  From the following lists of available assets, select ONE floor texture, ONE wall texture, and ONE type of decoration that best fit your theme.
    5.  Populate the scene with 8-12 instances of your chosen decoration, placing them along the sides of the arena. The arena is a corridor 10 units wide (from x=-5 to x=5) and 80 units long (from z=-40 to z=40). Keep decorations near the walls (e.g., x=-4.5 or x=4.5) so they don't block the path.

    **Available Assets:**
    Floors: ${JSON.stringify(availableAssets.floors)}
    Walls: ${JSON.stringify(availableAssets.walls)}
    Decorations: ${JSON.stringify(availableAssets.decorations)}
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.9,
        },
      });
      
      const jsonText = response.text.trim();
      const responseObject = JSON.parse(jsonText);
      // Ensure decorations array isn't empty, which can happen.
      if (!responseObject.decorations || responseObject.decorations.length === 0) {
        responseObject.decorations = []; // Default to empty if AI fails to provide any.
      }
      return responseObject as GeminiThemeDefinition;
    } catch (error) {
      console.error("Error generating scenario with Gemini:", error);
      return null;
    }
  }
}
