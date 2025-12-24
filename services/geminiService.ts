import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper to get the API client
const getAiClient = (apiKey?: string) => {
  const key = apiKey || localStorage.getItem('gemini_api_key') || process.env.API_KEY;
  if (!key) {
    throw new Error("API_KEY is missing. Please enter it in the Teacher Portal.");
  }
  return new GoogleGenAI({ apiKey: key });
};

/**
 * Transcribes audio using Gemini 2.5 Flash
 */
export const transcribeAudio = async (base64Audio: string, mimeType: string, apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: "Please transcribe this audio accurately. If it is an IELTS speaking test, organize the transcription by speaker."
          }
        ]
      }
    });

    return response.text || "No transcription generated.";
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
};

/**
 * Analyzes an image (e.g., essay, worksheet) using Gemini 2.5 Flash
 */
export const analyzeImage = async (base64Image: string, mimeType: string, prompt: string, apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Switched to Flash
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw error;
  }
};

/**
 * Generates content (Questions, Feedback, etc.) using Gemini 2.5 Flash
 */
export const generateContent = async (prompt: string, systemInstruction?: string, apiKey?: string): Promise<string> => {
  const ai = getAiClient(apiKey);

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text || "No content generated.";
  } catch (error) {
    console.error("Content generation error:", error);
    throw error;
  }
};

/**
 * Grades an IELTS Writing Essay (Task 1 or 2)
 */
export const gradeWritingTask = async (
    taskType: 'TASK_1' | 'TASK_2',
    promptText: string,
    studentEssay: string,
    chartImageBase64?: string,
    apiKey?: string
  ): Promise<any> => {
    const ai = getAiClient(apiKey);
    
    const parts: any[] = [];
  
    // Add Chart Image if Task 1
    if (taskType === 'TASK_1' && chartImageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/png', // Assuming PNG/JPEG, model is flexible
          data: chartImageBase64
        }
      });
    }
  
    const gradingPrompt = `
      You are an expert IELTS Examiner. Grade the following ${taskType} essay.
      
      Task Prompt: "${promptText}"
      
      Student Essay:
      "${studentEssay}"
      
      Evaluate based on the 4 IELTS criteria:
      1. Task Achievement (for Task 1) or Task Response (for Task 2)
      2. Coherence & Cohesion
      3. Lexical Resource
      4. Grammatical Range & Accuracy
      
      Return a PURE JSON object (no markdown formatting) with this structure:
      {
        "overallBand": number (0-9, in 0.5 increments),
        "criteria": {
          "taskAchievement": { "score": number, "comment": string },
          "coherenceCohesion": { "score": number, "comment": string },
          "lexicalResource": { "score": number, "comment": string },
          "grammaticalRange": { "score": number, "comment": string }
        },
        "correctedEssay": string (The student's essay but with HTML <span class="bg-red-100 text-red-800 line-through">error</span> <span class="bg-green-100 text-green-800 font-bold">correction</span> tags to highlight improvements),
        "generalComment": string
      }
    `;
  
    parts.push({ text: gradingPrompt });
  
    try {
      // Switched to Flash
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', 
        contents: { parts },
        config: {
            responseMimeType: 'application/json'
        }
      });
  
      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      // Parse JSON
      return JSON.parse(text);
    } catch (error) {
      console.error("Grading error:", error);
      throw error;
    }
  };

/**
 * Extracts Reading Passage and Questions from an image or PDF
 */
export const extractQuizFromImage = async (base64Data: string, mimeType: string = 'image/png', apiKey?: string): Promise<any> => {
  const ai = getAiClient(apiKey);
  
  const prompt = `
    You are an expert IELTS Data Extractor and Formatter. I will provide you with a document (image or PDF) of an IELTS Reading Test. You must convert this content into a strict JSON object that matches my application's TypeScript schema exactly.

    Here is the TypeScript schema your output MUST conform to:
    \`\`\`typescript
    type TaskType = 
      | 'MCQ' 
      | 'FILL_IN_BLANKS' 
      | 'NOTES_COMPLETION' 
      | 'TRUE_FALSE_NG' 
      | 'YES_NO_NG' 
      | 'MATCHING_HEADINGS' 
      | 'MATCHING_FEATURES' 
      | 'MATCHING_INFORMATION' 
      | 'MATCHING_SENTENCE_ENDINGS';

    interface Question {
      text: string;
      correctAnswer?: string;
      options?: string[];
      type: TaskType; // CRITICAL: Each question must have a type matching its group
    }

    interface QuestionGroup {
      type: TaskType;
      title: string;
      instruction: string;
      headingList?: string[];
      matchOptions?: string[];
      content?: string;
      questions: Question[];
    }

    interface ExtractedQuiz {
      passageContent: string;
      questionGroups: QuestionGroup[];
    }
    \`\`\`

    CRITICAL FORMATTING RULES:
    1.  **Passage Content:** Format the reading text as clean HTML. Use <p> for paragraphs and <h2> for subheadings.
    2.  **Question Numbers:** REMOVE all question numbers (e.g., "1.", "24.", "Question 7") from the 'text' field of each question. The 'text' field should only contain the semantic content.
    3.  **MCQ Options:** Put options in the 'options' array. REMOVE the letter labels (A, B, C) from the string itself.
        - BAD: ["A. London", "B. Paris"]
        - GOOD: ["London", "Paris"]
    4.  **Notes/Summary Completion:** Use the 'content' field in the QuestionGroup. Embed the answer key directly in the text using square brackets []. Do NOT create individual questions in the 'questions' array for this type.
        - Example 'content': "The process begins when the [sun] heats the ocean."
    5.  **Matching Headings:** Extract the list of headings (i, ii, iii...) into the 'headingList' field on the QuestionGroup. The 'questions' array should contain items where 'text' is the paragraph identifier (e.g., "Paragraph A") and 'correctAnswer' is the Roman numeral (e.g., "iv").
    6.  **Matching Features/Endings:** Extract the list of options (A, B, C...) into the 'matchOptions' field on the QuestionGroup. The 'questions' array contains the statements, and 'correctAnswer' is the letter (e.g., "A").
    7.  **Question Type Inheritance:** Ensure every single object in the 'questions' array has a 'type' field that is identical to its parent 'QuestionGroup' type. This is mandatory.
    
    Output Format:
    Return ONLY the raw JSON object. Do not wrap it in markdown. Do not add any conversational text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Switched to Flash
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("Extraction error:", error);
    throw error;
  }
};