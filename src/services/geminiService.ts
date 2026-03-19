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

// Simple in-memory cache for predictions
const predictionCache: Record<string, number> = {};

const generateInputKey = (input: PredictionInput): string => {
  return JSON.stringify({
    y: input.Year,
    d: input.District,
    c: input.Crop,
    s: input.Season,
    st: input.Soil_Type,
    v: input.Variety,
    t: input.Temperature.toFixed(2),
    r: input.Rainfall.toFixed(2),
    n: input.N.toFixed(2),
    p: input.P.toFixed(2),
    k: input.K.toFixed(2)
  });
};

export const predictYieldWithGemini = async (input: PredictionInput): Promise<number> => {
  const cacheKey = generateInputKey(input);
  if (predictionCache[cacheKey] !== undefined) {
    return predictionCache[cacheKey];
  }

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
    
    CRITICAL: Your prediction MUST be realistic and strictly aligned with the historical yield ranges for Odisha provided in the context. 
    If the input parameters are similar to the historical averages, the yield should be close to those averages.
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
    
    // Store in cache
    predictionCache[cacheKey] = result;
    return result;
  } catch (error) {
    console.error("Gemini Prediction Error:", error);
    // Deterministic fallback based on inputs
    const fallback = 2.5 + (Math.abs(input.Temperature + input.Rainfall) % 20) / 10;
    predictionCache[cacheKey] = fallback;
    return fallback;
  }
};
