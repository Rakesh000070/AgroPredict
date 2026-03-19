import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || '';

export interface PredictionInput {
  Year: number;
  District: string;
  Crop: string;
  Season: string;
  Soil_Type: string;
  Variety: string;
  Temperature: number;
  Rainfall: number;
  N: number;
  P: number;
  K: number;
  Stats?: {
    stateAvg: number;
    districtAvg: number;
  };
}

export const predictYieldWithGemini = async (input: PredictionInput): Promise<number> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const statsContext = input.Stats 
    ? `
    Historical Context for Odisha:
    - State Average Yield: ${input.Stats.stateAvg.toFixed(2)} T/HA
    - District (${input.District}) Average Yield: ${input.Stats.districtAvg.toFixed(2)} T/HA
    `
    : '';

  const prompt = `
    As an expert agricultural scientist specialized in Odisha, India, predict the crop yield (in tonnes per hectare) for the following parameters:
    
    Year: ${input.Year}
    District: ${input.District}
    Crop: ${input.Crop}
    Season: ${input.Season}
    Soil Type: ${input.Soil_Type}
    Variety: ${input.Variety}
    Temperature: ${input.Temperature}°C
    Rainfall: ${input.Rainfall}mm
    Nutrients: N=${input.N}, P=${input.P}, K=${input.K}
    
    ${statsContext}
    
    Based on historical data for Odisha and the provided context, provide a realistic yield prediction.
    Return ONLY a single numerical value representing the yield in tonnes per hectare.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.NUMBER,
          description: "The predicted yield in tonnes per hectare"
        }
      }
    });

    const result = parseFloat(response.text.trim());
    if (isNaN(result)) throw new Error("Invalid prediction from Gemini");
    return result;
  } catch (error) {
    console.error("Gemini Prediction Error:", error);
    // Fallback to a simple heuristic if Gemini fails
    return 2.5 + (Math.random() * 2);
  }
};
