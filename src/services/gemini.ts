import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function verifyIdentity(imageBuffer: string): Promise<{ verified: boolean; reason?: string }> {
  try {
    const model = "gemini-3-flash-preview";
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: "Analyze this image for identity verification. Is there exactly one person visible? Are they looking at the camera?" },
          { inlineData: { mimeType: "image/jpeg", data: imageBuffer } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified: {
              type: Type.BOOLEAN,
              description: "True if exactly one person is visible and looking at the camera."
            },
            reason: {
              type: Type.STRING,
              description: "Reason for the verification result."
            }
          },
          required: ["verified"]
        }
      }
    });

    let text = response.text || "{}";
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(text);
    return result;
  } catch (error) {
    console.error("Gemini verification error:", error);
    return { verified: false, reason: "Verification service error" };
  }
}

export async function monitorFrame(imageBuffer: string): Promise<{ violations: string[] }> {
  try {
    const model = "gemini-3-flash-preview";
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: "Analyze this proctoring frame for exam integrity. Check for: 1. Multiple people in frame. 2. No person in frame. 3. Gaze detection: Is the person looking away from the screen? 4. Object detection: Are there unauthorized objects like mobile phones, smartphones, tablets, books, or notes? Pay special attention to mobile phones. If any of these are detected, return a specific violation message. If everything is fine, return an empty array." },
          { inlineData: { mimeType: "image/jpeg", data: imageBuffer } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            violations: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              },
              description: "List of detected violations."
            }
          },
          required: ["violations"]
        }
      }
    });

    let text = response.text || "{}";
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(text);
    return result;
  } catch (error) {
    console.error("Gemini monitoring error:", error);
    return { violations: [] };
  }
}

export async function generateQuestions(prompt: string): Promise<any[]> {
  try {
    const model = "gemini-3-flash-preview";
    const response = await ai.models.generateContent({
      model,
      contents: `Generate exam questions based on this prompt: "${prompt}". Return an array of question objects.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description: "Must be one of: 'objective', 'subjective', 'coding'"
              },
              text: {
                type: Type.STRING,
                description: "The question text"
              },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 4 options for objective questions"
              },
              correctAnswer: {
                type: Type.STRING,
                description: "The exact string of the correct option for objective questions"
              },
              points: {
                type: Type.NUMBER,
                description: "Points for this question (e.g., 5, 10, 20)"
              },
              testCases: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    input: { type: Type.STRING },
                    expectedOutput: { type: Type.STRING }
                  },
                  required: ["input", "expectedOutput"]
                },
                description: "Test cases for coding questions"
              }
            },
            required: ["type", "text", "points"]
          }
        }
      }
    });

    let text = response.text || "[]";
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(text);
    return result;
  } catch (error) {
    console.error("Gemini question generation error:", error);
    return [];
  }
}
